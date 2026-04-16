/* eslint-disable @typescript-eslint/unbound-method */

jest.mock('../config/prisma.config', () => ({
  __esModule: true,
  default: {
    template_library: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { BadRequestException } from '@nestjs/common';
import prisma from '../config/prisma.config';
import { TemplateLibraryController } from './template-library.controller';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';

describe('TemplateLibraryController', () => {
  let controller: TemplateLibraryController;
  let dbContext: Pick<DbContextService, 'withActorContext'>;
  let auditLog: Pick<AuditLogService, 'record'>;
  const mockReq = {
    actorContext: {
      actorType: 'platform_operator' as const,
      actorId: 'platform-user',
      tenantId: null,
    },
  };

  beforeEach(() => {
    dbContext = {
      withActorContext: jest.fn(async (_actor, callback) =>
        callback(prisma as never),
      ),
    };
    auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    controller = new TemplateLibraryController(
      dbContext as DbContextService,
      auditLog as AuditLogService,
    );
    jest.clearAllMocks();
  });

  it('creates a reusable template entry with only referenced sample_data', async () => {
    const sampleData = {
      orderId: 'ORD-1',
      user: {
        firstName: 'Jane',
        loyaltyTier: 'Gold',
      },
      support_email: 'support@example.com',
    };
    const prunedSampleData = {
      orderId: 'ORD-1',
      user: {
        firstName: 'Jane',
      },
    };
    const createdEntry = {
      id: 'library-1',
      name: 'Order confirmation',
      channel_type: 'EMAIL',
      subject_line: 'Order {{orderId}}',
      content_body: '<mjml />',
      sample_data: prunedSampleData,
      created_at: new Date(),
      updated_at: new Date(),
    };

    jest
      .mocked(prisma.template_library.create)
      .mockResolvedValue(createdEntry as never);

    const result = await controller.createTemplateLibraryEntry({
      tenant_id: 'tenant-1',
      name: 'Order confirmation',
      channel_type: 'EMAIL',
      subject_line: 'Order {{orderId}}',
      content_body: '<mjml><mj-text>{{user.firstName}}</mj-text></mjml>',
      sample_data: sampleData,
    }, mockReq as never);

    expect(prisma.template_library.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 'tenant-1',
        name: 'Order confirmation',
        channel_type: 'EMAIL',
        subject_line: 'Order {{orderId}}',
        content_body: '<mjml><mj-text>{{user.firstName}}</mj-text></mjml>',
        sample_data: prunedSampleData,
      },
    });
    expect((result.data as { sample_data: unknown }).sample_data).toEqual(
      prunedSampleData,
    );
  });

  it('preserves the full sample_data when template syntax cannot be analyzed safely', async () => {
    const sampleData = {
      orderId: 'ORD-1',
      support_email: 'support@example.com',
    };
    const createdEntry = {
      id: 'library-2',
      name: 'Broken template',
      channel_type: 'EMAIL',
      subject_line: 'Order {{orderId}}',
      content_body: '<mjml>{{#if orderId}}</mjml>',
      sample_data: sampleData,
      created_at: new Date(),
      updated_at: new Date(),
    };

    jest
      .mocked(prisma.template_library.create)
      .mockResolvedValue(createdEntry as never);

    await controller.createTemplateLibraryEntry({
      tenant_id: 'tenant-1',
      name: 'Broken template',
      channel_type: 'EMAIL',
      subject_line: 'Order {{orderId}}',
      content_body: '<mjml>{{#if orderId}}</mjml>',
      sample_data: sampleData,
    }, mockReq as never);

    expect(prisma.template_library.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 'tenant-1',
        name: 'Broken template',
        channel_type: 'EMAIL',
        subject_line: 'Order {{orderId}}',
        content_body: '<mjml>{{#if orderId}}</mjml>',
        sample_data: sampleData,
      },
    });
  });

  it('lists reusable template entries filtered by channel', async () => {
    const entries = [
      {
        id: 'library-3',
        name: 'SMS receipt',
        channel_type: 'SMS',
        subject_line: null,
        content_body: 'Hi {{name}}',
        sample_data: { name: 'Jane' },
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    jest
      .mocked(prisma.template_library.findMany)
      .mockResolvedValue(entries as never);

    const listResult = await controller.getTemplateLibrary(
      'SMS',
      undefined,
      mockReq as never,
    );

    expect(prisma.template_library.findMany).toHaveBeenCalledWith({
      where: { channel_type: 'SMS' },
      orderBy: [{ created_at: 'desc' }, { name: 'asc' }],
    });
    expect(listResult.data).toEqual(entries);
  });

  it('rejects non-object sample_data payloads', async () => {
    await expect(
      controller.createTemplateLibraryEntry({
        tenant_id: 'tenant-1',
        name: 'Broken',
        channel_type: 'EMAIL',
        subject_line: 'Broken',
        content_body: '<mjml />',
        sample_data: [] as unknown as Record<string, unknown>,
      }, mockReq as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
