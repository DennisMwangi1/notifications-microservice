# Integration Guide: Utilizing the Notifications Microservice

Welcome! This guide is designed for engineering teams who need to integrate with the Central Notifications Microservice.

By integrating with this service, your application gains the ability to send **Emails**, **SMS**, and **Real-Time In-App popups (via WebSockets)** without having to install third-party SDKs, manage SMTP servers, or scale your own WebSocket infrastructure.

---

## 1. How It Works (The TL;DR)

The Notifications Microservice follows a strict philosophy: **You provide the data; we handle the delivery.**

1. **You trigger an event:** When something happens in your app (e.g., a service is applied, an order is placed), your backend makes a simple HTTP POST request to our webhook.
2. **We compile the templates:** We look at database templates tied to your project, merge your data into HTML/SMS/In-App content, and decouple execution through internal messaging.
3. **We deliver it everywhere:** We dispatch Email, SMS, and Real-time UI popup jobs using the tenant's configured providers and channel templates, with Centrifugo used for real-time in-app delivery.

---

## 2. Prerequisites & Onboarding

Before you can write any code, you need to be onboarded onto the Notifications Engine. Request the following from the Core Notifications Team:

1. **Tenant API Key (BACKEND ONLY):** Your privileged secret key used to trigger notification webhooks. **Never expose this to a browser.** Keep it in your backend server's `.env` file.
2. **Tenant ID (FRONTEND IDENTIFIER):** Your tenant UUID identifier. Your frontend uses this ID when requesting realtime tokens and when scoping notification-history requests. Treat it as a non-secret identifier, but do **not** assume tenantId alone is sufficient authorization for user data.
3. **Webhook Secret (OPTIONAL - HIGH SECURITY):** An optional secret used to sign your webhook payloads with HMAC-SHA256. If you configure a secret, the server will reject any request that does not include a valid `X-Nucleus-Signature` header.
4. **Template Configurations:** Work with the Notifications Team to define which events you will fire and which templates should be active for Email, SMS, or In-App Push.

---

## 3. Global Templates We Currently Support

The worker supports **global templates** by resolving any event type that starts with `global.` against active templates where `tenant_id = null`.

### 3.1 Current Standard Global Event Types

These are the standard global template categories currently used in the system design and tenant integration flows:

| `eventType` | Typical Meaning | Common Channel Usage |
| :--- | :--- | :--- |
| `global.info` | Informational update, normal workflow progress, non-critical success state | Push, Email |
| `global.success` | Positive completion or approval outcome | Push, Email |
| `global.warning` | Reminder, upcoming deadline, or cautionary status | Push, Email |
| `global.alert` | Important issue, rejection, compliance alert, or urgent state | Push, Email |

### 3.2 Additional Supported Global Category

The current in-app notification styling logic also recognizes:

| `eventType` | Meaning | Notes |
| :--- | :--- | :--- |
| `global.error` | System or workflow failure state | Supported by category handling in the worker if a matching active template is configured |

### 3.3 Important Notes About Global Templates

- A `global.*` event only works if a matching active template exists in the database.
- Global templates are reusable across tenants because they are not tied to a specific `tenant_id`.
- You can still create tenant-specific event types such as `service.applied` or `tmaas.chat.new_message` when you need custom copy or behavior.
- For Email-enabled global events, include `recipientEmail` in the payload.
- For SMS-enabled global events, include `recipientPhone` in the payload.
- For Push-enabled global events, include `userId` in the payload.

### 3.4 Recommended Payload Shape for Global Templates

For the standard global templates, the safest payload is:

```json
{
  "eventType": "global.info",
  "payload": {
    "userId": "uuid-of-the-recipient",
    "recipientEmail": "user@example.com",
    "recipientPhone": "+12345678900",
    "title": "Service Request Created",
    "message": "Your request has been received and is now under review."
  }
}
```

Use `title` and `message` as the baseline content fields for generic global templates unless your content team has explicitly configured different variables.

---

## 4. Step 1: Triggering Events from Your Backend

Whenever a business event occurs that requires user notification, your server should make an HTTPS request to the microservice.

**Important:** The engine does not enforce your app's user notification preferences. **You** must check whether the user has opted in before hitting this endpoint.

### API Endpoint: `POST /api/v1/events/trigger`

**Headers:**
```http
Content-Type: application/json
x-api-key: YOUR_SECRET_TENANT_API_KEY
```

**Request Body:**
```json
{
  "eventType": "service.applied",
  "payload": {
    "userId": "uuid-of-the-recipient",
    "serviceName": "Premium Subscription",
    "recipientEmail": "user@example.com",
    "recipientPhone": "+12345678900",
    "amount": "$49.99"
  }
}
```

*Note: Any arbitrary keys you pass inside `payload` (like `serviceName` or `amount`) can be injected into your dynamic templates by the microservice.*

### 4.1 Webhook HMAC Security (Optional but Recommended)

For production environments, the service supports signature verification to ensure requests truly originated from your backend.

1. **Configure a Secret:** Provide your project's Webhook Secret to the Notifications Team.
2. **Sign Your Payload:** Generate an HMAC-SHA256 hash of your **raw JSON request body** using your secret as the key.
3. **Send in Header:** Include the resulting hex string in the `X-Nucleus-Signature` header.

**Headers:**
```http
Content-Type: application/json
x-api-key: YOUR_SECRET_TENANT_API_KEY
X-Nucleus-Signature: <your_computed_hmac_hex>
```

