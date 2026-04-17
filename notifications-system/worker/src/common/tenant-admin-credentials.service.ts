import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class TenantAdminCredentialsService {
  hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  verifyPassword(password: string, passwordHash: string): boolean {
    return this.hashPassword(password) === passwordHash;
  }

  generateTemporaryPassword(length = 12): string {
    const raw = randomBytes(Math.max(length, 12)).toString('base64url');
    return `${raw.slice(0, 8)}A1!${raw.slice(-4)}`;
  }
}
