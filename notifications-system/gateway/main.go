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

	_ "github.com/lib/pq"
	"github.com/segmentio/kafka-go"
)

type NotificationPayload struct {
	NotificationID string `json:"notificationId"`
	Recipient      string `json:"recipient"`
	Subject        string `json:"subject"`
	Body           string `json:"body"`
	Provider       string `json:"provider"`
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

	// 1. Configure the kafka reader
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

			// Add to waitgroup and execute sendEmail concurrently
			wg.Add(1)
			go func(p NotificationPayload, database *sql.DB) {
				defer wg.Done()
				sendEmail(p, database)
			}(payload, db)
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

func sendEmail(payload NotificationPayload, db *sql.DB) {
	fmt.Printf("Sending %s to %s via %s...\n", payload.Subject, payload.Recipient, payload.Provider)

	// Simulating external HTTP request delay
	time.Sleep(2 * time.Second)

	fmt.Printf("Successfully sent to %s!\n", payload.Recipient)

	// Update audit log
	if payload.NotificationID != "" {
		providerRef := "sim_" + fmt.Sprintf("%d", time.Now().Unix()) // Simulated provider reference
		_, err := db.Exec(`
			UPDATE notification_logs 
			SET status = 'SENT', sent_at = NOW(), provider_ref = $1 
			WHERE notification_id = $2`,
			providerRef, payload.NotificationID)

		if err != nil {
			log.Printf("Failed to update audit log for %s: %v\n", payload.NotificationID, err)
		} else {
			fmt.Printf("Audit log updated to SENT for %s\n", payload.NotificationID)
		}
	} else {
		fmt.Println("Warning: No notificationId provided, skipping audit log update.")
	}
}
