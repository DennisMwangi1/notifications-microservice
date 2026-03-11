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