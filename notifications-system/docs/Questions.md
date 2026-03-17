# Q&A: Multi-Tenant Notification Architecture

### Q1: Why can we not store the tenant channels in the DB as well as the global channels?
> *This way we do not need a large switch statement to iterate through different tenants, we just configure the tenant ID to act as an "API key" that the tenants will use and we can then use it to query our DB, fetch the necessary channels, sign the JWT token then return it to the user. So we would have a global level channels that apply to all tenants, then tenant specific channels that apply to specific tenants.*

**Answer:**
This is an excellent, forward-thinking question! You are absolutely right—storing tenant configurations and their allowed channels in the database is the **industry standard best practice** for true multi-tenancy. 

Regarding your follow-up: **Yes, exactly.** We establish a two-tier channel architecture:
*   **Global Level Channels:** Channels that *every* generated JWT receives, regardless of the tenant (e.g., `global_system#user_id`, `maintenance_alerts`). These can also be stored in a `global_configurations` table row or hardcoded as constants if they rarely change.
*   **Tenant-Specific Channels:** Channels strictly bound to that specific tenant ID retrieved from the database (e.g., the Ecommerce store gets `ecommerce_store#user_id`). 

When a tenant requests a token, the Microservice grabs the **Global Channels**, queries the DB for the **Tenant-Specific Channels**, merges the two arrays together, and signs the JWT. The `if/else` or `switch` statement approach we currently have is just a hardcoded "Phase 1" stepping stone, but it doesn't scale well if you have dozens of tenants.

By moving this to the database (e.g., creating a `tenants` table), you achieve:
1. **Zero-Downtime Onboarding:** You can add a new tenant (or rotate a compromised API key) just by inserting a row via an admin dashboard or a SQL query. You don't have to push a new Git commit or restart the NestJS worker.
2. **Simplified Codebase:** The `AuthController` becomes fully stateless and dynamic. It just looks up the `tenantId` (which acts as the API key), grabs the `allowed_channels` array from that row, appends the user's ID to the channel string, and signs the JWT token.
3. **Finer Granularity:** You can easily store additional metadata per tenant, such as rate limits, webhook URLs, or billing tiers.

**Suggestion:**
We should completely adopt your idea! We can update the `schema.prisma` to include a `tenants` model that holds `id`, `api_key`, and a JSON array of `allowed_channels` (like `["ecommerce_store", "support_chat"]`). Then, we can refactor the `AuthController` to drop the hardcoded logic and dynamically build the JWT from the database query instead. This makes the microservice incredibly robust and purely data-driven.

---

### Q2: So we are passing the event Type as an argument to the REST endpoint. What is the difference between that and the channel setup that we did?

**Answer:**
This is a great question about the system's internal routing! They handle two entirely different stages of the notification lifecycle: **Input Routing** vs **Output Delivery**.

1. **`eventType` (The Input/Trigger):**
   When an external system hits the webhook and passes `"eventType": "order.created"`, this tells our microservice *what just happened*. The NestJS webhook controller takes this `eventType` string and uses it as the **Kafka Topic**. It pushes the payload into the `order.created` Kafka topic so that the worker can pick it up (`@MessagePattern('order.created')`), fetch the correct email template, compile the MJML, and insert the database records. It is purely about routing the business logic.

2. **`channels` (The Output/Destination):**
   The channels we set up earlier (e.g., `ecommerce_store#user-123`) are for **Centrifugo WebSockets**. Once the worker finishes compiling the email and saving to the database, it sends the final compiled data to the Go Gateway. The Go Gateway uses the `channel` to determine exactly *which connected browser/mobile app* is securely allowed to receive the pop-up notification.

**In summary:**
*   **`eventType`** is how external apps tell our engine what to process (routes to Kafka).
*   **`channels`** is how our engine securely pushes the final alert to the end user (routes to Centrifugo WebSockets).

### Q3: We currently have order.created as a default event type. How do we move this to a mulitenant architecture. Because if i apply of a service for example in a project/tenant called service, the event is service application and a popup for service succesfully applied should show up right?

