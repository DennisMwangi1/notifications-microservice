package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/adapters"
	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/types"

	"github.com/centrifugal/gocent/v3"
	_ "github.com/lib/pq"
	"github.com/segmentio/kafka-go"
)

// Retry backoff schedule (in seconds)
var retryBackoffSeconds = []int{60, 300, 900, 3600} // 1min, 5min, 15min, 1hr
const maxRetries = 5

func main() {
	// ─── Database Connection ────────────────────────────
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatalf("DB_URL environment variable is required and must be provided via environment variable or secret management")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Printf("Warning: Database ping failed: %v", err)
	}
	fmt.Println("Connected to PostgreSQL for Audit Logs")

	// ─── Centrifugo Client ──────────────────────────────
	centrifugoURL := os.Getenv("CENTRIFUGO_API_URL")
	if centrifugoURL == "" {
		centrifugoURL = "http://localhost:8000/api"
	}
	centrifugoAPIKey := os.Getenv("CENTRIFUGO_API_KEY")
	cClient := gocent.New(gocent.Config{
		Addr: centrifugoURL,
		Key:  centrifugoAPIKey,
	})
	fmt.Printf("Centrifugo HTTP Client initialized → %s\n", centrifugoURL)

	// ─── Kafka Config ───────────────────────────────────
	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "localhost:9092"
	}

	// ─── Initialize Adapter Registry ────────────────────
	resendAPIKey := os.Getenv("RESEND_API_KEY")
	sendGridAPIKey := os.Getenv("SENDGRID_API_KEY")
	twilioSID := os.Getenv("TWILIO_ACCOUNT_SID")
	twilioToken := os.Getenv("TWILIO_AUTH_TOKEN")

	registry := adapters.NewRegistry(resendAPIKey, sendGridAPIKey, twilioSID, twilioToken, cClient)
	fmt.Printf("Channel Adapter Registry initialized with adapters: %v\n", registry.ListAdapters())

	// ─── Kafka Writers (Producers) for Retry & DLQ ──────
	retryWriter := &kafka.Writer{
		Addr:     kafka.TCP(kafkaBroker),
		Topic:    "notification.retry",
		Balancer: &kafka.LeastBytes{},
	}
	defer retryWriter.Close()

	dlqWriter := &kafka.Writer{
		Addr:     kafka.TCP(kafkaBroker),
		Topic:    "notification.dlq",
		Balancer: &kafka.LeastBytes{},
	}
	defer dlqWriter.Close()

	// ─── Kafka Readers (Consumers) ──────────────────────
	dispatchReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  []string{kafkaBroker},
		Topic:    "notification.dispatch",
		GroupID:  "go-gateway-group",
		MinBytes: 1,
		MaxBytes: 10e6,
	})

	retryReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  []string{kafkaBroker},
		Topic:    "notification.retry",
		GroupID:  "go-gateway-retry-group",
		MinBytes: 1,
		MaxBytes: 10e6,
	})

	fmt.Printf("Go gateway is standing by for dispatch (Kafka: %s)\n", kafkaBroker)

	// ─── Graceful Shutdown ──────────────────────────────
	sigchan := make(chan os.Signal, 1)
	signal.Notify(sigchan, syscall.SIGINT, syscall.SIGTERM)

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	// ─── Dispatch Consumer (primary) ────────────────────
	go func() {
		for {
			message, err := dispatchReader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("error reading dispatch message: %v", err)
				continue
			}

			var payload types.NotificationPayload
			if err := json.Unmarshal(message.Value, &payload); err != nil {
				log.Printf("Failed to unmarshal dispatch message: %v", err)
				continue
			}

			if err := validatePayload(payload); err != nil {
				log.Printf("Rejecting malformed dispatch message: %v", err)
				continue
			}

			wg.Add(1)
			go func(p types.NotificationPayload) {
				defer wg.Done()
				processWithAdapters(p, db, registry, retryWriter, dlqWriter, 0)
			}(payload)
		}
	}()

	// ─── Retry Consumer ─────────────────────────────────
	go func() {
		for {
			message, err := retryReader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("error reading retry message: %v", err)
				continue
			}

			var retryMsg types.RetryMessage
			if err := json.Unmarshal(message.Value, &retryMsg); err != nil {
				log.Printf("Failed to unmarshal retry message: %v", err)
				continue
			}

			if err := validatePayload(retryMsg.OriginalPayload); err != nil {
				log.Printf("Rejecting malformed retry message: %v", err)
				continue
			}

			// Wait for the backoff delay before re-processing
			now := time.Now().Unix()
			if retryMsg.NextRetryAt > now {
				waitDuration := time.Duration(retryMsg.NextRetryAt-now) * time.Second
				fmt.Printf("⏳ Retry #%d for %s: waiting %v before re-dispatch\n",
					retryMsg.RetryCount, retryMsg.OriginalPayload.NotificationID, waitDuration)
				time.Sleep(waitDuration)
			}

			wg.Add(1)
			go func(rm types.RetryMessage) {
				defer wg.Done()
				processWithAdapters(rm.OriginalPayload, db, registry, retryWriter, dlqWriter, rm.RetryCount)
			}(retryMsg)
		}
	}()

	// ─── Block until signal ─────────────────────────────
	<-sigchan
	fmt.Println("\nTermination signal received. Shutting down gracefully...")

	cancel()

	if err := dispatchReader.Close(); err != nil {
		log.Printf("Failed to close dispatch kafka reader: %v", err)
	}
	if err := retryReader.Close(); err != nil {
		log.Printf("Failed to close retry kafka reader: %v", err)
	}

	// Wait for all ongoing dispatches to finish, with a timeout
	c := make(chan struct{})
	go func() {
		defer close(c)
		wg.Wait()
	}()

	select {
	case <-c:
		fmt.Println("All ongoing dispatches completed.")
	case <-time.After(15 * time.Second):
		fmt.Println("Timeout waiting for dispatches to complete. Forcing shutdown.")
	}

	fmt.Println("Go gateway shutdown complete.")
}

