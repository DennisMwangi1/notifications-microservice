import prisma from "../src/config/prisma.config";

async function main() {
  const tenantId = '0b5aff3c-64f3-410a-aeb3-2c2cf4357ceb';
  const eventType = 'service.applied';

  console.log(`Seeding template for Tenant ID: ${tenantId} and Event: ${eventType}...`);

  // We are using upsert to avoid duplicate key errors if you run it twice
  await prisma.templates.upsert({
    where: {
      template_id_version: {
        template_id: 'tmaas_service_application',
        version: 1,
      }
    },
    update: {},
    create: {
      template_id: 'tmaas_service_application',
      version: 1,
      channel_type: 'PUSH', // In-app notification
      subject_line: 'Service {{serviceName}} Applied Successfully',
      content_body: `
        <mjml>
          <mj-body>
            <mj-section>
              <mj-column>
                <mj-text font-size="20px" font-weight="bold" color="#333333">Application Received!</mj-text>
                <mj-text font-size="16px" color="#555555">Hello {{name}},</mj-text>
                <mj-text font-size="16px" color="#555555">Your application for the <b>{{serviceName}}</b> service has been successfully submitted and is currently under review by the TMaaS team.</mj-text>
              </mj-column>
            </mj-section>
          </mj-body>
        </mjml>
      `,
      is_active: true,
      tenant_id: tenantId,
      event_type: eventType,
      target_ws_channel: 'tmaas_notifications'
    }
  });

  console.log("✅ Successfully seeded template for TMaaS_Tenant!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