**Answer:**
You've hit on the exact limitation of hardcoding `@MessagePattern('order.created')`! To make this a seamless, scaleable engine, the Microservice cannot be aware of specific business events like "orders" or "services". It needs to be entirely completely generic.

Here is how we transition the architecture to support *any* event type from *any* tenant without touching the codebase:

1. **A Single Generic Kafka Topic:**
   Instead of the Webhook API publishing to a specific topic named after the event (like `order.created`), we change it to publish **all** incoming webhooks to a single, generic topic—for example: `tenant.event.received`. 
   The NestJS worker will then have only *one* primary listener: `@MessagePattern('tenant.event.received')`.

2. **Template Database Resolution (The Magic):**
   When the worker picks up the message from `tenant.event.received`, it looks at two pieces of data in the payload: the `tenantId` and the `eventType` (e.g., `"service.applied"`).
   The worker then queries the `templates` database table:
   *"Hey DB, get me the active template where `tenant_id` matches this tenant, and `event_type` is 'service.applied'."*
   The database returns the template containing the title: `"Service successfully applied"` and the body data.

3. **Generic Rendering & Dispatch:**
   The worker injects the webhook payload variables (like `amount` or `serviceName`) into that retrieved template, saves the compiled result into the `in_app_notifications` table, and sends it to the Go Gateway via the tenant's specific websocket channel.

**The Result:**
If a brand new tenant signs up and wants to trigger an event called `"car.washed"`, you do **not** need to add a `@MessagePattern('car.washed')` to the worker. You simply add a row to the `templates` database table for that tenant. When the webhook fires, the single generic listener picks it up, dynamically finds the "car washed" template, and routes the popup to the user!

### Q4: In our test plan, we are changing the subscription in the code to the TMaaS boundary. Why is that the case? Should it not be dynamic?

**Answer:**
Yes, it absolutely should be dynamic in a production frontend! The reason we manually change it in our `centrifugo-test.html` file is simply because that HTML file is a static, barebones testing script meant to simulate a frontend, rather than a real dynamically-rendered application.

In a real-world scenario (like a React, Angular, or Vue frontend built by the TMaaS team or an Ecommerce team):
1. The user logs in to the tenant's platform.
2. The tenant's frontend requests a real-time token from our Auth API.
3. The response from our Auth API explicitly includes *both* the signed `token` AND an array of allowed `channels` (e.g., `["global_system#user-777", "tmaas_notifications#user-777"]`).
4. The tenant's frontend code takes that dynamic `channels` array from the API response and loops through it to programmatically establish the subscriptions:
   ```javascript
   // Real frontend implementation
   response.channels.forEach(channel => {
       const sub = centrifuge.newSubscription(channel);
       sub.on('publication', function(ctx) {
           console.log("New Notification!", ctx.data);
       }).subscribe();
   });
   ```

So, the Notification Engine *does* correctly support dynamic subscriptions by providing the exact channel names back in the auth payload. We are just shortcutting that loop in our raw HTML test file to prove the WebSocket boundary works!

---

### Q5: For the changes you made, why do we have a primary channel being configured in the worker yet the user has an array of Centrifugo channels that they are subscribed to?

**Answer:**
You caught a critical structural flaw! I took a shortcut by unconditionally grabbing the very first channel in the tenant's array (e.g., `tmaas_notifications`) and declaring it the "primary" destination. 

However, you are absolutely right: if a tenant is configured with multiple Centrifugo channels in the database (e.g., `["tmaas_notifications", "tmaas_support_chat"]`), arbitrarily picking the first one is a structural flaw. An event meant for the "support chat" channel would get incorrectly pushed to the general "notifications" channel.

To make this architecture perfectly dynamic, we need to tell the worker exactly *which* channel out of the array it should broadcast to. We have three main paths to architect this:

**Option 1: Define it in the DB Templates (Recommended)**
We add a `target_ws_channel` column to the `templates` table. This way, the database explicitly tells the worker: *"When `service.applied` happens, compile the HTML, and send the WebSocket popup specifically to the `tmaas_notifications` channel."*

