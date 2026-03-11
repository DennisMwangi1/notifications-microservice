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
	"github.com/segmentio/kafka-go"
)

type NotificationPayload struct {
	ActionType     string `json:"actionType"`
	NotificationID string `json:"notificationId"`
	UserID         string `json:"userId"`
	Recipient      string `json:"recipient"`
	Subject        string `json:"subject"`
	Body           string `json:"body"`
	Provider       string `json:"provider"`
	WsChannel      string `json:"wsChannel"`
}

func main() {
	// Connect to Database
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

	// 1a. Configure Centrifugo client
	centrifugoAPIKey := os.Getenv("CENTRIFUGO_API_KEY")
	if centrifugoAPIKey == "" {
		centrifugoAPIKey = "a2aacce4575007dc18c1c2b5b1174f08" // Default from .env
	}
	cClient := gocent.New(gocent.Config{
		Addr: "http://localhost:8000/api",
		Key:  centrifugoAPIKey,
	})
	fmt.Println("Centrifugo HTTP Client initialized")

	// 2. Configure the kafka reader
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  []string{"localhost:9092"},
		Topic:    "notification.dispatch",
		GroupID:  "go-gateway-group",
		MinBytes: 1,    // 10KB
		MaxBytes: 10e6, // 10MB
	})

	fmt.Println("Go gateway is standing by for dispatch")

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
				// If the context was cancelled, break the loop
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

			// Add to waitgroup and execute processNotification concurrently
			wg.Add(1)
			go func(p NotificationPayload, database *sql.DB, c *gocent.Client) {
				defer wg.Done()
				processNotification(p, database, c)
			}(payload, db, cClient)
		}
	}()

	// Block main thread until a signal is received
	<-sigchan
	fmt.Println("\nTermination signal received. Shutting down gracefully...")

	// Cancel context to stop reading new messages
	cancel()

	// Close the reader so it properly leaves the group
	if err := reader.Close(); err != nil {
		log.Printf("Failed to close kafka reader: %v", err)
	}

	// Wait for all ongoing emails to finish sending, with a timeout
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

func processNotification(payload NotificationPayload, db *sql.DB, cClient *gocent.Client) {

	// BRANCH A: Email Operations
	if payload.ActionType == "EMAIL" {
		fmt.Printf("📧 Sending EMAIL to %s via %s...\n", payload.Recipient, payload.Provider)
		time.Sleep(2 * time.Second) // Simulated API call
		fmt.Printf("✅ Successfully sent EMAIL to %s!\n", payload.Recipient)
		updateAuditLog(payload.NotificationID, db, "SENT")
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
			// Failsafe channel
			channelName = fmt.Sprintf("global_system#%s", payload.UserID)
		}

		realtimeMsg := map[string]interface{}{
			"type":        "IN_APP_ALERT",
			"title":       payload.Subject,
			"body":        payload.Body,
			"timestamp":   time.Now().Unix(),
			"referenceId": payload.NotificationID,
		}

		msgBytes, _ := json.Marshal(realtimeMsg)

		_, err := cClient.Publish(context.Background(), channelName, msgBytes)
		if err != nil {
			log.Printf("❌ Failed to push event to Centrifugo (%s): %v\n", channelName, err)
		} else {
			fmt.Printf("🚀 Successfully pushed REALTIME event to %s\n", channelName)
		}
	} else {
		fmt.Printf("⚠️ Unknown ActionType Received: %s\n", payload.ActionType)
	}
}

// updateAuditLog abstracts the postgres DB update for external providers
func updateAuditLog(notificationID string, db *sql.DB, status string) {
	if notificationID != "" {
		providerRef := "sim_" + fmt.Sprintf("%d", time.Now().Unix()) // Simulated provider reference ID
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
