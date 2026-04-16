/**
 * DTOs for Admin Authentication
 */

export interface AdminLoginDto {
  username: string;
  password: string;
}

export interface TenantAdminLoginDto {
  username: string;
  password: string;
}

export interface TemplatePreviewDto {
  content_body: string;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line?: string;
  sample_data?: unknown;
}
