-- 1. User Preferences Table
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY,
    channels JSONB NOT NULL DEFAULT '{"email": true, "sms": false, "push": true}',
    categories JSONB NOT NULL DEFAULT '{"orders": true, "marketing": true}',
    timezone VARCHAR(50) DEFAULT 'UTC',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Templates Table (Versioned)
CREATE TYPE channel_enum AS ENUM ('EMAIL', 'SMS', 'PUSH');

CREATE TABLE templates (
    template_id VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    channel_type channel_enum NOT NULL,
    subject_line VARCHAR(255),
    content_body TEXT NOT NULL, -- Stores MJML or Handlebars
    locale VARCHAR(10) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (template_id, version)
);

-- 3. Notification Logs (Audit Trail)
CREATE TYPE status_enum AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

CREATE TABLE notification_logs (
    notification_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    template_id VARCHAR(100) NOT NULL,
    channel channel_enum NOT NULL,
    status status_enum DEFAULT 'PENDING',
    metadata JSONB, -- Stores event data like { "order_id": "123" }
    provider_ref VARCHAR(255), -- ID from SendGrid/Twilio
    sent_at TIMESTAMP,
    error_details TEXT
);