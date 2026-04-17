/**
 * DTOs for the Admin Controllers
 */

// ─── Tenants ────────────────────────────────

export interface CreateTenantDto {
  name: string;
  allowed_channels: string[];
  webhook_secret?: string;
  provider_config_id?: string;
  sender_email?: string;
  sender_name?: string;
  rate_limit_per_minute?: number;
  daily_notification_cap?: number;
  max_template_count?: number;
  tenantAdmin?: ProvisionTenantAdminDto;
  sendOnboardingEmail?: boolean;
}

export interface UpdateTenantDto {
  name?: string;
  allowed_channels?: string[];
  is_active?: boolean;
  webhook_secret?: string;
  provider_config_id?: string;
  sender_email?: string;
  sender_name?: string;
  rate_limit_per_minute?: number;
  daily_notification_cap?: number;
  max_template_count?: number;
  audit_reason?: string;
}

export interface CreateTenantAdminDto {
  username: string;
  email: string;
  display_name?: string;
  password?: string;
}

export interface ProvisionTenantAdminDto {
  username: string;
  email: string;
  displayName?: string;
}

export interface AdminActionReasonDto {
  reason: string;
}

// ─── Provider Configs ──────────────────────

export interface CreateProviderConfigDto {
  name: string;
  provider: 'SENDGRID' | 'RESEND' | 'TWILIO' | 'AFRICASTALKING' | 'CUSTOM';
  api_key: string;
  sender_email?: string;
  sender_name?: string;
  tenant_id?: string;
}

export interface UpdateProviderConfigDto {
  name?: string;
  provider?: 'SENDGRID' | 'RESEND' | 'TWILIO' | 'AFRICASTALKING' | 'CUSTOM';
  api_key?: string;
  sender_email?: string;
  sender_name?: string;
}

export interface UpsertOperationalMailerConfigDto {
  name: string;
  provider: 'SENDGRID' | 'RESEND';
  api_key?: string;
  sender_email?: string;
  sender_name?: string;
  is_active?: boolean;
}

export interface UpsertOperationalEmailTemplateDto {
  name?: string;
  subject_line?: string | null;
  content_body: string;
  sample_data?: Record<string, unknown>;
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
  scope?: 'PLATFORM_DEFAULT' | 'TENANT_OVERRIDE' | 'TENANT_CUSTOM';
}

export interface CreateTemplateLibraryDto {
  tenant_id?: string;
  name: string;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line?: string | null;
  content_body: string;
  sample_data: Record<string, unknown>;
}

export interface TemplateLibraryDto extends CreateTemplateLibraryDto {
  id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

// ─── Notification Dispatch Payloads ─────────

export interface EmailDispatchPayload {
  actionType: 'EMAIL';
  notificationId: string;
  tenantId: string;
  eventId: string;
  traceId: string;
  userId: string;
  recipient: string;
  senderEmail?: string | null;
  senderName?: string | null;
  subject: string;
  body: string;
  provider: string;
  providerConfigId?: string | null;
}

export interface SmsDispatchPayload {
  actionType: 'SMS';
  notificationId: string;
  tenantId: string;
  eventId: string;
  traceId: string;
  userId: string;
  recipient: string;
  subject: string;
  body: string;
  provider: string;
  providerConfigId?: string | null;
}

export interface RealtimeDispatchPayload {
  actionType: 'REALTIME';
  notificationId: string;
  tenantId: string;
  eventId: string;
  traceId: string;
  userId: string;
  subject: string;
  body: string;
  category: string;
  eventType: string;
  wsChannel: string;
}

export type DispatchPayload =
  | EmailDispatchPayload
  | SmsDispatchPayload
  | RealtimeDispatchPayload;
