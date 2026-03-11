# Multi-Tenant Notification Architecture Guide

## 1. Vision & Overview
The Notification Microservice serves as a centralized, uncoupled "Shared Engine" providing both asynchronous delivery (Email, SMS) and real-time WebSocket push (via Centrifugo) to an entire ecosystem of internal projects. 

Instead of embedding notification code, third-party provider SDKs, or WebSocket routing logic into individual projects (Fintech dashboards, E-commerce storefronts, internal admin panels), these projects act solely as **Event Producers** and **Real-Time Consumers**. 

This document outlines the architecture, naming conventions, and edge-cases necessary to orchestrate a secure, scalable multi-tenant environment.

---

## 2. Completed Foundation (Implementation Plan Resolved)
We successfully transitioned from a sandbox environment to a secure foundation by completing Phase 1 of our implementation plan:
- **Secured WebSockets:** Migrated Centrifugo completely to v6 configuration syntax and removed anonymous/unsecured namespace bypasses.
- **Server-Side Subscriptions (JWT-Driven Authorization):** Moved away from client-initiated channel subscriptions. Security is now 100% enforced by the central Node.js backend. Clients are automatically subscribed to authorized channels upon connection via the `channels` capability claim in their JWT.
- **Go Gateway Refactoring:** Adjusted the Go Kafka consumer to route processed real-time events exclusively to strict `personal_events#{userID}` channels.

*Next immediate steps (Phases 2 & 3)* include setting up PostgreSQL table persistence for offline `UNREAD` state, and building an HTTP REST Bridge so serverless/Next.js apps can trigger events without requiring heavy Kafka producer setups.

---

## 3. Multi-Tenant Naming Conventions
As we onboard diverse projects (e.g., a Fintech app handling sensitive transactions, an E-commerce site handling marketing bursts), strict naming conventions are required to prevent namespace collisions and data leaks.

### 3.1. Kafka Topic Convention
Projects should produce messages to topics categorized by domain, not by the specific application:
*   `fintech.transactions.events`
*   `ecommerce.orders.events`
*   `auth.user.events`

The central NestJS worker consumes these topics and routes them centrally to `notification.dispatch` for the Go Gateway.

### 3.2. Centrifugo Namespace Convention
Namespaces in `centrifugo/config.yaml` should be heavily restricted and categorized by the tenant/project boundary:

```yaml
channel:
  without_namespace:
    allow_subscribe_for_client: false
  namespaces:
    - name: global_system         # System-wide outages, global maintenance
      allow_subscribe_for_client: true
      allow_user_limited_channels: true
    - name: fintech_app           # Extremely strict privacy
      allow_subscribe_for_client: true
      allow_user_limited_channels: true
    - name: ecommerce_store       # Less strict, high volume
      allow_subscribe_for_client: true
      allow_user_limited_channels: true
```

*Channel Naming Format:* `<NAMESPACE>#<USER_ID>`
Example: A user logs into the Fintech app. They receive a token granting them access to `fintech_app#user-123` and `global_system#user-123`. 

---

## 4. Configuring a New Tenant (Project Integration)
When a new project is onboarded, the central Notification Microservice team must complete the following configuration:

1. **Centrifugo `config.yaml`:** Add the new project's namespace. (Requires container restart).
2. **NestJS `Auth Controller`:** Map the new project identifier to the Centrifugo JWT generator:
    ```typescript
    if (project_id === 'FINTECH_APP') {
        userChannels.push(`fintech_app#${userId}`);
    } else if (project_id === 'ECOMMERCE_STORE') {
        // E-commerce might have global sale broadcast channels too
        userChannels.push(`ecommerce_store#${userId}`, `ecommerce_store:promos`);
    }
    ```
3. **Database Schema:** Create template mappings in Postgres for the visual layout of that specific project's emails and in-app payloads.

---

## 5. Security & Isolation Considerations
*   **Zero-Trust Clients:** External projects (and their frontends) are considered compromised by design. The Central Engine must never trust an incoming event without validating the Project API Key (via REST) or relying on trusted Kafka broker ACLs.
*   **JWT Integrity:** The HMAC secret `CENTRIFUGO_SECRET` must **never** be shared with any project. External projects **must** request their Centrifugo token asynchronously from the central `GET /api/v1/auth/realtime-token` endpoint.
*   **Cross-Tenant Leakage:** By mathematically enforcing the `#` user boundary in the Centrifugo channel name, and coupling it with the backend-signed JWT `channels` array, it is impossible for User A to subscribe to User B's stream, or for a compromised Ecommerce JWT to listen to Fintech channels.

