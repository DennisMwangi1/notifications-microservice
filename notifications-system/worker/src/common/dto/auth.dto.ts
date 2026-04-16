/**
 * DTOs for the Auth Controller
 */

export interface GenerateTokenDto {
  userId: string;
  tenantId: string;
}

export interface TokenResponse {
  token: string;
  channels: string[];
}
