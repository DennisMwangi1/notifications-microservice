/**
 * DTOs for the Admin Controllers
 */

// ─── Tenants ────────────────────────────────

export interface CreateTenantDto {
    name: string;
    allowed_channels: string[];
}

export interface UpdateTenantDto {
    name?: string;
    allowed_channels?: string[];
    is_active?: boolean;
}

// ─── Templates ──────────────────────────────

export interface CreateTemplateDto {
    tenant_id?: string | null;
    event_type: string;
    channel_type: 'EMAIL' | 'SMS' | 'PUSH';
    subject_line?: string | null;
    content_body: string;
    target_ws_channel?: string | null;
}

// ─── Notification Dispatch Payloads ─────────

export interface EmailDispatchPayload {
    actionType: 'EMAIL';
    notificationId: string;
    tenantId: string;
    userId: string;
    recipient: string;
    senderEmail?: string | null;
    senderName?: string | null;
    subject: string;
    body: string;
    provider: string;
}

export interface SmsDispatchPayload {
    actionType: 'SMS';
    notificationId: string;
    tenantId: string;
    userId: string;
    recipient: string;
    subject: string;
    body: string;
    provider: string;
}

export interface RealtimeDispatchPayload {
    actionType: 'REALTIME';
    notificationId: string;
    tenantId: string;
    userId: string;
    subject: string;
    body: string;
    category: string;
    eventType: string;
    wsChannel: string;
}

export type DispatchPayload = EmailDispatchPayload | SmsDispatchPayload | RealtimeDispatchPayload;