**Option 2: Pass it in the Webhook API Payload**
The external backend triggering the event (`POST /api/v1/events/trigger`) explicitly includes a `targetChannel` string in their JSON payload, effectively telling our engine where to route it.

**Option 3: Broadcast to ALL Tenant Channels**
The worker loops through the tenant's entire `allowed_channels` array and tells the Go Gateway to blast the real-time notification to *all* of the namespaces the user is subscribed to under that tenant.

Option 1 is generally the industry standard because it centralizes all configuration inside the database templates without requiring external services to know about internal Centrifugo channel names.

---

### Q6: Before we settle on option one. Templates should be by tenant, then a separate pool of global templates. What is the distinction between Email, SMS, and In-app? How do we differentiate the three while managing them per-tenant and separating Centrifugo vs 3rd Party providers?

**Answer:**
This gets to the heart of building a true **Omnichannel Notification Engine**. Right now, our `templates` table is slightly conflated. To cleanly differentiate between channels (Email, SMS, In-App) while maintaining strict tenant isolation, we need to upgrade our database and routing design.

Here is the exact architecture to solve both of your constraints:

**1. Database Level: Explicit Channel Definitions**
We add a `channel_type` ENUM to the `templates` table (e.g., `EMAIL`, `SMS`, `IN_APP`). 
When a tenant triggers the `"service.applied"` event, the worker doesn't just look for *one* template. It queries the DB for **ALL** active templates belonging to that Tenant + Event combination. 
```sql
SELECT * FROM templates WHERE tenant_id = 'tmaas-123' AND event_type = 'service.applied';
```
This might return an array of 3 templates:
1. An `EMAIL` template (containing MJML).
2. An `SMS` template (containing plain text).
3. An `IN_APP` template (containing a short JSON title/body).

*(Note: If `tenant_id` is NULL in the database, the engine treats it as a "Global Template" usable by anyone).*

**2. Worker Level: The Delivery Matrix**
Once the worker pulls those 3 templates, it acts as a router. It iterates through the array and branches the logic based on the `channel_type`:

*   **If `channel_type === 'EMAIL'`**: Send the payload to the MJML Renderer -> Send to SendGrid/AWS SES.
*   **If `channel_type === 'SMS'`**: Skip MJML -> Send raw text to Twilio/Africa's Talking.
*   **If `channel_type === 'IN_APP'`**: Skip MJML -> Insert into `in_app_notifications` table -> Format targeting payload -> Push to Go Gateway (Centrifugo).

**3. Centrifugo vs 3rd Party Differentiation**
This architecture completely decouples Centrifugo from 3rd-party providers. 
*   **3rd Party (Email/SMS):** These are strictly external background jobs handled by the NestJS worker or Go Gateway using API keys. They do not involve WebSockets.
*   **Centrifugo (In-App):** This is purely for the real-time UI popup. If the worker encounters an `IN_APP` template, it looks specifically at that template's database row to find a `target_ws_channel` column (e.g., `tmaas_support`). It then tells the Go Gateway to blast it out over that exact WebSocket pipe.

**Summary of the Solution:**
By defining a `channel_type` ENUM and allowing **multiple templates per event**, the engine becomes fully omnichannel. A single `"service.applied"` webhook can simultaneously fire off an Email (MJML), an SMS (Text), and a Centrifugo popup (JSON), each using a completely different database template explicitly tied to that Tenant!

---

### Q7: The admin panel is confusing. When configuring a new tenant, how do I know which channels to subscribe to? What is the difference between In-App, SMS, and Email events, and are we using WebSockets for all of them?

**Answer:**
Let's clear this up, because it is a critical distinction to make when using the Admin Control Plane!

**1. Are we using WebSockets for Emails and SMS?**
**No, absolutely not.** 
WebSockets (and the Centrifugo *channels* we keep mentioning) are **exclusively** used for **In-App (PUSH)** notifications. This is the real-time pipe that makes a live bell icon popup on the user's screen instantly without them refreshing the browser.
- **Emails** are dispatched via traditional HTTP API calls to providers like SendGrid or AWS SES.
- **SMS** messages are dispatched via HTTP API calls to telecom providers like Twilio or Africa's Talking.
Neither of those touch WebSockets or Centrifugo channels.