// processWithAdapters resolves the correct adapter from the registry,
// dispatches the notification, and handles failures via retry/DLQ topics.
func processWithAdapters(
	payload types.NotificationPayload,
	db *sql.DB,
	registry *adapters.Registry,
	retryWriter *kafka.Writer,
	dlqWriter *kafka.Writer,
	currentRetryCount int,
) {
	fmt.Printf("📦 Processing: ActionType=%s, Provider=%s, NotificationID=%s (retry #%d)\n",
		payload.ActionType, payload.Provider, payload.NotificationID, currentRetryCount)

	resolvedPayload, err := hydrateProviderConfig(db, payload)
	if err != nil {
		log.Printf("⚠️ Failed to resolve tenant provider config for notification %s: %v\n", payload.NotificationID, err)
		publishToDLQ(dlqWriter, payload, currentRetryCount, err.Error())
		updateAuditLog(payload.NotificationID, payload.TenantID, db, "FAILED")
		return
	}

	// Resolve the correct adapter
	adapter := registry.Resolve(resolvedPayload.ActionType, resolvedPayload.Provider)
	if adapter == nil {
		log.Printf("⚠️ No adapter found for ActionType=%s, Provider=%s\n", resolvedPayload.ActionType, resolvedPayload.Provider)
		// No adapter = permanent failure, send directly to DLQ
		publishToDLQ(dlqWriter, resolvedPayload, currentRetryCount, "No adapter registered for this ActionType/Provider combination")
		updateAuditLog(resolvedPayload.NotificationID, resolvedPayload.TenantID, db, "FAILED")
		return
	}

	// Dispatch through the adapter
	result := adapter.Send(resolvedPayload)

	if result.Success {
		// Update audit log with success
		if result.ProviderRef != "" {
			updateAuditLogWithRef(resolvedPayload.NotificationID, resolvedPayload.TenantID, db, "SENT", result.ProviderRef)
		} else {
			updateAuditLog(resolvedPayload.NotificationID, resolvedPayload.TenantID, db, "SENT")
		}
		return
	}

	// ─── Handle Failure ─────────────────────────────────
	errorMsg := "unknown error"
	if result.Error != nil {
		errorMsg = result.Error.Error()
	}

	if result.RetryableError && currentRetryCount < maxRetries {
		// Publish to notification.retry with backoff
		publishToRetry(retryWriter, resolvedPayload, currentRetryCount, errorMsg)
		updateAuditLog(resolvedPayload.NotificationID, resolvedPayload.TenantID, db, "RETRYING")
	} else {
		// Permanent failure or max retries exceeded → DLQ
		if currentRetryCount >= maxRetries {
			errorMsg = fmt.Sprintf("Max retries (%d) exceeded. Last error: %s", maxRetries, errorMsg)
		}
		publishToDLQ(dlqWriter, resolvedPayload, currentRetryCount, errorMsg)
		updateAuditLog(resolvedPayload.NotificationID, resolvedPayload.TenantID, db, "FAILED")
	}
}

