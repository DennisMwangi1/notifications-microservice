import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import mjml2html from 'mjml';
import * as handlebars from 'handlebars';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { TemplatePreviewDto } from '../common/dto/admin-auth.dto';
import { analyzeTemplateVariables, isJsonObject } from './template-analysis';

/**
 * Template Preview Controller
 *
 * Renders MJML + Handlebars templates server-side and returns the
 * compiled HTML preview. This powers the "Template Playground" in the Admin UI.
 */
@Controller('api/v1/admin/templates')
@UseGuards(AdminAuthGuard)
export class TemplatePreviewController {
  @Post('preview')
  async previewTemplate(@Body() body: TemplatePreviewDto) {
    const { content_body, channel_type, subject_line, sample_data } = body;

    if (!content_body) {
      throw new BadRequestException('content_body is required');
    }

    if (sample_data !== undefined && !isJsonObject(sample_data)) {
      throw new BadRequestException('sample_data must be a JSON object');
    }

    const context = sample_data ?? this.getDefaultSampleData();
    const analysis = analyzeTemplateVariables(
      content_body,
      context,
      subject_line,
    );

    try {
      let renderedBody: string;
      let renderedSubject: string | null = null;
      const warnings: string[] = [...analysis.syntaxErrors];

      // Render subject line with Handlebars
      if (subject_line) {
        const subjectTemplate = handlebars.compile(subject_line);
        renderedSubject = subjectTemplate(context);
      }

      if (channel_type === 'EMAIL') {
        // Full MJML + Handlebars pipeline
        const hbTemplate = handlebars.compile(content_body);
        const interpolatedMjml = hbTemplate(context);

        const { html, errors } = mjml2html(interpolatedMjml, {
          validationLevel: 'soft',
        });

        if (errors?.length) {
          for (const err of errors) {
            warnings.push(`${err.tagName}: ${err.message}`);
          }
        }

        renderedBody = html;
      } else {
        // SMS / PUSH — plain text Handlebars only
        const hbTemplate = handlebars.compile(content_body, { noEscape: true });
        renderedBody = hbTemplate(context);
      }

      return await Promise.resolve({
        success: true,
        data: {
          html: renderedBody,
          subject: renderedSubject,
          channel_type,
          warnings,
          available_variables: analysis.availableVariables,
          referenced_variables: analysis.referencedVariables,
          missing_variables: analysis.missingVariables,
          unused_variables: analysis.unusedVariables,
          sampleDataUsed: context,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return await Promise.resolve({
        success: false,
        message: `Template rendering failed: ${message}`,
        data: {
          html: null,
          subject: null,
          channel_type,
          warnings: [...analysis.syntaxErrors, message],
          available_variables: analysis.availableVariables,
          referenced_variables: analysis.referencedVariables,
          missing_variables: analysis.missingVariables,
          unused_variables: analysis.unusedVariables,
          sampleDataUsed: context,
        },
      });
    }
  }

  private getDefaultSampleData(): Record<string, unknown> {
    return {
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      userId: 'usr_abc123',
      orderId: 'ORD-2025-0042',
      amount: '$149.99',
      company: 'Acme Corp',
      action_url: 'https://example.com/verify',
      timestamp: new Date().toISOString(),
      support_email: 'support@example.com',
    };
  }
}
