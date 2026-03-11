# Notifications Engine: Postman Collection Architecture

This document outlines the exact structure and endpoints required for our Postman Workspace. Our microservice is a **Multi-Tenant, Generic Event Engine**, and the Postman collection must be architected to perfectly match this "Tenant-First" design.

---

## Core Architectural Principles

1. **Multi-Tenant APIs (API Key Auth)**: 
   External backend services triggering notifications authenticate via a **Tenant API Key**, not a standard user JWT. Operations are strictly segregated by the Tenant.
2. **Generic Event-Driven Routing**: 
   External services do *not* specify Template IDs. They hit a generic Webhook API passing an `eventType` (e.g., `"service.applied"`) along with a JSON `payload`. The engine dynamically resolves the template based on `tenantId` + `eventType`.
3. **Hybrid Front Door**: 
   The NestJS Worker acts as our HTTP entry point for webhooks and real-time authentication, while seamlessly bridging data to Kafka and Centrifugo.

---

## Postman Collection Structure

To future-proof the workspace, the collection must be grouped into the following **3 Main Folders**. This ensures that as we scale, new endpoints naturally slot into their designated boundaries.

### 📁 1. Integration APIs (Backend-to-Backend)
*APIs used by our tenant applications (like TMaaS or Ecommerce backends) to trigger the notification engine. Secured via Tenant API Key.*

*   **POST** `/api/v1/events/trigger`
    *   **Purpose:** Triggers a generic event into the engine.
    *   **Body:**
        ```json
        {
          "apiKey": "beb4af2d-5557-478a-8c35-007e07b64a89",
          "eventType": "service.applied",
          "payload": {
            "userId": "user-777",
            "name": "Alex",
            "serviceName": "Premium Credit Card"
          }
        }
        ```

### 📁 2. Client-Facing APIs (Frontend Apps)
*APIs used directly by the end-user's web or mobile applications. Secured via user identity and tenant identifiers.*

*   **POST** `/api/v1/auth/realtime-token`
    *   **Purpose:** Generates a signed JWT with strict boundary channels so a frontend can connect to Centrifugo WebSockets.
    *   **Body:**
        ```json
        {
          "userId": "user-777",
          "tenantId": "beb4af2d-5557-478a-8c35-007e07b64a89"
        }
        ```
*   **GET** `/api/v1/notifications/:tenantId/:userId` *(WIP - Phase 5)*
    *   **Purpose:** Fetch the user's unread in-app notification history.
*   **PUT** `/api/v1/notifications/:tenantId/:userId/:notificationId/read` *(WIP - Phase 5)*
    *   **Purpose:** Mark a specific notification as READ.
*   **GET/PUT** `/api/v1/users/:tenantId/:userId/preferences` *(Future)*
    *   **Purpose:** Manage user channel opt-ins (SMS vs Email vs Push).

### 📁 3. Admin APIs (Internal Dashboard)
*Internal APIs strictly for our super-admins to configure the engine without touching the codebase.*

*   **POST / GET** `/api/v1/admin/tenants` *(Future)*
    *   **Purpose:** Create new tenants, rotate secure API keys, and define allowed WebSocket channels.
*   **POST / GET** `/api/v1/admin/templates` *(Future)*
    *   **Purpose:** Upload MJML templates and map `eventTypes` to a specific `tenantId` dynamically.
*   **GET** `/api/v1/admin/logs` *(Future)*
    *   **Purpose:** View system-wide delivery attempt logs, latencies, and third-party provider failures.