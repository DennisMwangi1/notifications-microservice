package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/centrifugal/gocent/v3"
	_ "github.com/lib/pq"
	"github.com/resend/resend-go/v2"
	"github.com/segmentio/kafka-go"
)

// R8: Updated struct to include Category and EventType fields forwarded by the NestJS worker
type NotificationPayload struct {
	ActionType     string `json:"actionType"`
	NotificationID string `json:"notificationId"`
	TenantID       string `json:"tenantId"`
	UserID         string `json:"userId"`
	Recipient      string `json:"recipient"`
	SenderEmail    string `json:"senderEmail"`
	SenderName     string `json:"senderName"`
	Subject        string `json:"subject"`
	Body           string `json:"body"`
	Provider       string `json:"provider"`
	WsChannel      string `json:"wsChannel"`
	Category       string `json:"category"`
	EventType      string `json:"eventType"`
}

func main() {
	// R3: All addresses resolved from environment variables with sensible defaults
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = "postgres://admin:password@localhost:5432/notification_db?sslmode=disable"
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

	// Initialize Resend Client
	resendAPIKey := os.Getenv("RESEND_API_KEY")
	if resendAPIKey == "" {
		resendAPIKey = "re_Q8AGvT6y_NJbKrpcey1ke4dRq7HhQhMFe"
	}
	resendClient := resend.NewClient(resendAPIKey)

	// R3: Centrifugo address from environment
	centrifugoURL := os.Getenv("CENTRIFUGO_API_URL")
	if centrifugoURL == "" {
		centrifugoURL = "http://localhost:8000/api"
	}
	centrifugoAPIKey := os.Getenv("CENTRIFUGO_API_KEY")
	if centrifugoAPIKey == "" {
		centrifugoAPIKey = "a2aacce4575007dc18c1c2b5b1174f08"
	}
	cClient := gocent.New(gocent.Config{
		Addr: centrifugoURL,
		Key:  centrifugoAPIKey,
	})
	fmt.Printf("Centrifugo HTTP Client initialized → %s\n", centrifugoURL)

	// R3: Kafka broker address from environment
	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "localhost:9092"
	}
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  []string{kafkaBroker},
		Topic:    "notification.dispatch",
		GroupID:  "go-gateway-group",
		MinBytes: 1,
		MaxBytes: 10e6,
	})
	fmt.Printf("Go gateway is standing by for dispatch (Kafka: %s)\n", kafkaBroker)

	// Set up channel to listen for Interrupt or Terminate signals
	sigchan := make(chan os.Signal, 1)
	signal.Notify(sigchan, syscall.SIGINT, syscall.SIGTERM)

	// Context to control reader loop
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	// Start reading in a background goroutine
	go func() {
		for {
			message, err := reader.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("error reading message: %v", err)
				continue
			}

			var payload NotificationPayload
			if err := json.Unmarshal(message.Value, &payload); err != nil {
				log.Printf("Failed to unmarshal: %v", err)
				continue
			}

			wg.Add(1)
			go func(p NotificationPayload, database *sql.DB, c *gocent.Client, r *resend.Client) {
				defer wg.Done()
				processNotification(p, database, c, r)
			}(payload, db, cClient, resendClient)
		}
	}()

	// Block main thread until a signal is received
	<-sigchan
	fmt.Println("\nTermination signal received. Shutting down gracefully...")

	cancel()

	if err := reader.Close(); err != nil {
		log.Printf("Failed to close kafka reader: %v", err)
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
	case <-time.After(10 * time.Second):
		fmt.Println("Timeout waiting for dispatches to complete. Forcing shutdown.")
	}

	fmt.Println("Go gateway shutdown complete.")
}

