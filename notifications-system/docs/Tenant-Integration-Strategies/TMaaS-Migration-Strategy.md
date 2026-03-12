# TMaaS Comprehensive Migration & System Change Strategy

Based on an analysis of the existing TMaaS Notification infrastructure and the new B2B SaaS routing requirements, this document outlines the end-to-end migration strategy. 

The goal is to move from a heavily coupled, database-driven trigger system to the Central **Omnichannel Notification Engine**, enabling simultaneous Push and Email delivery based on business priority.

---

## 1. Architectural Changes Required in TMaaS (Engineering Team)

### A. Deleting PostgreSQL Triggers
**Current:** Database triggers (e.g., `notify_on_request_update`) handle business logic and string generation (`"Active"`, `"Paused"`).
**Action:** **Delete these triggers.** TMaaS is no longer responsible for formatting or storing notification strings in the database. When state changes occur, the TMaaS Node.js Backend will strictly fire HTTP Webhooks to the Central Engine.

### B. Shifting Preference Filtering to the Backend
**Current:** The React Frontend fetches notifications and silently hides them if the user's preferences prohibit that category.
**Action:** The TMaaS backend **must** evaluate user preferences *before* firing the Webhook. **If the user has opted out, do not fire the webhook.** This saves bandwidth and ensures we don't accidentally send Emails for events the user didn't want.

### C. Replacing Supabase Realtime & Polling
**Current:** TMaaS attempts to use `postgres_changes` via MSAL JWTs and falls back to aggressively polling `/api/notifications` every 20 seconds.
**Action:** Delete the 20-second polling loops entirely. The TMaaS frontend will simply request a `realtime-token` from the Central Engine and connect to the highly optimized **Centrifugo WebSocket** pipe (`tmaas_alerts` and `tmaas_chat` namespaces).

### D. Retaining the React UI (Drop-in Replacement)
**Current:** TMaaS has a robust thick-client UI (`NotificationCenter`) with dynamic categorization and text searching.
**Action:** Keep the UI! Change the data-fetching layer to call the Central Engine's REST API (`GET /api/v1/notifications/{tenantId}/{userId}`) instead of the internal TMaaS proxy.

### E. Handling Broadcast Events Loop
**Current:** Postgres triggers currently "broadcast" to all admins.
**Action:** Because our engine routes 1-to-1, the TMaaS Node.js backend must loop through available admins and fire a single webhook for each individual admin (e.g., during `tmaas.admin.request_assigned`).

---

## 2. Event Routing Matrix (Business Logic)

The TMaaS backend will utilize the **Global Fallback** architecture to minimize template management. Most events are mapped to generic global types where the specific copy is passed in the payload.

### 🔴 High-Priority / System of Record (Email + Push)
These use the `global.*` templates. The payload **must** include `recipientEmail`, `title`, and `message`.

| Event Logic | Recommended `eventType` | Default Channel |
| :--- | :--- | :--- |
| Service Request Created | `global.info` | Email + Push |
| Status Changed (Active/Paused) | `global.info` | Email + Push |
| Request Approved/Rejected | `global.success` / `global.alert` | Email + Push |
| Contract Signed | `global.success` | Email + Push |
| Payment Reminder | `global.warning` | Email + Push |
| Compliance Alert | `global.alert` | Email + Push |

### 🟡 Medium-Priority / Workflow Updates (Push Default)
| Event Logic | Recommended `eventType` | Default Channel |
| :--- | :--- | :--- |
| Input Submitted | `global.info` | Push |
| Submission Deadline | `global.warning` | Push + Email (24hr) |

### 🟢 High-Volume / Conversational (Push Only)
| Event Logic | Recommended `eventType` | Default Channel |
| :--- | :--- | :--- |
| New Chat Message | `tmaas.chat.new_message` | Push (Isolated WS) |

---

## 3. Webhook Payload Contracts (Examples)

When TMaaS fires a Webhook to `POST /api/v1/events/trigger`, it must provide the necessary contact parameters if an Email is expected.

**Global Fallback Example (Email + Push expected):**
```json
{
  "apiKey": "TMAAS_SECRET_KEY",
  "eventType": "global.info",
  "payload": {
    "userId": "customer-uuid",
    "recipientEmail": "customer@example.com",
    "title": "Service Request Created!",
    "message": "Your request for Deep Cleaning (REQ-12345) has been received."
  }
}
```

**High Volume Example (Push expected ONLY):**
```json
{
  "apiKey": "TMAAS_SECRET_KEY",
  "eventType": "tmaas.chat.new_message",
  "payload": {
    "userId": "recipient-uuid",
    "senderName": "Jane Smith",
    "messagePreview": "I have arrived at the location..."
  }
}
```

---

*Refer to the [Tenant Setup Guide](../Tenant-Setup.md) for step-by-step instructions on onboarding the TMaaS tenant in the Admin Control Plane.*
