import { Injectable } from '@nestjs/common';
import mjml2html from 'mjml';
import * as handlebars from 'handlebars';

@Injectable()
export class RenderService {
  /**
   * Transforms raw MJML + Data into final responsive HTML
   */
  render(templateMjml: string, context: Record<string, any>): string {
    try {
      const hbTemplate = handlebars.compile(templateMjml);
      const interpolatedMjml = hbTemplate(context);

      const { html, errors } = mjml2html(interpolatedMjml, {
        validationLevel: "soft",
      });

      if (errors?.length) {
        console.warn("MJML warnings:", errors);
      }

      return html;
    } catch (err) {
      console.error("MJML render failed:", err);
      throw err;
    }
  }

  /**
   * Transforms raw text Handlebars safely without invoking MJML HTML XML parsers
   */
  renderText(templateString: string, context: Record<string, any>): string {
    const hbTemplate = handlebars.compile(templateString);
    return hbTemplate(context);
  }

}