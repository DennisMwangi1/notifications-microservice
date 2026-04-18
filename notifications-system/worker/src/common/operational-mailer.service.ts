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

  previewTemplate(input: {
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

    const preview = this.previewTemplate({
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
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica Neue, Arial, sans-serif" />
      <mj-text color="#334155" font-size="14px" line-height="1.7" />
      <mj-button background-color="#0f172a" color="#ffffff" border-radius="12px" font-size="14px" font-weight="700" inner-padding="14px 24px" />
      <mj-section padding="0" />
      <mj-column padding="0" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f8fafc">
    <mj-section padding="32px 20px 16px">
      <mj-column background-color="#ffffff" border-radius="28px" padding="0">
        <mj-section background-color="#0f172a" border-radius="28px 28px 0 0" padding="32px 32px 24px">
          <mj-column>
            <mj-text color="#93c5fd" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.6px">
              Nucleus onboarding packet
            </mj-text>
            <mj-text color="#ffffff" font-size="28px" font-weight="800" line-height="1.2" padding-top="10px">
              Welcome to {{tenantName}}
            </mj-text>
            <mj-text color="#cbd5e1" font-size="15px" line-height="1.75" padding-top="8px">
              Hi {{tenantAdminDisplayName}}, your tenant admin workspace is ready. This packet includes your first-login credentials, immediate next steps, and the integration guide your team can use to go live cleanly.
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section padding="28px 32px 0">
          <mj-column>
            <mj-text color="#0f172a" font-size="13px" font-weight="700" text-transform="uppercase" letter-spacing="1.4px">
              Access summary
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section padding="14px 32px 0">
          <mj-column width="50%" background-color="#f8fafc" border="1px solid #e2e8f0" border-radius="18px" padding="18px 18px 16px">
            <mj-text color="#64748b" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.2px">
              Username
            </mj-text>
            <mj-text color="#0f172a" font-size="18px" font-weight="700" padding-top="6px">
              {{tenantAdminUsername}}
            </mj-text>
          </mj-column>
          <mj-column width="50%" padding-left="12px" background-color="#f8fafc" border="1px solid #e2e8f0" border-radius="18px" padding="18px 18px 16px">
            <mj-text color="#64748b" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.2px">
              Temporary password
            </mj-text>
            <mj-text color="#0f172a" font-size="18px" font-weight="700" padding-top="6px">
              {{temporaryPassword}}
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section padding="16px 32px 0">
          <mj-column background-color="#eff6ff" border="1px solid #bfdbfe" border-radius="18px" padding="18px 20px">
            <mj-text color="#1d4ed8" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.2px">
              Immediate action required
            </mj-text>
            <mj-text color="#0f172a" font-size="15px" font-weight="700" padding-top="6px">
              Sign in and replace the temporary password before operational use.
            </mj-text>
            <mj-text color="#475569" font-size="14px" line-height="1.7" padding-top="6px">
              Your first sign-in will require a password reset. After that, your tenant session will be ready for template authoring, provider setup, and delivery review.
            </mj-text>
            <mj-button href="{{platformLoginUrl}}" background-color="#1d4ed8" padding-top="16px">
              Sign in and reset password
            </mj-button>
          </mj-column>
        </mj-section>

        <mj-section padding="28px 32px 0">
          <mj-column>
            <mj-text color="#0f172a" font-size="13px" font-weight="700" text-transform="uppercase" letter-spacing="1.4px">
              Your onboarding checklist
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section padding="12px 32px 0">
          <mj-column background-color="#ffffff" border="1px solid #e2e8f0" border-radius="18px" padding="0">
            <mj-text color="#0f172a" font-size="15px" font-weight="700" padding="18px 20px 4px">
              1. Confirm workspace access
            </mj-text>
            <mj-text color="#475569" padding="0 20px 16px">
              Complete the password reset flow and verify you can access the tenant console successfully.
            </mj-text>
            <mj-divider border-color="#e2e8f0" />
            <mj-text color="#0f172a" font-size="15px" font-weight="700" padding="12px 20px 4px">
              2. Review enabled channels
            </mj-text>
            <mj-text color="#475569" padding="0 20px 16px">
              Your tenant is currently enabled for: <strong>{{allowedChannels}}</strong>.
            </mj-text>
            <mj-divider border-color="#e2e8f0" />
            <mj-text color="#0f172a" font-size="15px" font-weight="700" padding="12px 20px 4px">
              3. Prepare your integration
            </mj-text>
            <mj-text color="#475569" padding="0 20px 18px">
              Share the integration guide with your engineering team so they can trigger events, request real-time tokens, and align payloads with supported templates.
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section padding="16px 32px 0">
          <mj-column width="50%" background-color="#f8fafc" border="1px solid #e2e8f0" border-radius="18px" padding="18px 20px 16px">
            <mj-text color="#64748b" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.2px">
              Platform overview
            </mj-text>
            <mj-text color="#0f172a" font-size="16px" font-weight="700" padding-top="6px">
              Architecture and capabilities
            </mj-text>
            <mj-text color="#475569" padding-top="6px">
              Explore the Nucleus overview to understand multi-tenant routing, provider failover, audit logging, and delivery flow.
            </mj-text>
            <mj-button href="https://dennismwangi1.github.io/notifications-microservice/" background-color="#ffffff" color="#0f172a" border="1px solid #cbd5e1" padding-top="12px">
              View platform overview
            </mj-button>
          </mj-column>
          <mj-column width="50%" padding-left="12px" background-color="#f8fafc" border="1px solid #e2e8f0" border-radius="18px" padding="18px 20px 16px">
            <mj-text color="#64748b" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.2px">
              Integration guide
            </mj-text>
            <mj-text color="#0f172a" font-size="16px" font-weight="700" padding-top="6px">
              Developer onboarding
            </mj-text>
            <mj-text color="#475569" padding-top="6px">
              Use the live guide for webhook authentication, event triggering, real-time token flow, and notification history endpoints.
            </mj-text>
            <mj-button href="https://dennismwangi1.github.io/notifications-microservice/integration.html" background-color="#ffffff" color="#0f172a" border="1px solid #cbd5e1" padding-top="12px">
              Read integration guide
            </mj-button>
          </mj-column>
        </mj-section>

        <mj-section padding="16px 32px 0">
          <mj-column background-color="#f8fafc" border="1px solid #e2e8f0" border-radius="18px" padding="18px 20px">
            <mj-text color="#64748b" font-size="11px" font-weight="700" text-transform="uppercase" letter-spacing="1.2px">
              Support
            </mj-text>
            <mj-text color="#0f172a" font-size="16px" font-weight="700" padding-top="6px">
              Need help during setup?
            </mj-text>
            <mj-text color="#475569" padding-top="6px">
              Contact <strong>{{supportContact}}</strong> if you need assistance with provisioning, provider configuration, or integration planning.
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section padding="24px 32px 32px">
          <mj-column>
            <mj-text color="#94a3b8" font-size="12px" line-height="1.7">
              This email contains privileged tenant-admin credentials. Treat it as confidential and avoid forwarding it outside the team responsible for onboarding.
            </mj-text>
          </mj-column>
        </mj-section>
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