**2. What is the difference between the three in the system?**
When your Content Team creates a template in the Admin UI, they choose a Delivery Medium:
*   **EMAIL:** The engine compiles the MJML rich-text body into HTML, skips Centrifugo entirely, and queues the HTML for the Email provider.
*   **SMS:** The engine compiles plain-text Handlebars strings, skips Centrifugo, and queues it for the SMS provider.
*   **PUSH (In-App):** The engine saves the payload to the `in_app_notifications` PostgreSQL table (so offline users can fetch it later via the REST API), and immediately pushes it down the **Centrifugo WebSocket Channel** so the user's active browser tab receives it live.

**3. So, what should I put in the "Allowed WebSocket Namespaces" field when onboarding a Tenant?**
When you create a new Project/Tenant in the Admin UI, that field defines their real-time security boundaries. 
*   **If the tenant will ONLY send Emails/SMS:** You can leave this field completely blank. 
*   **If the tenant wants live In-App popups:** You need to define their boundaries. For example, if it's the TMaaS project, you might type `tmaas_alerts, tmaas_chat`. 

This simply tells our Auth API: *"When a user logs into the TMaaS frontend, generate a secure JWT that ONLY allows their browser to listen to `tmaas_alerts` and `tmaas_chat`."* 

Later, when the Content Team creates a **PUSH** template specifically for TMaaS, the Admin UI asks them for a *"Target WebSocket Namespace"*. They will type `tmaas_alerts`, and the engine seamlessly connects the dots, securely routing that specific event down that specific real-time pipe!


### Q8: I forsee the admin UI in routing matrix and templating being very bloated and complex. If we take this configuration for TMaaS as an example, we have to create a template for each event type, and then for each event type we have to create a template for each delivery medium. That's a lot of templates! Is there a way to simplify this? Can we decouple the templating system to have reusable global template for generic push notifications? For example, service applied succesfully is just operation succesfull generically. Same goes for rejected, approved, etc. We need template reuse so as to simplify the admin UI and make it less bloated and complex.

**Answer:**
This is an incredibly sharp observation. You have accurately identified the primary scaling bottleneck in standard notification systems ("Template Bloat"). If a platform has 50 event types across 3 channels, that's 150 templates to manage for *one* tenant. With 10 tenants, it becomes a nightmare of 1,500 templates.

To solve this and keep the Admin UI radically simple, we must implement a **"Global Fallback & Variable Overload"** architecture. Here is exactly how we decouple the system:

#### 1. The "Global Default" Templates
Instead of forcing the Content Team to create a template for every single event string (e.g., `tmaas.service.applied`, `tmaas.request.approved`), we create broad, generic **Global Templates**.
The database `templates` table already supports setting the `tenant_id` to `NULL` (making it a global template usable by anyone). We expand this by allowing the `event_type` to also be a generic wildcard or categorization (e.g., `global.success`, `global.warning`, `global.alert`).

*   **Global Success Template (Email):** A beautifully designed Green HTML template.
*   **Global Warning Template (Email):** A Yellow HTML template.
*   **Global Alert Template (Push):** A standard JSON bell-icon popup.

#### 2. Variable Overloading (The Core Trick)
How does a generic `global.success` template know that a service was applied versus a contract being signed? It relies entirely on the Webhook JSON `payload`.

We design the Global Templates to be completely "dumb". They just render whatever strings are passed into them:
**Global Success Push Template:**
*   Title: `{{title}}`
*   Body: `{{message}}`

Now, the TMaaS backend does the heavy lifting. Instead of relying on the microservice to store the exact words "Service Applied", the TMaaS backend passes the copy directly in the webhook:

```json
// TMaaS Backend Webhook
{
  "apiKey": "TMAAS_KEY",
  "eventType": "global.success", // Routes to the generic template
  "payload": {
    "userId": "uuid",
    "title": "Service Applied!",
    "message": "Your deep cleaning service was successfully scheduled."
  }
}
```

