import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import prisma from '../config/prisma.config';
import { randomUUID } from 'crypto';

@Controller('api/v1/admin/templates')
export class TemplatesController {

    // 1. Create a new iteration/version of a template (Content Editing)
    @Post()
    async createTemplate(@Body() body: {
        tenant_id?: string;
        event_type: string;
        channel_type: 'EMAIL' | 'SMS' | 'PUSH';
        subject_line?: string;
        content_body: string;
        target_ws_channel?: string;
    }) {
        const { tenant_id, event_type, channel_type, subject_line, content_body, target_ws_channel } = body;

        // Check if the template for this event/channel combo already exists to properly increment version safely
        const existing = await prisma.templates.findFirst({
            where: {
                tenant_id: tenant_id || null, // Handle Global vs Local
                event_type,
                channel_type
            },
            orderBy: { version: 'desc' }
        });

        const newVersion = existing ? existing.version + 1 : 1;
        // Group iterative versions under the exact same template_id. If none exists, generate a new one.
        const templateId = existing ? existing.template_id : randomUUID();

        const template = await prisma.templates.create({
            data: {
                template_id: templateId,
                version: newVersion,
                tenant_id: tenant_id || null,
                event_type,
                channel_type,
                subject_line,
                content_body,
                target_ws_channel,
                is_active: true
            }
        });

        return { success: true, data: template };
    }

    // 2. Fetch all templates for the Content Dashboard (Optional tenant filtering)
    @Get()
    async getTemplates(@Query('tenantId') tenantId: string) {
        const whereClause = tenantId ? { tenant_id: tenantId } : {};

        const templates = await prisma.templates.findMany({
            where: whereClause,
            orderBy: [
                { tenant_id: 'asc' },
                { event_type: 'asc' },
                { version: 'desc' }
            ]
        });

        return { success: true, data: templates };
    }

    // 3. Deactivate a bad template version (E.g. Rollback due to a broken MJML deploy)
    @Put(':template_id/version/:version/deactivate')
    async deactivateTemplate(
        @Param('template_id') templateId: string,
        @Param('version') version: string
    ) {
        const template = await prisma.templates.update({
            where: {
                template_id_version: {
                    template_id: templateId,
                    version: parseInt(version, 10)
                }
            },
            data: { is_active: false }
        });

        return { success: true, message: 'Template version deactivated successfully', data: template };
    }

    // 4. Reactivate a previously deactivated version (Rollback)
    @Put(':template_id/version/:version/reactivate')
    async reactivateTemplate(
        @Param('template_id') templateId: string,
        @Param('version') version: string
    ) {
        const template = await prisma.templates.update({
            where: {
                template_id_version: {
                    template_id: templateId,
                    version: parseInt(version, 10)
                }
            },
            data: { is_active: true }
        });

        return { success: true, message: 'Template version reactivated successfully', data: template };
    }

    // 5. Fetch the entire version history for a specific template
    @Get(':template_id/versions')
    async getTemplateVersions(@Param('template_id') templateId: string) {
        const versions = await prisma.templates.findMany({
            where: { template_id: templateId },
            orderBy: { version: 'desc' }
        });

        return { success: true, data: versions };
    }
}
