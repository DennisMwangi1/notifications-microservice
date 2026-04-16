import { BadRequestException } from '@nestjs/common';
import { TemplatePreviewController } from './template-preview.controller';

describe('TemplatePreviewController', () => {
  let controller: TemplatePreviewController;

  beforeEach(() => {
    controller = new TemplatePreviewController();
  });

  it('rejects sample_data values that are not top-level JSON objects', async () => {
    await expect(
      controller.previewTemplate({
        content_body: 'Hello {{name}}',
        channel_type: 'SMS',
        sample_data: ['not', 'an', 'object'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns referenced, missing, and unused variable diagnostics for nested data', async () => {
    const result = await controller.previewTemplate({
      content_body:
        '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{user.profile.firstName}}</mj-text></mj-column></mj-section></mj-body></mjml>',
      channel_type: 'EMAIL',
      subject_line: 'Order {{orderId}}',
      sample_data: {
        user: {
          profile: {
            firstName: 'Jane',
          },
        },
        unused: 'value',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.referenced_variables).toEqual([
      'orderId',
      'user.profile.firstName',
    ]);
    expect(result.data.missing_variables).toEqual(['orderId']);
    expect(result.data.unused_variables).toEqual(['unused']);
  });

  it('returns a graceful warning instead of throwing when handlebars braces are empty', async () => {
    const result = await controller.previewTemplate({
      content_body:
        '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{}}</mj-text></mj-column></mj-section></mj-body></mjml>',
      channel_type: 'EMAIL',
      sample_data: {
        name: 'Jane',
      },
    });

    expect(result.success).toBe(false);
    expect(
      result.data.warnings.some((warning) =>
        warning.includes('Handlebars syntax error in template'),
      ),
    ).toBe(true);
  });
});
