import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import prisma from '../config/prisma.config';
import { GenerateTokenDto } from '../common/dto/auth.dto';

@Controller('api/v1/auth')
export class AuthController {
  @Post('realtime-token')
  async generateToken(@Body() body: GenerateTokenDto) {
    const { userId, tenantId } = body;

    if (!userId || !tenantId) {
      throw new UnauthorizedException('Missing userId or tenantId');
    }

    const secret = process.env.CENTRIFUGO_SECRET;
    if (!secret) {
      throw new Error('CENTRIFUGO_SECRET is not configured');
    }

    const cleanKey = tenantId.trim();
    const tenant = await prisma.tenants.findUnique({
      where: { id: cleanKey },
    });

    if (!tenant || !tenant.is_active) {
      throw new UnauthorizedException(
        'Invalid or inactive Property ID / API Key',
      );
    }

    // 1. Define global channels that every token receives
    const allowedChannels = [`global_system#${userId}`];

    // 2. Add boundary channels dynamically based on the tenant's DB configuration
    for (const channel of tenant.allowed_channels) {
      allowedChannels.push(`${channel}#${userId}`);
    }

    // 3. Sign the JWT explicitly allocating the 'channels'
    const token = jwt.sign(
      {
        sub: userId,
        channels: allowedChannels,
      },
      secret,
      { expiresIn: '24h' },
    );

    return { token, channels: allowedChannels };
  }
}
