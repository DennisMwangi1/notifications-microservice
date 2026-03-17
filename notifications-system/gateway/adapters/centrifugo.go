package adapters

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"regexp"
	"time"

	"github.com/DennisMwangi1/notifications-microservice-gateway/gateway/types"
	"github.com/centrifugal/gocent/v3"
)

var stripHTMLRegex = regexp.MustCompile(`<[^>]*>`)

func sanitizeHTML(input string) string {
	unescaped := html.UnescapeString(input)
	return stripHTMLRegex.ReplaceAllString(unescaped, "")
}

// CentrifugoAdapter handles real-time in-app push notifications through Centrifugo WebSockets.
type CentrifugoAdapter struct {
	client *gocent.Client
}

// NewCentrifugoAdapter creates a new Centrifugo realtime adapter.
func NewCentrifugoAdapter(client *gocent.Client) *CentrifugoAdapter {
	return &CentrifugoAdapter{client: client}
}

func (a *CentrifugoAdapter) Name() string {
	return "CentrifugoRealtime"
}

func (a *CentrifugoAdapter) Send(payload types.NotificationPayload) types.DeliveryResult {
	channelName := payload.WsChannel
	if channelName == "" {
		channelName = fmt.Sprintf("global_system#%s", payload.UserID)
	}

	// Build the realtime message payload with category and eventType for frontend styling
	realtimeMsg := map[string]interface{}{
		"type":        "IN_APP_ALERT",
		"title":       sanitizeHTML(payload.Subject),
		"body":        sanitizeHTML(payload.Body),
		"category":    payload.Category,
		"eventType":   payload.EventType,
		"timestamp":   time.Now().Unix(),
		"referenceId": payload.NotificationID,
	}

	msgBytes, err := json.Marshal(realtimeMsg)
	if err != nil {
		log.Printf("❌ [%s] Failed to marshal realtime message: %v\n", a.Name(), err)
		return types.DeliveryResult{
			Success:        false,
			Error:          err,
			RetryableError: false,
		}
	}

	_, err = a.client.Publish(context.Background(), channelName, msgBytes)
	if err != nil {
		log.Printf("❌ [%s] Failed to push event to Centrifugo (%s): %v\n", a.Name(), channelName, err)
		return types.DeliveryResult{
			Success:        false,
			Error:          err,
			RetryableError: true, // Centrifugo failures are typically transient
		}
	}

	fmt.Printf("🚀 [%s] Successfully pushed REALTIME event to %s [%s]\n", a.Name(), channelName, payload.Category)

	return types.DeliveryResult{
		Success:     true,
		ProviderRef: channelName,
	}
}
