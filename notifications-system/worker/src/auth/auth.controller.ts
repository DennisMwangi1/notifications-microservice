import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import prisma from '../config/prisma.config';
import { GenerateTokenDto } from '../common/dto/auth.dto';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/auth')
export class AuthController {
  @Post('realtime-token')
  async generateToken(
    @Body() body: GenerateTokenDto,
    @Headers('x-api-key') apiKey: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const { userId } = body;

    if (!userId) {
      throw new UnauthorizedException('Missing userId');
    }

    const secret = process.env.CENTRIFUGO_SECRET;
    if (!secret) {
      throw new Error('CENTRIFUGO_SECRET is not configured');
    }

    const tenant = await this.resolveTenant(apiKey, req);

    if (!tenant || !tenant.is_active) {
      throw new UnauthorizedException(
        'Invalid or inactive tenant context',
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

  private async resolveTenant(
    apiKey: string | undefined,
    req: AuthenticatedRequest,
  ) {
    if (req.tenantAdminUser?.tenantId) {
      return prisma.tenants.findUnique({
        where: { id: req.tenantAdminUser.tenantId },
      });
    }

    const cleanKey = apiKey?.trim();
    if (!cleanKey) {
      throw new UnauthorizedException(
        'Provide tenant admin bearer token or x-api-key header',
      );
    }

    return prisma.tenants.findFirst({
      where: { api_key: cleanKey },
    });
  }
}