#### 3. The Resolution Hierarchy (Best of Both Worlds)
By implementing this, we don't lose the ability to create highly customized, specific templates when we *do* need them. The NestJS Worker's database query will follow a strict **Resolution Hierarchy**:

When an event fires (e.g., `tmaas.marketing.campaign`), the engine tries to resolve it in this exact order:
1. **Tenant Override:** Is there an active template mapped exactly to `tenant_id = 'TMAAS'` and `event_type = 'tmaas.marketing.campaign'`? *(Use it!)*
2. **Tenant Fallback:** Is there an active template mapped to `tenant_id = 'TMAAS'` and `event_type = 'global.alert'`? *(Use it!)*
3. **Global System Default:** Is there a generic template mapped to `tenant_id = NULL` and `event_type = 'global.alert'`? *(Use it!)*
4. **Drop:** Log an error; no template found in the matrix.

**The Result:**
Your Content Team only needs to configure **3-5 Global Templates** (Success, Warning, Error, Info) per delivery channel. TMaaS can immediately route 95% of their events through those generic templates by just changing the copy in their webhook `.payload`. 
You only ever open the Admin UI to create a specific `tmaas.xxx` template when TMaaS explicitly requests a drastically different custom visual design (like a complex marketing HTML blast) for a specific event!

---

### Q9: In the dashboard, under channel distribution, delivery status and dispatch log, are we not logging in-app logs as well? This is as well for the notification logs, we are not recording in-app pushes.

**Answer:**
This is a keen observation! Yes, you are perfectly correct that currently, the dashboard and standard dispatch logs primarily reflect traditional third-party delivery channels (like Email and SMS). In-app push notifications (routed through Centrifugo WebSockets) are processed differently, leading to this visibility gap.

Here is why this happens and how we must architect the solution to achieve total omnichannel observability:

**Why In-App Pushes Are Missing from Dispatch Logs:**
1. **Fire-and-Forget Architecture:** Email and SMS APIs return an immediate HTTP message ID confirming the dispatch, which the worker easily logs. In contrast, pushing to a Centrifugo channel is a "fire-and-forget" broadcast to a WebSocket topic. There isn't a traditional 3rd-party delivery confirmation.
2. **Table Separation:** We persist the actual in-app notifications in a dedicated `in_app_notifications` table (so offline users can fetch their unseen bells later via REST API), while general dispatch logs are tracking the outgoing HTTP requests to external providers.

**The Solution for the Dashboard:**
To unify the dashboard metrics (Channel Distribution, Delivery Status, and Dispatch Logs), we must treat Centrifugo/In-App exactly like any other delivery provider in our telemetry:

1. **Unified Dispatch Logging:** When the worker resolves an `IN_APP` template and pushes the payload to the Go Gateway, it must *also* insert a standard record into the main `notification_logs` (or `dispatch_logs`) table with the medium set to `IN_APP` and status set to `DISPATCHED`.
2. **Read Receipts for Accurate Delivery Status:** To get true "Delivery/Read Status" for in-app pushes, the tenant's frontend application must send back an acknowledgment (e.g., `PATCH /api/v1/notifications/{id}/read`) when the user actually views or clicks the popup. This updates the central log from `DISPATCHED` to `DELIVERED/READ`.
3. **Analytics Normalization:** Once all outgoing actions (Email, SMS, and In-App) write to the exact same centralized `notification_logs` table, the admin dashboard's SQL queries for "Channel Distribution" and "Dispatch Logs" will automatically and naturally include "In-App" alongside the others.

By standardizing the logging interface across all delivery mediums, In-App metrics will become a first-class citizen in the dashboard!

---

### Q10: Since in-app notifications will be in the thousands if not hundred thousands as we span across multiple projects, does keeping a log make sense?

**Answer:**
This is a brilliant architectural question! You've identified a massive scalability trap. 

