package adapters

import (
	"fmt"
	"strings"

	"github.com/centrifugal/gocent/v3"
)

// Registry holds all registered channel adapters and resolves the correct one
// based on ActionType + Provider combination.
type Registry struct {
	adapters map[string]ChannelAdapter
}

// NewRegistry creates and initializes the adapter registry with all available adapters.
func NewRegistry(resendAPIKey, sendGridAPIKey, twilioSID, twilioToken string, centrifugoClient *gocent.Client) *Registry {
	r := &Registry{
		adapters: make(map[string]ChannelAdapter),
	}

	// Register email adapters
	resendAdapter := NewResendAdapter(resendAPIKey)
	r.adapters["EMAIL:RESEND"] = resendAdapter
	r.adapters["EMAIL:DEFAULT"] = resendAdapter // Resend is the default email provider

	sendGridAdapter := NewSendGridAdapter(sendGridAPIKey)
	r.adapters["EMAIL:SENDGRID"] = sendGridAdapter

	// Register SMS adapters
	twilioAdapter := NewTwilioAdapter(twilioSID, twilioToken)
	r.adapters["SMS:TWILIO"] = twilioAdapter
	r.adapters["SMS:DEFAULT"] = twilioAdapter // Twilio is the default SMS provider

	// Register real-time adapter
	centrifugoAdapter := NewCentrifugoAdapter(centrifugoClient)
	r.adapters["REALTIME:DEFAULT"] = centrifugoAdapter
	r.adapters["REALTIME:CENTRIFUGO"] = centrifugoAdapter

	return r
}

// Resolve returns the correct adapter for a given ActionType and Provider.
// Resolution order:
//  1. Exact match: ActionType:Provider (e.g., "EMAIL:RESEND")
//  2. Default fallback: ActionType:DEFAULT (e.g., "EMAIL:DEFAULT")
//
// Returns nil if no adapter is found.
func (r *Registry) Resolve(actionType, provider string) ChannelAdapter {
	actionType = strings.ToUpper(actionType)
	provider = strings.ToUpper(provider)

	// 1. Try exact match
	if provider != "" {
		key := fmt.Sprintf("%s:%s", actionType, provider)
		if adapter, ok := r.adapters[key]; ok {
			return adapter
		}
	}

	// 2. Fall back to default for this action type
	defaultKey := fmt.Sprintf("%s:DEFAULT", actionType)
	if adapter, ok := r.adapters[defaultKey]; ok {
		return adapter
	}

	return nil
}

// ListAdapters returns a list of all registered adapter keys (for debugging/admin).
func (r *Registry) ListAdapters() []string {
	keys := make([]string, 0, len(r.adapters))
	for k := range r.adapters {
		keys = append(keys, k)
	}
	return keys
}
