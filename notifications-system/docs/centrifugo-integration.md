# Real-Time Notifications Integration Guide

## 1. Architectural Overview
Our real-time notification system is built on **Centrifugo v6**, acting as a highly scalable WebSocket router. It operates as a centralized "Shared Engine" within the Notification Microservice.

Individual projects (e.g., Project A, Project B) **do not** manage their own WebSockets, channel permissions, or sign their own Centrifugo JWT tokens. Instead, the central Notification Microservice handles all security and routing.

---

## 2. Centrifugo Server Configuration (v6)

The core configuration lives in `notifications-system/centrifugo/config.yaml`.

### Key Security Decisions
1. **Namespaces:** We use namespaces (e.g., `personal_events`) to categorize streams.
2. **Server-Side Subscriptions:** We enforce a highly secure "Server-Side Subscription" model. Clients are completely blocked from manually subscribing to channels. Instead, the server forces subscriptions based entirely on the capabilities embedded inside their JWT token.
3. **Isolated Secrets:** The Centrifugo HMAC Secret (`CENTRIFUGO_SECRET`) lives exclusively inside the central NestJS worker and the Centrifugo container. It is never shared with external projects.

---

## 3. How to Integrate a Frontend Project

Integrating a frontend application (like a Next.js or React app) requires only two simple steps:

### Step 1: Request an "Access Pass" (JWT)
The frontend application must request a Centrifugo connection token from the central Notification Microservice's HTTP API.

```javascript
// Example: Project A frontend fetching a token
const response = await fetch('https://notifications.yourdomain.com/api/v1/auth/realtime-token', {
    method: 'POST',
    body: JSON.stringify({ userId: 'user-123', projectId: 'PROJECT_A' })
});
const { token } = await response.json();
```

### Step 2: Connect and Listen
Because the central backend utilized the `channels` capability in the JWT, Centrifugo will **automatically** subscribe the user to their permitted channels the instant they connect. 

The frontend does **not** use the `newSubscription()` method. It simply listens to the global `publication` event.

```javascript
import { Centrifuge } from 'centrifuge';

// Connect using the token received from the Microservice
const centrifuge = new Centrifuge('wss://notifications.yourdomain.com/connection/websocket', {
    token: token
});

centrifuge.on('connected', function (ctx) {
    console.log('Successfully connected to Centrifugo!');
});

// Simply listen for any server-side publications routed to this user
centrifuge.on('publication', function (ctx) {
    console.log(`📥 NEW NOTIFICATION on ${ctx.channel}:`, ctx.data);
    
    // Trigger UI updates (Toast, Notification Bell badge, OS Notification)
    if (ctx.data.title && Notification.permission === "granted") {
        new Notification(ctx.data.title, { body: ctx.data.body });
    }
});

centrifuge.connect();
```

---

## 4. Backend Responsibilities (The Notification Microservice)

The central NestJS worker is responsible for dynamically assembling the JWT token based on who the user is and what project they are accessing.

**Example NestJS Implementation:**
```typescript
import * as jwt from 'jsonwebtoken';

function generateRealtimeToken(userId: string, projectId: string) {
    // 1. Define global channels the user always gets
    const allowedChannels = [`global_alerts#${userId}`];

    // 2. Add project-specific boundaries based on the request
    if (projectId === 'PROJECT_A') {
        allowedChannels.push(`project_a_events#${userId}`);
    } else if (projectId === 'PROJECT_B') {
        allowedChannels.push(`project_b_events#${userId}`);
    }

    // 3. Sign the token with the 'channels' capability
    return jwt.sign({ 
        sub: userId,
        channels: allowedChannels 
    }, process.env.CENTRIFUGO_SECRET, { 
        expiresIn: '1y' // Or shorter for tighter security
    });
}
```

By keeping this logic centralized, adding new projects in the future requires zero changes to your infrastructure. You simply add a new mapping case in the NestJS worker, and the frontend connects seamlessly.