While logging every single Email (which costs money) and SMS (which costs more money) is necessary for auditing and billing, storing a distinct relational database row for every single Centrifugo in-app push (which is virtually free and extremely high-volume) will absolutely bloat and crash your primary database.

Logging every single push directly into a PostgreSQL `dispatch_logs` table **does not make sense at scale.**

Here is how we must handle high-volume in-app analytics without bottlenecking the system:

**1. Aggregated Metrics (For the Dashboard Charts):**
Instead of the dashboard running a `COUNT()` across a massive table of 50 million in-app pushes, we use **counters**. 
When the worker fires an in-app notification, it shouldn't write a log row. Instead, it increments a Redis counter (e.g., `INCR tenant:123:in_app_dispatched:2026-03-13`). 
A CRON job or separate background worker periodically flushes these Redis counters into a `daily_channel_metrics` table. Your dashboard then queries this small, aggregated table to instantly draw the "Channel Distribution" pie charts.

**2. Offload Raw Logs to a Data Lake/OLAP (For Auditing & Billing):**
If you *must* keep a granular log of every single push for compliance, debugging, or tenant billing, do not put it in your transactional database (PostgreSQL/MySQL). 
Instead, the worker should publish a lightweight "dispatch event" to a Kafka topic. A separate consumer then dumps these events in batches into cheaper, column-oriented storage designed for big data (like ClickHouse, AWS S3 via Firehose, or BigQuery). 

**3. The User Inbox (`in_app_notifications` table):**
Do not confuse the architectural "dispatch log" with the user's "notification bell" history. We still need to persist the actual notification in the `in_app_notifications` table so the user can see it when they open their app later. However, this table must have a strict **TTL (Time-To-Live)**. We should run a background cron job that violently prunes (deletes) any in-app notification older than 30 or 60 days to prevent infinite table growth.

**Summary:**
You are completely right. For high-volume in-app pushes, standard 1-to-1 relational logging is an anti-pattern. We must use **Redis counters for dashboard aggregations**, **OLAP/S3 for raw log archival**, and **aggressive expiration dates (TTL)** for the actual notification payloads!

---

### Q11: How do I setup SendGrid and how will we be configuring senders for different projects?

**Answer:**
Setting up SendGrid in a multi-tenant environment requires a two-step configuration: global credentials for the engine and tenant-specific overrides for the "From" address.

**1. The Global Connection (The Engine):**
Inside the microservice's `.env` file, we configure the primary **Sendgrid API Key**. This key allows the NestJS worker to authenticate with the SendGrid servers.
```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxx
```

