# System Overview: Notification Microservice

The Notification Microservice is a centralized engine designed to handle the formatting, routing, and delivery of all transactional communications across multiple applications (referred to as "Tenants"). It offloads the burden of integrating with third-party providers (like Email and SMS gateways) and manages real-time WebSocket connections for in-app push notifications.

By centralizing these functions, individual applications no longer need to implement their own notification logic. They simply trigger generic events.

---

## 1. Core Architecture and Message Flow

The lifecycle of a notification, from the moment an event occurs to its final delivery, follows a strict, asynchronous pipeline to ensure high availability and scalability.

### Step 1: The Event Trigger (Webhook APIs)
When a business event occurs within a Tenant application (e.g., an order is created in an E-commerce app, or a ticket is resolved in a CRM), that application sends an HTTP POST request to the Notification Microservice's Webhook API. 
This request contains an `eventType` (e.g., `"order.created"`) and a JSON `payload` containing raw data variables like a user ID and order amount.

### Step 2: Message Queuing (Kafka Broker)
To prevent the microservice from crashing under heavy traffic spikes, the Webhook API does not immediately process the email or push notification. Instead, it places the incoming event payload onto a messaging queue known as **Kafka**. 
Kafka acts as a high-throughput buffer. It stores the events safely and ensures that no data is lost even if there is a sudden burst of millions of notifications.

### Step 3: Processing and Routing (NestJS Worker)
A specialized **Worker** process constantly listens to the Kafka queue. When it pulls an event off the queue, it queries a central PostgreSQL database to determine how to handle it.
The database evaluates two things:
1. **The Tenant ID:** Which application sent this event?
2. **The Event Type:** What happened? (e.g., `"order.created"`)

The database returns a list of configured **Templates** specific to that tenant and event. For example, the worker might discover that this event requires sending both an **Email** and an **In-App Push Notification**.

### Step 4: Template Compilation 
Instead of developers hardcoding the content of messages, content managers design templates in an Admin Dashboard.
The NestJS Worker takes the raw JSON `payload` from Step 1 and injects those variables into the retrieved Templates. It compiles rich HTML for emails, plain text for SMS, and JSON payloads for in-app pushes.

### Step 5: Final Dispatch
The Worker acts as a router based on the `channel_type` of the compiled templates:
*   **Emails & SMS:** It dispatches HTTP requests to third-party providers (like SendGrid or Twilio).
*   **In-App Notifications:** These require a persistent real-time connection to the user's browser or mobile app, which is handled independently by the WebSocket layer.

---

## 2. Real-Time In-App Notifications (Go Gateway & Centrifugo)

Traditional HTTP requests are stateless—the server cannot "push" data directly to an application unless the application actively polls the server. To deliver live, instant pop-ups, the system establishes open WebSocket connections.

Managing thousands of open WebSocket connections is computationally resource-intensive. Therefore, we offloaded this capability to a dedicated technology stack:
*   **Centrifugo:** A highly optimized scalable WebSocket server that specializes in holding open connections for millions of users across different channels.
*   **Redis:** Centrifugo heavily relies on Redis as its Engine. When running multiple Centrifugo nodes (for high availability), Redis acts as the central state store, keeping track of active subscriptions, caching missed messages (history/presence features), and executing fast Pub/Sub to instantly synchronize events across all Centrifugo instances.
*   **Go Gateway:** A high-performance API written in Golang that securely interfaces between the NestJS Worker and Centrifugo.

*(Note on Redis utilization: Currently, our `docker-compose.yml` mounts a single Redis container primarily for Centrifugo's engine. As the microservice evolves, this identical Redis instance can and should be heavily utilized by the NestJS Worker as well, particularly for caching high-read/low-write data, like mapping resolved API Keys to Tenant IDs, or temporarily caching the Idempotency state, rather than hitting PostgreSQL on every webhook request).*

**The Real-Time Process:**
1. **Authentication:** When a user logs into a Tenant application, the frontend requests a secure JWT (JSON Web Token). This token strictly authenticates which WebSocket channels that specific user is authorized to listen to (e.g., `ecommerce_tenant#user_123`).
2. **Publishing:** During Step 5 of the message flow, if the Worker resolves an `IN_APP` template, it sends the compiled JSON to the Go Gateway.
3. **Broadcasting:** The Go Gateway commands Centrifugo to instantly push (publish) the JSON payload directly over the open WebSocket connection to that specific user's active session.

---

## 3. Advantages of This Architecture

*   **Multi-Tenancy:** New applications (Tenants) can be onboarded instantly. They share the same robust infrastructure, but their data, routing rules, and visual templates are strictly isolated in the database.
*   **Decoupled Scaling:** The core business applications do not process long-running tasks like rendering email HTML or holding WebSocket connections. Furthermore, the Kafka queue ensures the system can ingest massive traffic spikes without dropping events.
*   **Dynamic Flexibility:** System administrators and marketing teams can create, edit, or disable specific notification channels (e.g., turning off an SMS sequence or updating an Email design) directly from the Admin Dashboard database without requiring software engineers to deploy new code. 
*   **Omnichannel Standardization:** A single API call from a Tenant application can simultaneously orchestrate complex deliveries across Email, SMS, and Real-Time WebSockets.
