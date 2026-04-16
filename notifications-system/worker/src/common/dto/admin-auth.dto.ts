/**
 * DTOs for Admin Authentication
 */

export interface AdminLoginDto {
  username: string;
  password: string;
}

export interface AdminTokenPayload {
  sub: string;
  role: 'admin';
  iat?: number;
  exp?: number;
}

export interface TemplatePreviewDto {
  content_body: string;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line?: string;
  sample_data?: unknown;
}