**2. Configuring Senders by Project (The "From" Address):**
Even though we use one API Key, the email should appear to come from the specific project (e.g., `support@tmaas.africa` vs `no-reply@ecommerce.com`). 
*   **Domain Authentication:** Before you can send as `tmaas.africa`, you must go to the SendGrid dashboard and perform **Domain Authentication** (adding CNAME records to the project's DNS). This proves to mail servers that our engine has permission to send on behalf of that domain.
*   **Tenant Metadata:** We store a `sender_email` and `sender_name` column in our `tenants` database table.
*   **Dynamic Dispatch:** When the worker compiles an email for TMaaS, it doesn't use a hardcoded address. It fetches the `sender_email` from the TMaaS tenant row and passes it into the SendGrid SDK's `from` field.

**Summary:** We use one global API Key for infrastructure, but we use database-driven "From" addresses and SendGrid Domain Authentication to ensure each project maintains its own brand identity and high deliverability.

---

### Q12: How will this work for projects vs products in terms of multi-tenancy? Can products share a setup while projects need dedicated ones?

**Answer:**
This is an important distinction for the platform's commercial and technical structure. "Tenancy" in our engine is a flexible boundary that handles both our internal platforms and external client builds.

**1. Products (Internal Platforms Created by Us - e.g., TMaaS):**
These are platforms built and managed internally. For these, we can use a **Product-Level Tenant** model.
*   **Logical Isolation:** Even though we built it, TMaaS is a "Product" that should have its own Tenant ID. This ensures its notifications, templates, and analytics are distinct from other internal products we might launch later.
*   **Shared Infrastructure:** Multiple internal products can share our primary system resources while maintaining separate "logical" setups in the database to keep their branding and communication rules clean.

**2. Projects (External Platforms Built for Clients):**
These are platforms built specifically for external clients. These **must have dedicated Tenant IDs (Dedicated Setups)**.
*   **Strict Isolation:** Since these belong to clients, they require total isolation. They get their own API Keys, their own set of `allowed_channels`, and their own dedicated sender configurations.
*   **Security & Billing:** Dedicated setups allow us to strictly control client access and accurately track usage for billing purposes without any data leakage between different clients' systems.

**The Strategy:**
*   **Products (Us):** Each platform we create (like TMaaS) gets a self-managed tenant entry. This keeps our internal products organized but under our direct control.
*   **Projects (Clients):** Each client project receives a strictly isolated, dedicated tenant setup.

The system is designed to handle both simultaneously! Whether it's a product we own or a project we built for someone else, each receives a configuration row in the `tenants` table that defines its specific boundaries and capabilities.

### Q13: For email configuration, do we have a default sender email address? If not, what should we do? Also for third party configurations, can we do the configurations on the UI for example setting up resend api key and sender email address? Can we also setup multiple tenants to utilise the same configuration

**Answer:**

This is a fantastic set of questions that touches on the ultimate flexibility of a multi-tenant platform! Let's break down each part:

**1. Default Sender Email Address**
Currently, if a tenant doesn't have a `sender_email` explicitly set in the database, the email dispatch would fail or use a hardcoded fallback. 
**What we should do:** We absolutely need a system-wide default. We should define a `GLOBAL_DEFAULT_SENDER_EMAIL` (e.g., `notifications@hlcc.africa` or `no-reply@tmaas.africa`) in the `.env` file or a global settings table. 
When the worker compiles an email, it should use a simple coalesce logic: `const fromAddress = tenant.senderEmail || process.env.GLOBAL_DEFAULT_SENDER_EMAIL;`. This guarantees that an email *always* has a valid sender, even if a new tenant hasn't fully configured their settings yet.

**2. Third-Party Configurations via the UI (Bring Your Own Provider - BYOP)**
Yes! This is the gold standard for enterprise platforms. While our current architecture (from Q11) relies on a single `.env` API key for the whole system, we can easily upgrade this to allow tenants to bring their own Resend, SendGrid, or Twilio accounts.
*   **Database Upgrade:** We create a new table called `provider_configs` (or add a JSONB `custom_credentials` column to the `tenants` table).
*   **UI Integration:** In the Admin Panel, under the tenant's settings, we add an "Integrations" tab where they can select a provider (e.g., Resend), paste their API key, and set their verified sender email.
*   **Worker Logic:** Before dispatching an email, the worker checks: *"Does this tenant have a custom Resend API key in the DB?"* If yes, the worker dynamically initializes a new Resend SDK instance using that specific key. If no, it falls back to the platform's default shared SendGrid/Resend key. *(Note: We must encrypt these API keys at rest in the database!)*

**3. Multiple Tenants Utilizing the Same Configuration**
Absolutely! This is perfect for when a single client organization has multiple distinct products (tenants) but wants to pay centrally under one single Resend/SendGrid billing account.
To achieve this gracefully without duplicating API keys everywhere, we normalize the configuration:
*   Instead of putting the API key directly inside the `tenants` row, we create a distinct `provider_configs` table.
*   The `tenants` table gets a `provider_config_id` foreign key. 
*   Now, you can have "Tenant A" (Ecommerce), "Tenant B" (Support), and "Tenant C" (Marketing) all point their `provider_config_id` to the exact same "Client X Resend Account" row in the database. 
They all share the exact same configuration via the Admin UI, but their templates, user channels, and distinct logic remain perfectly isolated!

### Q14: The template configuration is not intuitive as we have to input mjml. Are we okay to retain it as is or is there another approach we can take?

**Answer:**

This is a very common challenge when building communication platforms. Writing raw MJML by hand is powerful for developers, but it is completely unscalable and unintuitive for Content Managers, Marketers, or Admins who will actually be using the dashboard.

We have a few distinct approaches to solve this, moving from "quick wins" to "enterprise grade":

**Approach 1: Integrate a Visual Drag-and-Drop Editor (Recommended)**
Instead of stripping out MJML entirely (because MJML is phenomenal for ensuring responsive, cross-client email compatibility), we keep the backend *exactly as is*. But in the **Admin UI**, we replace the raw text area with a visual Drag-and-Drop builder.
*   **How it works:** We integrate a library like **Unlayer** or **GrapesJS** (which has an MJML preset) directly into our React template creation page. 
*   **The Workflow:** The content team drags blocks (images, text, buttons) onto a canvas. When they click "Save", the React editor *automatically compiles that visual block into raw MJML* behind the scenes, and we save that MJML string to the database.
*   **Why it's great:** Our backend worker `RenderService` doesn't need to change at all. The content team gets a beautiful interface, and we retain perfectly responsive emails.

**Approach 2: Provider-Hosted Templates (The Decoupled Route)**
If we don't want to manage templates visually in our platform at all, we can fully offload this to the third-party providers (SendGrid, Resend, etc.).
*   **How it works:** We add a new `provider_external_template_id` string to our `templates` database table.
*   **The Workflow:** The content team logs into SendGrid.com or Resend.com and uses *their* visual builders to make the templates. They copy the ID (e.g., `d-12345`) and paste it into our Admin UI. 
*   **Backend Change:** When the NestJS worker fires, instead of compiling MJML internally, it simply tells SendGrid: *"Send email to user@app.com using Template 'd-12345' and inject these dynamic JSON variables."*
*   **Downside:** This breaks provider agnosticism. If a tenant uses SendGrid for their template, and later switches to Resend, their template won't work anymore.

**Approach 3: Retain as is? (Not Recommended Long-Term)**
Retaining raw MJML input in the UI is okay for an **MVP (Minimum Viable Product)** phase if only engineers are configuring the system. It is absolutely unacceptable for a final product where non-technical stakeholders are involved.

**The Verdict:**
For the immediate future (Phase 1), it is perfectly fine to retain the raw-MJML input just to ensure the plumbing works. However, for Phase 2 (Polishing the UI), we should absolutely implement **Approach 1**. Adding a React-based visual builder like `react-email-editor` (Unlayer) gives us the ultimate enterprise feel without forcing us to redesign our robust backend architecture!

### Q15: Under utilization of the redis container

**Answer:**
To directly address your question: No, the Redis container is not currently being used to its full capacity.

Right now, based on your docker-compose.yml, the redis:7-alpine container is running exclusively to serve as the CENTRIFUGO_ENGINE_REDIS_ADDRESS.

Centrifugo uses Redis for horizontal scalability (fast Pub/Sub between multiple Centrifugo nodes, though you only spin up one node currently) and for keeping state (memory of who is connected, and storing the exact missed socket messages for short "history" recovery when a mobile user reconnects).

While Centrifugo easily requires Redis to function optimally in production, your NestJS Worker and Admin Backend are notably absent from connecting to it.

How We Can Fully Utilize It in the Future:
Instead of treating Redis as just "Centrifugo's Database", the rest of the Notifications Microservice could leverage the exact same container to drastically lower the load on your PostgreSQL database:

1. **Idempotency Caching**: Right now, when a webhook triggers, NestJS hashes the payload and queries the PostgreSQL processed_events table. If thousands of requests hit per second, hitting Postgres for idempotency deduping gets very expensive. This should be a fast SETNX (Set if Not Exists) operation in Redis with an automatic 24-hour TTL expiration.
2. **API Key -> Tenant Resolution**: Your Webhook heavily queries PostgreSQL to check where: { api_key } simply to get the active Tenant identity. API Keys rarely change. This resolution should be instantly cached in Redis.
3. **Rate Limiting**: If your RateLimiterService is counting API hits in Postgres, moving this to Redis logic (like Lua sliding windows) is industry standard and significantly faster.