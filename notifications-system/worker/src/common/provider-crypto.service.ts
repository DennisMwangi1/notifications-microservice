import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const GCM_IV_LENGTH = 12;

@Injectable()
export class ProviderCryptoService {
  encrypt(secret: string): string {
    if (!secret) {
      throw new Error('Provider secret is required');
    }

    const iv = randomBytes(GCM_IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.resolveKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [iv, authTag, encrypted].map((part) => part.toString('base64')).join('.');
  }

  decrypt(ciphertext: string): string {
    const [ivB64, authTagB64, payloadB64] = ciphertext.split('.');
    if (!ivB64 || !authTagB64 || !payloadB64) {
      throw new Error('Malformed provider secret ciphertext');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.resolveKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadB64, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  maskSecret(secret: string): string {
    return secret.length <= 4 ? secret : secret.slice(-4);
  }

  private resolveKey(): Buffer {
    const baseSecret =
      process.env.CONFIG_ENCRYPTION_KEY || process.env.ADMIN_JWT_SECRET;
    if (!baseSecret) {
      throw new Error(
        'CONFIG_ENCRYPTION_KEY or ADMIN_JWT_SECRET must be configured',
      );
    }

    return createHash('sha256').update(baseSecret).digest();
  }
}