Refer to the [SDK Helpers Guide](./SDK-Helpers.md) for a ready-to-use TypeScript snippet for signing your payloads.

### 4.2 Idempotency & Retries

To prevent duplicate notifications when your system retries a failed webhook, the microservice supports idempotency.

By default, the engine derives an idempotency key from the combination of **tenantId + eventType + payload**. If it sees the same effective request within the deduplication window, it will safely ignore the duplicate and return a cached success response.

**Overriding Idempotency (Retriggering a Broadcast)**

If you intentionally want to resend a duplicate notification within the deduplication window (for example, a reminder), provide a unique idempotency key:

```http
X-Idempotency-Key: your-unique-uuid-12345
```

---

## 5. Step 2: Email and SMS Delivery (Optional)

If your Content Team has configured an **EMAIL** or **SMS** template for your event in the Admin UI, the microservice needs to know exactly where to send it.

Because the engine is completely decoupled from your database, **you** must provide the user's contact information dynamically inside the `payload` object when firing the webhook.

If a template is active for either channel, ensure these specific keys are included in your webhook:

```json
{
  "eventType": "service.applied",
  "payload": {
    "userId": "uuid-of-the-recipient",
    "recipientEmail": "customer@example.com",
    "recipientPhone": "+12345678900",
    "amount": "$49.99",
    "serviceName": "Premium Subscription"
  }
}
```

**Important:** The current worker implementation expects `recipientEmail` for EMAIL templates and `recipientPhone` for SMS templates. If you omit one of these fields, downstream dispatch may still be attempted with a fallback placeholder value, so your integration should validate these fields before calling the webhook.

---

## 6. Step 3: Implementing Real-Time UI Popups (Frontend)

*If your project only uses the microservice for Email and SMS delivery, you can skip this step. WebSockets are used exclusively for live In-App Push notifications.*

To display live pop-up notifications as soon as your backend fires an In-App event, your frontend (React, Vue, Angular) needs to connect to the **Centrifugo WebSocket Server**.

### 6.1 Requesting a Real-Time Token

Your frontend cannot connect to Centrifugo directly. It must first request a secure JSON Web Token (JWT) from the Auth bridge.

**API Endpoint:** `POST /api/v1/auth/realtime-token`

**Request Body:**
```json
{
  "tenantId": "YOUR_TENANT_ID",
  "userId": "uuid-of-the-logged-in-user"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUz...",
  "channels": [
    "global_system#uuid-of-the-logged-in-user",
    "tmaas_alerts#uuid-of-the-logged-in-user"
  ]
}
```

### 6.2 Connecting to the WebSocket Pipe

Install the `centrifuge` JavaScript SDK in your frontend application. Pass the generated JWT, and subscribe to each channel returned by the API.

```javascript
import { Centrifuge } from 'centrifuge';

const centrifuge = new Centrifuge('ws://notifications.yourdomain.com/connection/websocket', {
  token: response.token
});

response.channels.forEach((channelName) => {
  const sub = centrifuge.newSubscription(channelName);

  sub.on('publication', function (ctx) {
    console.log('New Live Notification Received!', ctx.data);
    showToast(ctx.data.title, ctx.data.body);
  });

  sub.subscribe();
});

centrifuge.connect();
```

---

## 7. Step 4: Integrating the Notification Bell History (Frontend)

What happens if the user was offline when you triggered the event? The microservice automatically persists the in-app notification in PostgreSQL.

Your frontend can implement a notification bell that loads this history on login or page refresh.

### 7.1 Fetching Notification History

When your application loads, hit this endpoint to populate the user's notification feed.

**Current behavior:** this endpoint returns the latest notifications for that tenant/user pair (up to 50 records), ordered newest first. It is **not** currently filtered to `UNREAD` only.

**API Endpoint:** `GET /api/v1/notifications/{tenantId}/{userId}`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notif-uuid-1",
      "type": "service.applied",
      "title": "Service properly applied",
      "body": "Your Premium Subscription is active.",
      "status": "UNREAD",
      "created_at": "2026-03-11T12:00:00Z"
    }
  ]
}
```

### 7.2 Marking a Notification as Read

When the user clicks on a notification in the UI feed, call the read endpoint so the item can be marked as read.

**API Endpoint:** `PUT /api/v1/notifications/{tenantId}/{userId}/{notificationId}/read`

No request body is required.

**Example Response:**
```json
{
  "success": true,
  "message": "Notification marked as READ"
}
```

If the notification is not found for that tenant/user combination, the API currently responds with:

```json
{
  "success": false,
  "message": "Notification not found or access denied."
}
```

---

## 8. Project Checklist

Before moving to production, ensure your project team has validated:

- [ ] You are not exposing your Tenant API Key in client-side frontend code.
- [ ] Your backend correctly filters out users who have opted out of alerts before calling the webhook.
- [ ] Your backend validates `recipientEmail` and `recipientPhone` before calling `POST /api/v1/events/trigger` for EMAIL/SMS-enabled events.
- [ ] Your backend uses the appropriate `global.*` event types when routing through reusable global templates.
- [ ] Your frontend requests a new Centrifugo token upon user login and token refresh flows.
- [ ] Your frontend does not rely on `tenantId` alone as proof of authorization for user notification history.
- [ ] The `payload` object structure you send in the webhook matches the variable structure defined in your approved templates.
