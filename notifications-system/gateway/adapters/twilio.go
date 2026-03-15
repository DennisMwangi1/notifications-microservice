package adapters

import (
	"fmt"
	"time"

	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/types"
)

// TwilioAdapter handles SMS delivery through the Twilio API.
// Currently simulated — to be implemented when Twilio SDK is integrated.
type TwilioAdapter struct {
	accountSID string
	authToken  string
}

// NewTwilioAdapter creates a new Twilio SMS adapter.
func NewTwilioAdapter(accountSID, authToken string) *TwilioAdapter {
	return &TwilioAdapter{
		accountSID: accountSID,
		authToken:  authToken,
	}
}

func (a *TwilioAdapter) Name() string {
	return "TwilioSMS"
}

func (a *TwilioAdapter) Send(payload types.NotificationPayload) types.DeliveryResult {
	fmt.Printf("📱 [%s] Sending SMS to %s...\n", a.Name(), payload.Recipient)

	// TODO: Replace with actual Twilio REST API integration
	// Using simulation for now until Twilio SDK is properly integrated
	time.Sleep(500 * time.Millisecond)

	providerRef := fmt.Sprintf("twilio_sim_%d", time.Now().Unix())
	fmt.Printf("✅ [%s] Successfully sent SMS to %s (simulated)\n", a.Name(), payload.Recipient)

	return types.DeliveryResult{
		Success:     true,
		ProviderRef: providerRef,
	}
}
