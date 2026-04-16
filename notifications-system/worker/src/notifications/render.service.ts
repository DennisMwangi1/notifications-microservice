import { Injectable } from '@nestjs/common';
import mjml2html from 'mjml';
import * as handlebars from 'handlebars';
import { AppLoggerService } from '../common/app-logger.service';

@Injectable()
export class RenderService {
  constructor(private readonly logger: AppLoggerService) {}

  /**
   * Transforms raw MJML + Data into final responsive HTML
   */
  render(templateMjml: string, context: Record<string, any>): string {
    try {
      const hbTemplate = handlebars.compile(templateMjml);
      const interpolatedMjml = hbTemplate(context);

      const { html, errors } = mjml2html(interpolatedMjml, {
        validationLevel: 'soft',
      });

      if (errors?.length) {
        this.logger.warn('MJML warnings', { errors });
      }

      return html;
    } catch (err) {
      this.logger.error('MJML render failed:', err);
      throw err;
    }
  }

  /**
   * Transforms raw text Handlebars safely without invoking MJML HTML XML parsers
   */
  renderText(templateString: string, context: Record<string, any>): string {
    const hbTemplate = handlebars.compile(templateString, { noEscape: true });
    return hbTemplate(context);
  }
}
