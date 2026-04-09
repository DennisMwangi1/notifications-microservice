import { Controller, Get, Post, Put, Delete, Body, Param, NotFoundException, UseGuards } from '@nestjs/common';
import prisma from '../config/prisma.config';
import { CreateProviderConfigDto, UpdateProviderConfigDto } from '../common/dto/admin.dto';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';

@Controller('api/v1/admin/providers')
@UseGuards(AdminAuthGuard)
export class ProvidersController {

    // 1. Create a brand new provider configuration
    @Post()
    async createProvider(@Body() body: CreateProviderConfigDto) {
        const providerConfig = await prisma.provider_configs.create({
            data: {
                ...body,
            }
        });

        return { success: true, data: providerConfig };
    }

    // 2. Fetch all provider configurations
    @Get()
    async getProviders() {
        // Exclude the raw api_key from the list view for security
        const providers = await prisma.provider_configs.findMany({
            select: {
                id: true,
                name: true,
                provider: true,
                sender_email: true,
                sender_name: true,
                created_at: true,
            },
            orderBy: { created_at: 'desc' }
        });
        return { success: true, data: providers };
    }

    // 3. Fetch specific provider details
    @Get(':id')
    async getProvider(@Param('id') id: string) {
        const providerConfig = await prisma.provider_configs.findUnique({
            where: { id }
        });

        if (!providerConfig) {
            throw new NotFoundException('Provider configuration not found');
        }

        // Mask the API key partially so it's not fully exposed on subsequent fetches
        const maskedKey = providerConfig.api_key.substring(0, 4) + '...';

        return {
            success: true,
            data: {
                ...providerConfig,
                api_key: maskedKey
            }
        };
    }

    // 4. Update provider configuration
    @Put(':id')
    async updateProvider(@Param('id') id: string, @Body() body: UpdateProviderConfigDto) {
        const providerConfig = await prisma.provider_configs.update({
            where: { id },
            data: body
        });
        return { success: true, data: providerConfig };
    }

    // 5. Delete provider configuration
    @Delete(':id')
    async deleteProvider(@Param('id') id: string) {
        await prisma.provider_configs.delete({
            where: { id }
        });

        return { success: true, message: 'Provider configuration deleted successfully' };
    }
}
