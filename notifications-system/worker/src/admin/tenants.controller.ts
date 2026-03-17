import { Controller, Get, Post, Put, Delete, Body, Param, NotFoundException } from '@nestjs/common';
import prisma from '../config/prisma.config';
import { randomBytes } from 'crypto';
import { CreateTenantDto, UpdateTenantDto } from '../common/dto/admin.dto';

@Controller('api/v1/admin/tenants')
export class TenantsController {

    // 1. Create a brand new tenant (Project Onboarding)
    @Post()
    async createTenant(@Body() body: CreateTenantDto) {
        const { name, allowed_channels, provider_config_id, sender_email, sender_name, rate_limit_per_minute, daily_notification_cap } = body;

        // Generate a secure, 64-character hex string to act as the Tenant API Key
        const apiKey = randomBytes(32).toString('hex');

        const tenant = await prisma.tenants.create({
            data: {
                name,
                api_key: apiKey,
                allowed_channels: allowed_channels || [],
                provider_config_id,
                sender_email,
                sender_name,
                rate_limit_per_minute,
                daily_notification_cap,
            }
        });

        return { success: true, data: tenant };
    }

    // 2. Fetch all tenants for the Super Admin Dashboard
    @Get()
    async getTenants() {
        const tenants = await prisma.tenants.findMany({
            orderBy: { created_at: 'desc' }
        });
        return { success: true, data: tenants };
    }

    // 3. Fetch specific tenant details
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

    // 4. Update tenant configuration (like modifying their allowed Centrifugo channels)
    @Put(':id')
    async updateTenant(@Param('id') id: string, @Body() body: UpdateTenantDto) {
        const tenant = await prisma.tenants.update({
            where: { id },
            data: body
        });
        return { success: true, data: tenant };
    }

    // 5. Emergency Action: API Key Rotation
    @Put(':id/rotate-key')
    async rotateApiKey(@Param('id') id: string) {
        const newApiKey = randomBytes(32).toString('hex');

        const tenant = await prisma.tenants.update({
            where: { id },
            data: { api_key: newApiKey }
        });

        return { success: true, message: 'API Key rotated securely', data: { api_key: tenant.api_key } };
    }

    // 6. Deactivate a compromised or unpaid tenant
    @Delete(':id')
    async deactivateTenant(@Param('id') id: string) {
        const tenant = await prisma.tenants.update({
            where: { id },
            data: { is_active: false }
        });

        return { success: true, message: 'Tenant deactivated successfully', data: tenant };
    }
}
