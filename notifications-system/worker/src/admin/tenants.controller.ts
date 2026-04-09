import { Controller, Get, Post, Put, Delete, Body, Param, NotFoundException, UseGuards } from '@nestjs/common';
import prisma from '../config/prisma.config';
import { AppLoggerService } from '../common/app-logger.service';
import { randomBytes } from 'crypto';
import { CreateTenantDto, UpdateTenantDto } from '../common/dto/admin.dto';
import { cacheTenantIdentity, invalidateTenantIdentityCache } from '../common/ingress-cache';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';

@Controller('api/v1/admin/tenants')
@UseGuards(AdminAuthGuard)
export class TenantsController {
    constructor(private readonly logger: AppLoggerService) {}

    @Post()
    async createTenant(@Body() body: CreateTenantDto) {
        const {
            name,
            allowed_channels,
            webhook_secret,
            provider_config_id,
            sender_email,
            sender_name,
            rate_limit_per_minute,
            daily_notification_cap,
        } = body;

        const apiKey = randomBytes(32).toString('hex');

        const tenant = await prisma.tenants.create({
            data: {
                name,
                api_key: apiKey,
                webhook_secret,
                allowed_channels: allowed_channels || [],
                provider_config_id,
                sender_email,
                sender_name,
                rate_limit_per_minute,
                daily_notification_cap,
            }
        });

        await cacheTenantIdentity(tenant.api_key, {
            id: tenant.id,
            name: tenant.name,
            is_active: tenant.is_active,
            webhook_secret: tenant.webhook_secret,
            sender_email: tenant.sender_email,
            sender_name: tenant.sender_name,
            provider_config_id: tenant.provider_config_id,
            rate_limit_per_minute: tenant.rate_limit_per_minute,
            daily_notification_cap: tenant.daily_notification_cap,
        }).catch((error) => this.logger.error('Failed to warm tenant cache after creation:', error));

        return { success: true, data: tenant };
    }

    @Get()
    async getTenants() {
        const tenants = await prisma.tenants.findMany({
            orderBy: { created_at: 'desc' }
        });
        return { success: true, data: tenants };
    }

    @Get(':id')
    async getTenant(@Param('id') id: string) {
        const tenant = await prisma.tenants.findUnique({
            where: { id }
        });

        if (!tenant) {
            throw new NotFoundException('Tenant not found');
        }

        return { success: true, data: tenant };
    }

    @Put(':id')
    async updateTenant(@Param('id') id: string, @Body() body: UpdateTenantDto) {
        const existingTenant = await prisma.tenants.findUnique({
            where: { id },
            select: { api_key: true },
        });

        if (!existingTenant) {
            throw new NotFoundException('Tenant not found');
        }

        const tenant = await prisma.tenants.update({
            where: { id },
            data: body
        });

        await invalidateTenantIdentityCache(existingTenant.api_key)
            .catch((error) => this.logger.error('Failed to invalidate tenant cache after update:', error));

        return { success: true, data: tenant };
    }

    @Put(':id/rotate-key')
    async rotateApiKey(@Param('id') id: string) {
        const existingTenant = await prisma.tenants.findUnique({
            where: { id },
            select: { api_key: true },
        });

        if (!existingTenant) {
            throw new NotFoundException('Tenant not found');
        }

        const newApiKey = randomBytes(32).toString('hex');

        const tenant = await prisma.tenants.update({
            where: { id },
            data: { api_key: newApiKey }
        });

        await Promise.all([
            invalidateTenantIdentityCache(existingTenant.api_key),
            invalidateTenantIdentityCache(newApiKey),
        ]).catch((error) => this.logger.error('Failed to invalidate tenant cache after API key rotation:', error));

        return { success: true, message: 'API Key rotated securely', data: { api_key: tenant.api_key } };
    }

    @Delete(':id')
    async deactivateTenant(@Param('id') id: string) {
        const existingTenant = await prisma.tenants.findUnique({
            where: { id },
            select: { api_key: true },
        });

        if (!existingTenant) {
            throw new NotFoundException('Tenant not found');
        }

        const tenant = await prisma.tenants.update({
            where: { id },
            data: { is_active: false }
        });

        await invalidateTenantIdentityCache(existingTenant.api_key)
            .catch((error) => this.logger.error('Failed to invalidate tenant cache after deactivation:', error));

        return { success: true, message: 'Tenant deactivated successfully', data: tenant };
    }
}
