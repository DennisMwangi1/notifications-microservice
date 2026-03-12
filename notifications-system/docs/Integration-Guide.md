# Integration Guide: Utilizing the Notifications Microservice

Welcome! This guide is designed for engineering teams (e.g., E-commerce, Fintech, TMaaS) who need to integrate with the Central Notifications Microservice. 

By integrating with this service, your application gains the ability to seamlessly send **Emails**, **SMS**, and **Real-Time In-App popups (via WebSockets)** without having to install third-party SDKs, manage SMTP servers, or scale your own WebSocket infrastructure.

---

## 1. How It Works (The TL;DR)

The Notifications Microservice follows a strict philosophy: **You provide the data; we handle the delivery.**

1. **You trigger an event:** When something happens in your app (e.g., a service is applied, an order is placed), your backend makes a simple HTTP POST request to our webhook.
2. **We compile the designs:** We look at database templates specifically tied to your project, merge your data into our beautiful HTML/SMS formats, and decouple the execution.
3. **We deliver it everywhere:** We blast the Email via SendGrid, the SMS via Twilio, and the Real-time UI popup via Centrifugo—simultaneously.

---

## 2. Prerequisites & Onboarding

Before you can write any code, you need to be onboarded onto the Notifications Engine. Request the following from the Core Notifications Team:

1. **Tenant API Key (BACKEND ONLY):** Your heavily privileged secret key used to launch email/push webhooks. **Never expose this to a browser.** Keep this safely hidden in your backend server's `.env` file.
2. **Tenant ID (PUBLIC FRONTEND):** Your public UUID identifier. Because you cannot expose your secret API Key to a browser, your React/Angular frontend uses this ID to safely fetch users' unread notification history (`GET /api/v1/notifications/{tenantId}/{userId}`). It poses zero security risk.
3. **Template Configurations:** Sit down with the Notifications Team to define what events you will fire (e.g., `service.applied`) and design the corresponding Templates (Email MJML, plain text SMS, or short JSON for In-App Push).

---

## 3. Step 1: Triggering Events from Your Backend

Whenever a business event occurs that requires user notification, your server should make an HTTPS request to the Microservice. 

**Important:** Our engine ignores user preferences. **You** must check if your user has opted-in to notifications *before* hitting this endpoint!

### API Endpoint: `POST /api/v1/events/trigger`

**Headers:**
```http
Content-Type: application/json
```

**Request Body:**
```json
{
  "apiKey": "YOUR_SECRET_TENANT_API_KEY",
  "eventType": "service.applied",
  "payload": {
    "userId": "uuid-of-the-recipient",
    "serviceName": "Premium Subscription",
    "recipient": "user@example.com",
    "amount": "$49.99"
  }
}
```

*Note: Any arbitrary keys you pass inside `payload` (like `serviceName` or `amount`) will automatically be injected into your dynamic Email/Push templates by the microservice.*

---

## 4. Step 2: Email and SMS Delivery (Optional)

If your Content Team has configured an **EMAIL** or **SMS** template for your event in the Admin UI, the Microservice needs to know exactly where to send it.

Because our engine is completely decoupled from your database, **you** must provide the user's contact information dynamically inside the `payload` object when firing the webhook. 

If a template is active for either channel, ensure these specific keys are included in your webhook:

```json
{
  "apiKey": "YOUR_SECRET_TENANT_API_KEY",
  "eventType": "service.applied",
  "payload": {
    "userId": "uuid-of-the-recipient",
    
    // Required for EMAIL Templates:
    "recipientEmail": "customer@example.com",
    
    // Required for SMS Templates (Must include Country Code):
    "recipientPhone": "+12345678900",
    
    // ... any other custom template variables (e.g., amount, serviceName)
  }
}
```

*Note: If the Content Team created an Email template, but you forget to include `recipientEmail` in the payload, the microservice will log an error and gracefully drop that specific email job while continuing to process the In-App and SMS notifications.*

---

## 5. Step 3: Implementing Real-Time UI Popups (Frontend)

*(Note: If your project only leverages our microservice for Email and SMS delivery, you can skip Step 2 and Step 3 entirely! WebSockets are used **exclusively** for live In-App Push popups).*

To display live pop-up notifications the second your backend fires an In-App event, your frontend (React, Vue, Angular) needs to connect to our **Centrifugo WebSocket Server**. 

### 5.1. Requesting a Real-Time Token
Your frontend cannot connect to Centrifugo directly. It must first request a secure JSON Web Token (JWT) from our Auth bridge.

**API Endpoint: `POST /api/v1/auth/realtime-token`**

**Request Body:**
```json
{
  "tenantId": "YOUR_PUBLIC_PROJECT_ID", // Find this in the Admin UI Tenants Page (Looks like a UUID)
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

### 5.2. Connecting to the WebSocket Pipe
Install the `centrifuge` JavaScript SDK in your frontend application. Pass the generated JWT, and instruct it to loop through and subscribe to the `channels` provided in the HTTP response.

```javascript
import { Centrifuge } from 'centrifuge';

const centrifuge = new Centrifuge('ws://notifications.yourdomain.com/connection/websocket', {
    token: response.token // The JWT from Step 5.1
});

// Autonomously subscribe to all allowed channels returned by the API
response.channels.forEach(channelName => {
    const sub = centrifuge.newSubscription(channelName);
    
    sub.on('publication', function(ctx) {
        // Here is where you trigger your React Toast/Notification Popup!
        console.log("New Live Notification Received!", ctx.data);
        showToast(ctx.data.title, ctx.data.body);
    });

    sub.subscribe();
});

centrifuge.connect();
```

---

## 6. Step 4: Integrating the "Notification Bell" History (Frontend)

What happens if the user was offline when you triggered the event? Our microservice automatically backed it up to a persistent PostgreSQL database! 

Your frontend should implement a "Notification Bell" icon that pulls this offline history down upon login.

### 6.1. Fetching Unread History
When your application loads, hit this endpoint to populate the User's notification feed.

**API Endpoint: `GET /api/v1/notifications/{tenantId}/{userId}`**

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

### 6.2. Marking a Notification as Read
When the user physically clicks on a notification in the UI drop-down feed, fire a request to mark it as read, removing the red dot from their bell icon.

**API Endpoint: `PUT /api/v1/notifications/{tenantId}/{userId}/{notificationId}/read`**

*(No body required. A simple standard 200 OK will be returned indicating success).*

---

## 7. Project Checklist

Before moving to production, ensure your project team has validated:
- [ ] You are not exposing your Tenant API Key in your client-side frontend code.
- [ ] Your backend correctly filters out users who have opted-out of alerts before pinging the webhook.
- [ ] Your frontend requests a new Centrifugo Token upon user login/authentication refreshes.
- [ ] The `payload` object structure you send in the Webhook matches the exact variable structure defined in your approved UI Templates.
