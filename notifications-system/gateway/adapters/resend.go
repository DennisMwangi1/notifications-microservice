package adapters

import (
	"fmt"
	"log"
	"strings"

	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/types"
	"github.com/resend/resend-go/v2"
)

// ResendAdapter handles email delivery through the Resend API.
type ResendAdapter struct {
	defaultClient *resend.Client
}

// NewResendAdapter creates a new Resend email adapter with a default API key.
func NewResendAdapter(defaultAPIKey string) *ResendAdapter {
	return &ResendAdapter{
		defaultClient: resend.NewClient(defaultAPIKey),
	}
}

func (a *ResendAdapter) Name() string {
	return "ResendEmail"
}

func (a *ResendAdapter) Send(payload types.NotificationPayload) types.DeliveryResult {
	fromEmail := payload.SenderEmail
	if fromEmail == "" {
		fromEmail = "onboarding@resend.dev"
	}
	fromName := payload.SenderName
	if fromName == "" {
		fromName = "Notification System"
	}

	fmt.Printf("📧 [%s] Sending EMAIL to %s...\n", a.Name(), payload.Recipient)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("%s <%s>", fromName, fromEmail),
		To:      []string{payload.Recipient},
		Subject: payload.Subject,
		Html:    payload.Body,
	}

	// Use tenant-specific API key if provided (BYOP), otherwise use default
	clientToUse := a.defaultClient
	if payload.APIKey != "" {
		clientToUse = resend.NewClient(payload.APIKey)
	}

	sent, err := clientToUse.Emails.Send(params)
	if err != nil {
		log.Printf("❌ [%s] Failed to send email to %s: %v\n", a.Name(), payload.Recipient, err)

		// Determine if the error is retryable
		retryable := isRetryableError(err)

		return types.DeliveryResult{
			Success:        false,
			Error:          err,
			RetryableError: retryable,
		}
	}

	fmt.Printf("✅ [%s] Successfully sent EMAIL to %s! Resend ID: %s\n", a.Name(), payload.Recipient, sent.Id)

	return types.DeliveryResult{
		Success:     true,
		ProviderRef: sent.Id,
	}
}

// isRetryableError determines whether an error from an email provider is transient
// (and thus worth retrying) or permanent (and should go directly to DLQ).
func isRetryableError(err error) bool {
	errMsg := err.Error()

	// Permanent errors — do NOT retry
	permanentPatterns := []string{
		"invalid",
		"not found",
		"unauthorized",
		"forbidden",
		"unsubscribed",
		"blocked",
	}
	for _, pattern := range permanentPatterns {
		if strings.Contains(strings.ToLower(errMsg), pattern) {
			return false
		}
	}

	// Everything else is assumed retryable (rate limits, timeouts, server errors)
	return true
}