---

## 6. Critical Edge Cases & Resiliency

### 6.1. The "Offline User" Problem (Missed WebSockets)
**Scenario:** A user's payment fails while they have the app closed. The Go Gateway publishes the WebSocket event, but the user is offline. They miss the alert.
**Resolution:** Phase 2 of our implementation plan introduces the `in_app_notification` Postgres table. 
1. The NestJS worker saves the notification as `UNREAD` in Postgres *before* the real-time push. 
2. When the user eventually opens the app, the frontend hits `GET /api/v1/notifications/history/{userId}` to fetch the backlog, *then* opens the WebSocket connection for subsequent real-time updates.

### 6.2. Spike Loads & Throttling
**Scenario:** The Ecommerce store runs a Black Friday sale. 100,000 orders are placed, flooding Kafka.
**Resolution:** 
*   **Kafka Lag:** Because the worker and gateway pull from Kafka, they inherently act as shock absorbers. If SendGrid rate limits the Go Gateway, the Go Gateway simply slows down consuming from Kafka without breaking the transaction flow of the Ecommerce app.
*   **Centrifugo Load:** Centrifugo is highly performant (handles millions of concurrent connections). Ensure Redis PUB/SUB config is correctly tuned to handle high-throughput fan-out.

### 6.3. Kafka Rebalancing & Duplicate Delivery
**Scenario:** A worker pod crashes while processing an email. The Kafka group rebalances, and a new pod picks up the message.
**Resolution:** Idempotency is crucial. 
1. The originating project must provide a unique `NotificationID`.
2. Before the Go Gateway sends the email or pushes the WebSocket, it must issue an `INSERT ... ON CONFLICT DO NOTHING` or check the `notification_logs` table status. This prevents double-emailing a user if Kafka retries message delivery.

---

## 7. Database Scaling & Data Lifecycle Management

### 7.1. Preventing Database Bloat (Data Pruning)
In-app notifications and audit logs are highly ephemeral. To prevent the `in_app_notifications` and `notification_logs` tables from becoming massive bottlenecks:
*   **Aggressive TTL (Time-To-Live):** Implement scheduled pruning via cron jobs (`pg_cron` or NestJS `@Cron()`).
*   **Retention Rules:**
    *   Delete `READ` in-app notifications older than 30 days.
    *   Delete `UNREAD` in-app notifications older than 90 days.
    *   Delete `notification_logs` older than 7 days (export to cold storage like AWS S3 if compliance requires it).

By constantly trimming the tail end of the data, the database size plateaus, ensuring queries remain lightning-fast.

### 7.2. Decentralized User Preferences (The Stateless Engine)
The Notification Microservice **does not** own user preferences. Storing granular preferences for every user across every application (e.g., E-commerce "Marketing Emails", Fintech "Transaction Alerts") centrally causes extreme schema bloat and tight coupling.

*   **Who owns the data?** Every individual project (e.g., "Project A") stores its own users' preferences in its own local database.
*   **The Workflow:**
    1. A transaction occurs in Project A.
    2. **Project A** checks its own database: *"Did this user opt-in to transaction alerts?"*
    3. If **No**, Project A stops and never emits an event.
    4. If **Yes**, Project A fires the payload to the Notification Microservice.
*   **Microservice Assumption:** If the Notification Microservice receives a payload via Kafka or HTTP, it blindly assumes the upstream tenant has already explicitly validated the user's opt-in status.
*   **Global Exception:** The only preference the microservice stores centrally is a "Global Suppression List" (Hard Bounces/Global DND) to protect the overall email provider reputation (e.g., SendGrid).
