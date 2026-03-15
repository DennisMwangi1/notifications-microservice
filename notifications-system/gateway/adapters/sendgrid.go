package adapters

import (
	"fmt"

	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/types"
)

// SendGridAdapter handles email delivery through the SendGrid API.
// Currently a stub — to be implemented when SendGrid SDK is integrated.
type SendGridAdapter struct {
	apiKey string
}

// NewSendGridAdapter creates a new SendGrid email adapter.
func NewSendGridAdapter(apiKey string) *SendGridAdapter {
	return &SendGridAdapter{apiKey: apiKey}
}

func (a *SendGridAdapter) Name() string {
	return "SendGridEmail"
}

func (a *SendGridAdapter) Send(payload types.NotificationPayload) types.DeliveryResult {
	fmt.Printf("📧 [%s] SendGrid integration not yet implemented. Payload for %s dropped.\n", a.Name(), payload.Recipient)

	return types.DeliveryResult{
		Success:        false,
		Error:          fmt.Errorf("SendGrid adapter not yet implemented"),
		RetryableError: false, // Not retryable — it's a missing implementation
	}
}