// publishToRetry publishes a failed notification to the retry topic with backoff metadata.
func publishToRetry(writer *kafka.Writer, payload types.NotificationPayload, currentRetryCount int, lastError string) {
	nextRetry := currentRetryCount + 1
	backoffIndex := currentRetryCount
	if backoffIndex >= len(retryBackoffSeconds) {
		backoffIndex = len(retryBackoffSeconds) - 1
	}
	nextRetryAt := time.Now().Unix() + int64(retryBackoffSeconds[backoffIndex])

	retryMsg := types.RetryMessage{
		OriginalPayload: payload,
		RetryCount:      nextRetry,
		MaxRetries:      maxRetries,
		LastError:       lastError,
		NextRetryAt:     nextRetryAt,
	}

	msgBytes, _ := json.Marshal(retryMsg)

	err := writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(composeKafkaKey(payload)),
		Value: msgBytes,
	})

	if err != nil {
		log.Printf("❌ Failed to publish to notification.retry: %v\n", err)
	} else {
		fmt.Printf("🔄 Retry #%d queued for %s (next attempt at +%ds)\n",
			nextRetry, payload.NotificationID, retryBackoffSeconds[backoffIndex])
	}
}

// publishToDLQ publishes a permanently failed notification to the dead letter queue.
func publishToDLQ(writer *kafka.Writer, payload types.NotificationPayload, retryCount int, lastError string) {
	dlqMsg := types.DLQMessage{
		OriginalPayload: payload,
		RetryCount:      retryCount,
		MaxRetries:      maxRetries,
		LastError:       lastError,
		NotificationID:  payload.NotificationID,
		TenantID:        payload.TenantID,
		EventID:         payload.EventID,
		TraceID:         payload.TraceID,
		Channel:         payload.ActionType,
	}

	msgBytes, _ := json.Marshal(dlqMsg)

	err := writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(composeKafkaKey(payload)),
		Value: msgBytes,
	})

	if err != nil {
		log.Printf("❌ Failed to publish to notification.dlq: %v\n", err)
	} else {
		fmt.Printf("💀 DLQ: Notification %s moved to dead letter queue after %d retries\n",
			payload.NotificationID, retryCount)
	}
}

// updateAuditLog updates the notification_logs table with the dispatch status.
func updateAuditLog(notificationID, tenantID string, db *sql.DB, status string) {
	if notificationID != "" {
		providerRef := "sim_" + fmt.Sprintf("%d", time.Now().Unix())
		err := withTenantTx(db, tenantID, func(tx *sql.Tx) error {
			_, execErr := tx.Exec(`
				UPDATE notification_logs 
				SET status = $1, sent_at = NOW(), provider_ref = $2 
				WHERE notification_id = $3 AND tenant_id = $4`,
				status, providerRef, notificationID, tenantID)
			return execErr
		})

		if err != nil {
			log.Printf("Failed to update audit log for %s: %v\n", notificationID, err)
		} else {
			fmt.Printf("Audit log updated to %s for %s\n", status, notificationID)
		}
	}
}

