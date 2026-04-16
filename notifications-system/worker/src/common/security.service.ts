import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class SecurityService {
  /**
   * Verifies the HMAC-SHA256 signature of a webhook payload.
   * @param rawBody The raw string buffer of the request body.
   * @param signature The signature provided in the X-Nucleus-Signature header.
   * @param secret The webhook secret associated with the tenant.
   */
  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    const computedSignature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computedSignature, 'hex');

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, computedBuffer);
  }

  /**
   * Utility for integration teams to sign their payloads.
   */
  signPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}
