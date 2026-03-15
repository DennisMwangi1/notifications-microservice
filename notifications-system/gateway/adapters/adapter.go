package adapters

import (
	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/types"
)

// ChannelAdapter is the interface that all notification delivery providers must implement.
// Each adapter handles a single delivery mechanism (email, SMS, push, etc.).
type ChannelAdapter interface {
	// Send dispatches the notification through the provider.
	// Returns a DeliveryResult indicating success/failure and whether retry is appropriate.
	Send(payload types.NotificationPayload) types.DeliveryResult

	// Name returns a human-readable identifier for this adapter (e.g., "ResendEmail", "TwilioSMS").
	Name() string
}
