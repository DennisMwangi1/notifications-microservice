# Notifications Team Setup Steps (Admin Control Plane)

This document outlines the steps the Core Notifications Team must take within the Admin Control Plane to onboard a new tenant and configure their baseline infrastructure.

---

## 1. Onboard the Tenant
1. Navigate to **Tenants & Projects**.
2. Click **+ Onboard Project**.
3. Name: `[Tenant Name]` (e.g., `TMaaS Processing Engine`).
4. WebSocket Boundaries: Define the isolated namespaces (e.g., `tmaas_alerts, tmaas_chat`).
5. Securely share the generated **API Key** and **Tenant ID** with the Tenant's Engineering Lead.

## 2. Establish Global Base Templates (System Level)
To prevent template bloat, ensure the following **Global Templates** are deployed in the **Global Templates** section (`tenant_id = NULL`). These act as fallbacks for all tenants.

*   `global.success` (Email & Push) -> For successful operations (Approved, Signed, etc.).
*   `global.info` (Email & Push) -> For standard lifecycle events (Created, Assigned, etc.).
*   `global.warning` (Email & Push) -> For time-sensitive alerts (Deadlines, Expiring, etc.).
*   `global.alert` (Email & Push) -> For critical or failed issues (Rejected, Compliance, etc.).

## 3. Configure Tenant-Specific Overrides (Routing Matrix)
If a tenant requires specific routing (e.g., a specific WebSocket namespace or a custom MJML design), configure it in the **Tenant Routing Matrix**.

### Example: Chat Isolation
For events like `chat.new_message`, we often need to route to a specific namespace:
1. Navigate to **Tenant Routing Matrix**.
2. Select the **Tenant** from the dropdown.
3. Event Trigger: `tmaas.chat.new_message`.
4. Medium: **PUSH**.
5. Target Boundary Namespace: `tmaas_chat`.
6. Body: `{{senderName}}: {{messagePreview}}`.

## 4. Instruct the Integrating Team
Ensure the integrating project is aware that they should use the `global.*` event types for 90% of their operational notifications, passing the `title` and `message` dynamically in the payload. This keeps the Admin UI clean and allows for instant global branding updates.

---

## Appendix: Global MJML Templates

Use these as the baseline for the **Global Templates** sidebar. They are designed to be "dumb" and render whatever `title` and `message` strings are passed in the webhook payload.

### 1. Global Info (`global.info`)
**Brand Color:** Blue (`#3b82f6`)
```xml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif"></mj-all>
      <mj-text font-size="16px" color="#475569" line-height="24px"></mj-text>
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding-bottom="0px">
      <mj-column width="100%">
        <mj-divider border-width="4px" border-style="solid" border-color="#3b82f6" padding="0px"></mj-divider>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding-top="40px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#1e293b">{{title}}</mj-text>
        <mj-text>{{message}}</mj-text>
        <mj-divider border-width="1px" border-color="#e2e8f0" border-style="solid" padding-top="20px"></mj-divider>
        <mj-text font-size="12px" color="#64748b" align="center">Nucleus Omnichannel Engine</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### 2. Global Success (`global.success`)
**Brand Color:** Green (`#10b981`)
```xml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif"></mj-all>
      <mj-text font-size="16px" color="#475569" line-height="24px"></mj-text>
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding-bottom="0px">
      <mj-column width="100%">
        <mj-divider border-width="4px" border-style="solid" border-color="#10b981" padding="0px"></mj-divider>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding-top="40px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#064e3b">✔ {{title}}</mj-text>
        <mj-text>{{message}}</mj-text>
        <mj-divider border-width="1px" border-color="#e2e8f0" border-style="solid" padding-top="20px"></mj-divider>
        <mj-text font-size="12px" color="#64748b" align="center">Nucleus Omnichannel Engine</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### 3. Global Warning (`global.warning`)
**Brand Color:** Amber (`#f59e0b`)
```xml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif"></mj-all>
      <mj-text font-size="16px" color="#475569" line-height="24px"></mj-text>
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding-bottom="0px">
      <mj-column width="100%">
        <mj-divider border-width="4px" border-style="solid" border-color="#f59e0b" padding="0px"></mj-divider>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding-top="40px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#78350f">⚠ {{title}}</mj-text>
        <mj-text>{{message}}</mj-text>
        <mj-divider border-width="1px" border-color="#e2e8f0" border-style="solid" padding-top="20px"></mj-divider>
        <mj-text font-size="12px" color="#64748b" align="center">Nucleus Omnichannel Engine</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### 4. Global Alert / Error (`global.alert`)
**Brand Color:** Red (`#ef4444`)
```xml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif"></mj-all>
      <mj-text font-size="16px" color="#475569" line-height="24px"></mj-text>
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding-bottom="0px">
      <mj-column width="100%">
        <mj-divider border-width="4px" border-style="solid" border-color="#ef4444" padding="0px"></mj-divider>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding-top="40px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#7f1d1d">🚨 {{title}}</mj-text>
        <mj-text>{{message}}</mj-text>
        <mj-divider border-width="1px" border-color="#e2e8f0" border-style="solid" padding-top="20px"></mj-divider>
        <mj-text font-size="12px" color="#64748b" align="center">Nucleus Omnichannel Engine</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```
