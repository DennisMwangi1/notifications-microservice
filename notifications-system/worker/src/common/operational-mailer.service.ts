import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as handlebars from 'handlebars';
import mjml2html from 'mjml';
import prisma from '../config/prisma.config';
import { ProviderCryptoService } from './provider-crypto.service';

export const TENANT_ADMIN_WELCOME_TEMPLATE_KEY = 'tenant-admin-welcome';

export interface OnboardingEmailContext {
  tenantName: string;
  tenantAdminUsername: string;
  tenantAdminEmail: string;
  tenantAdminDisplayName?: string | null;
  temporaryPassword: string;
  platformLoginUrl: string;
  supportContact: string;
  allowedChannels: string[];
}

export interface OnboardingSendResult {
  success: boolean;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string | null;
  sentAt?: Date | null;
}

@Injectable()
export class OperationalMailerService {
  constructor(private readonly providerCrypto: ProviderCryptoService) {}

  async getConfig() {
    return prisma.operational_mailer_configs.findFirst({
      orderBy: { created_at: 'asc' },
    });
  }

  async getTemplate() {
    const existing = await prisma.operational_email_templates.findUnique({
      where: { template_key: TENANT_ADMIN_WELCOME_TEMPLATE_KEY },
    });

    if (existing) {
      return existing;
    }

    return prisma.operational_email_templates.create({
      data: {
        template_key: TENANT_ADMIN_WELCOME_TEMPLATE_KEY,
        name: 'Tenant Admin Welcome',
        subject_line: 'Welcome to {{tenantName}} on Nucleus',
        content_body: this.defaultTemplateBody(),
        sample_data: this.defaultSampleData() as Prisma.InputJsonValue,
        is_active: true,
      },
    });
  }

  async previewTemplate(input: {
    content_body: string;
    subject_line?: string | null;
    sample_data?: Record<string, unknown>;
  }) {
    const context = input.sample_data ?? this.defaultSampleData();
    const subject = input.subject_line
      ? handlebars.compile(input.subject_line)(context)
      : null;
    const renderedMjml = handlebars.compile(input.content_body)(context);
    const { html, errors } = mjml2html(renderedMjml, {
      validationLevel: 'soft',
    });

    return {
      subject,
      html,
      warnings: errors.map((item) => `${item.tagName}: ${item.message}`),
    };
  }

  async sendTenantAdminOnboarding(
    context: OnboardingEmailContext,
  ): Promise<OnboardingSendResult> {
    const [config, template] = await Promise.all([
      this.getConfig(),
      this.getTemplate(),
    ]);

    if (!config || !config.is_active) {
      return {
        success: false,
        status: 'SKIPPED',
        error: 'Operational mailer is not configured',
      };
    }

    if (!template.is_active) {
      return {
        success: false,
        status: 'SKIPPED',
        error: 'Operational onboarding template is inactive',
      };
    }

    const preview = await this.previewTemplate({
      content_body: template.content_body,
      subject_line: template.subject_line,
      sample_data: context as unknown as Record<string, unknown>,
    });

    try {
      const apiKey = this.providerCrypto.decrypt(config.api_key_ciphertext);

      if (config.provider === 'RESEND') {
        await this.sendWithResend({
          apiKey,
          to: context.tenantAdminEmail,
          fromEmail: config.sender_email || 'onboarding@resend.dev',
          fromName: config.sender_name || 'Nucleus Platform',
          subject: preview.subject || 'Welcome to Nucleus',
          html: preview.html,
        });
      } else if (config.provider === 'SENDGRID') {
        await this.sendWithSendgrid({
          apiKey,
          to: context.tenantAdminEmail,
          fromEmail: config.sender_email || 'noreply@example.com',
          fromName: config.sender_name || 'Nucleus Platform',
          subject: preview.subject || 'Welcome to Nucleus',
          html: preview.html,
        });
      } else {
        return {
          success: false,
          status: 'FAILED',
          error: `Unsupported operational mailer provider: ${config.provider}`,
        };
      }

      return {
        success: true,
        status: 'SENT',
        sentAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  defaultSampleData(): Record<string, unknown> {
    return {
      tenantName: 'Acme Health',
      tenantAdminUsername: 'acme-admin',
      tenantAdminEmail: 'admin@acme.example',
      tenantAdminDisplayName: 'Alex Admin',
      temporaryPassword: 'TempA1!pass',
      platformLoginUrl: 'http://localhost:5173/tenant/login',
      supportContact: 'support@example.com',
      allowedChannels: ['EMAIL', 'SMS'],
    };
  }

  private defaultTemplateBody() {
    return `<mjml>
  <mj-body background-color="#f8fafc">
    <mj-section padding="32px 24px">
      <mj-column background-color="#ffffff" border-radius="20px" padding="24px">
        <mj-text font-size="24px" font-weight="700" color="#0f172a">
          Welcome to {{tenantName}}
        </mj-text>
        <mj-text font-size="14px" color="#475569" line-height="1.7">
          Hi {{tenantAdminDisplayName}},
          your tenant admin access has been provisioned.
        </mj-text>
        <mj-text font-size="14px" color="#0f172a">
          Username: <strong>{{tenantAdminUsername}}</strong><br />
          Temporary Password: <strong>{{temporaryPassword}}</strong>
        </mj-text>
        <mj-button href="{{platformLoginUrl}}" background-color="#1d4ed8" border-radius="12px">
          Sign in and reset password
        </mj-button>
        <mj-text font-size="13px" color="#475569" line-height="1.6">
          Enabled channels: {{allowedChannels}}<br />
          Support: {{supportContact}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
  }

  private async sendWithResend(input: {
    apiKey: string;
    to: string;
    fromEmail: string;
    fromName: string;
    subject: string;
    html: string;
  }) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${input.fromName} <${input.fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend API failed with status ${response.status}`);
    }
  }

  private async sendWithSendgrid(input: {
    apiKey: string;
    to: string;
    fromEmail: string;
    fromName: string;
    subject: string;
    html: string;
  }) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: input.fromEmail, name: input.fromName },
        subject: input.subject,
        content: [{ type: 'text/html', value: input.html }],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid API failed with status ${response.status}`);
    }
  }
}