// updateAuditLogWithRef updates the audit log with a real provider reference ID.
func updateAuditLogWithRef(notificationID, tenantID string, db *sql.DB, status string, providerRef string) {
	if notificationID != "" {
		err := withTenantTx(db, tenantID, func(tx *sql.Tx) error {
			_, execErr := tx.Exec(`
				UPDATE notification_logs 
				SET status = $1, sent_at = NOW(), provider_ref = $2 
				WHERE notification_id = $3 AND tenant_id = $4`,
				status, providerRef, notificationID, tenantID)
			return execErr
		})

		if err != nil {
			log.Printf("Failed to update audit log for %s: %v\n", notificationID, err)
		} else {
			fmt.Printf("Audit log updated to %s for %s\n", status, notificationID)
		}
	}
}

func composeKafkaKey(payload types.NotificationPayload) string {
	if payload.TenantID != "" && payload.EventID != "" {
		return fmt.Sprintf("%s:%s", payload.TenantID, payload.EventID)
	}
	return payload.NotificationID
}

func validatePayload(payload types.NotificationPayload) error {
	if payload.TenantID == "" {
		return errors.New("tenantId is required")
	}
	if payload.EventID == "" {
		return errors.New("eventId is required")
	}
	if payload.TraceID == "" {
		return errors.New("traceId is required")
	}
	if payload.NotificationID == "" {
		return errors.New("notificationId is required")
	}
	if payload.ActionType == "" {
		return errors.New("actionType is required")
	}
	return nil
}

func hydrateProviderConfig(db *sql.DB, payload types.NotificationPayload) (types.NotificationPayload, error) {
	if payload.ProviderConfigID == "" || strings.EqualFold(payload.ActionType, "REALTIME") {
		return payload, nil
	}

	type providerConfigRecord struct {
		provider      string
		ciphertext    string
		senderEmail   sql.NullString
		senderName    sql.NullString
	}

	var record providerConfigRecord
	err := withTenantTx(db, payload.TenantID, func(tx *sql.Tx) error {
		return tx.QueryRow(`
			SELECT provider, api_key_ciphertext, sender_email, sender_name
			FROM provider_configs
			WHERE id = $1 AND tenant_id = $2
		`, payload.ProviderConfigID, payload.TenantID).Scan(
			&record.provider,
			&record.ciphertext,
			&record.senderEmail,
			&record.senderName,
		)
	})

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return payload, fmt.Errorf("provider config %s not found for tenant %s", payload.ProviderConfigID, payload.TenantID)
		}
		return payload, err
	}

	decryptedAPIKey, err := decryptProviderSecret(record.ciphertext)
	if err != nil {
		return payload, err
	}

	hydrated := payload
	hydrated.Provider = record.provider
	hydrated.ResolvedAPIKey = decryptedAPIKey
	if record.senderEmail.Valid {
		hydrated.SenderEmail = record.senderEmail.String
	}
	if record.senderName.Valid {
		hydrated.SenderName = record.senderName.String
	}

	return hydrated, nil
}

func withTenantTx(db *sql.DB, tenantID string, callback func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}

	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`
		SELECT
			set_config('app.current_actor_type', 'system', true),
			set_config('app.current_actor_id', 'go-gateway', true),
			set_config('app.current_tenant_id', $1, true)
	`, tenantID); err != nil {
		return err
	}

	if err = callback(tx); err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return err
	}

	tx = nil
	return nil
}

func decryptProviderSecret(ciphertext string) (string, error) {
	parts := strings.Split(ciphertext, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed provider ciphertext")
	}

	iv, err := decodeBase64(parts[0])
	if err != nil {
		return "", err
	}
	authTag, err := decodeBase64(parts[1])
	if err != nil {
		return "", err
	}
	encrypted, err := decodeBase64(parts[2])
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(resolveEncryptionKey())
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	plaintext, err := gcm.Open(nil, iv, append(encrypted, authTag...), nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func decodeBase64(value string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(value)
}

func resolveEncryptionKey() []byte {
	baseSecret := os.Getenv("CONFIG_ENCRYPTION_KEY")
	if baseSecret == "" {
		baseSecret = os.Getenv("ADMIN_JWT_SECRET")
	}
	if baseSecret == "" {
		baseSecret = "notifications-default-encryption-key"
	}
	sum := sha256.Sum256([]byte(baseSecret))
	return sum[:]
}
