package types

// NotificationPayload represents the message consumed from the notification.dispatch Kafka topic.
type NotificationPayload struct {
	ActionType     string `json:"actionType"`
	NotificationID string `json:"notificationId"`
	TenantID       string `json:"tenantId"`
	EventID        string `json:"eventId"`
	TraceID        string `json:"traceId"`
	UserID         string `json:"userId"`
	Recipient      string `json:"recipient"`
	SenderEmail    string `json:"senderEmail"`
	SenderName     string `json:"senderName"`
	Subject        string `json:"subject"`
	Body           string `json:"body"`
	Provider       string `json:"provider"`
	ProviderConfigID string `json:"providerConfigId"`
	WsChannel      string `json:"wsChannel"`
	Category       string `json:"category"`
	EventType      string `json:"eventType"`

	ResolvedAPIKey string `json:"-"`
}

// DeliveryResult is the standardized response from any channel adapter.
type DeliveryResult struct {
	Success        bool
	ProviderRef    string
	Error          error
	RetryableError bool // Signals to DLQ whether retry is appropriate
}

// RetryMessage wraps a failed payload with retry metadata for the notification.retry topic.
type RetryMessage struct {
	OriginalPayload NotificationPayload `json:"originalPayload"`
	RetryCount      int                 `json:"retryCount"`
	MaxRetries      int                 `json:"maxRetries"`
	LastError       string              `json:"lastError"`
	NextRetryAt     int64               `json:"nextRetryAt"` // Unix timestamp
}

// DLQMessage is published to notification.dlq when a notification permanently fails.
type DLQMessage struct {
	OriginalPayload NotificationPayload `json:"originalPayload"`
	RetryCount      int                 `json:"retryCount"`
	MaxRetries      int                 `json:"maxRetries"`
	LastError       string              `json:"lastError"`
	NotificationID  string              `json:"notificationId"`
	TenantID        string              `json:"tenantId"`
	EventID         string              `json:"eventId"`
	TraceID         string              `json:"traceId"`
	Channel         string              `json:"channel"`
}
