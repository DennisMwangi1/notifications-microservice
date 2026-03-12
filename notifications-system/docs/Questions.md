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