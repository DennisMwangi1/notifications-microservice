import { Injectable } from '@nestjs/common';
import mjml2html from 'mjml';
import * as handlebars from 'handlebars';

@Injectable()
export class RenderService {
  /**
   * Transforms raw MJML + Data into final responsive HTML
   */
  render(templateMjml: string, context: any): string {
    // 1. Handlebars: Replace {{name}} or {{orderId}} with real values
    const hbTemplate = handlebars.compile(templateMjml);
    const interpolatedMjml = hbTemplate(context);

    // 2. MJML: Convert the markup into email-ready HTML
    const { html, errors } = mjml2html(interpolatedMjml);
    
    if (errors.length > 0) {
      // Log errors but return html anyway (best effort)
      console.warn('MJML Rendering Warnings:', errors);
    }
    
    return html;
  }
}