func processNotification(payload NotificationPayload, db *sql.DB, cClient *gocent.Client, resendClient *resend.Client) {
	fmt.Printf("Full Payload: %v\n", payload)

	// BRANCH A: Email Operations
	if payload.ActionType == "EMAIL" {
		fromEmail := payload.SenderEmail
		if fromEmail == "" {
			fromEmail = "onboarding@resend.dev"
		}
		fromName := payload.SenderName
		if fromName == "" {
			fromName = "Notification System"
		}

		fmt.Printf("📧 Sending EMAIL to %s via Resend...\n", payload.Recipient)

		params := &resend.SendEmailRequest{
			From:    fmt.Sprintf("%s <%s>", fromName, fromEmail),
			To:      []string{payload.Recipient},
			Subject: payload.Subject,
			Html:    payload.Body,
		}

		sent, err := resendClient.Emails.Send(params)
		if err != nil {
			log.Printf("❌ Failed to send email to %s: %v\n", payload.Recipient, err)
			updateAuditLog(payload.NotificationID, db, "FAILED")
			// Optional: store error details in logs if we had an error column
			return
		}

		fmt.Printf("✅ Successfully sent EMAIL to %s! Resend ID: %s\n", payload.Recipient, sent.Id)
		updateAuditLogWithRef(payload.NotificationID, db, "SENT", sent.Id)

	} else if payload.ActionType == "SMS" {
		// BRANCH B: SMS Operations
		fmt.Printf("📱 Sending SMS to %s via %s...\n", payload.Recipient, payload.Provider)
		time.Sleep(1 * time.Second) // Simulated API call
		fmt.Printf("✅ Successfully sent SMS to %s!\n", payload.Recipient)
		updateAuditLog(payload.NotificationID, db, "SENT")
	} else if payload.ActionType == "REALTIME" {
		// BRANCH C: Real-Time Centrifugo Routing
		channelName := payload.WsChannel
		if channelName == "" {
			channelName = fmt.Sprintf("global_system#%s", payload.UserID)
		}

		// R8: Forward category and eventType to the frontend for visual styling
		realtimeMsg := map[string]interface{}{
			"type":        "IN_APP_ALERT",
			"title":       payload.Subject,
			"body":        payload.Body,
			"category":    payload.Category,
			"eventType":   payload.EventType,
			"timestamp":   time.Now().Unix(),
			"referenceId": payload.NotificationID,
		}

		msgBytes, _ := json.Marshal(realtimeMsg)

		_, err := cClient.Publish(context.Background(), channelName, msgBytes)
		if err != nil {
			log.Printf("❌ Failed to push event to Centrifugo (%s): %v\n", channelName, err)
		} else {
			fmt.Printf("🚀 Successfully pushed REALTIME event to %s [%s]\n", channelName, payload.Category)
		}
	} else {
		fmt.Printf("⚠️ Unknown ActionType Received: %s\n", payload.ActionType)
	}
}

// updateAuditLog abstracts the postgres DB update for external providers
func updateAuditLog(notificationID string, db *sql.DB, status string) {
	if notificationID != "" {
		providerRef := "sim_" + fmt.Sprintf("%d", time.Now().Unix())
		_, err := db.Exec(`
			UPDATE notification_logs 
			SET status = $1, sent_at = NOW(), provider_ref = $2 
			WHERE notification_id = $3`,
			status, providerRef, notificationID)

		if err != nil {
			log.Printf("Failed to update audit log for %s: %v\n", notificationID, err)
		} else {
			fmt.Printf("Audit log updated to %s for %s\n", status, notificationID)
		}
	}
}

// updateAuditLogWithRef specifically handles updating with an external provider reference
func updateAuditLogWithRef(notificationID string, db *sql.DB, status string, providerRef string) {
	if notificationID != "" {
		_, err := db.Exec(`
			UPDATE notification_logs 
			SET status = $1, sent_at = NOW(), provider_ref = $2 
			WHERE notification_id = $3`,
			status, providerRef, notificationID)

		if err != nil {
			log.Printf("Failed to update audit log for %s: %v\n", notificationID, err)
		} else {
			fmt.Printf("Audit log updated to %s for %s\n", status, notificationID)
		}
	}
}
