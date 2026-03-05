import "dotenv/config";
import prisma from "../src/config/prisma.config";


async function main() {
  const orderSuccessTemplate = await prisma.templates.upsert({
    where: {
      // Matches our composite primary key: [template_id, version]
      template_id_version: {
        template_id: 'ORDER_SUCCESS',
        version: 1,
      },
    },
    update: {}, // If it exists, do nothing
    create: {
      template_id: 'ORDER_SUCCESS',
      version: 1,
      channel_type: 'EMAIL',
      subject_line: 'Good news! Your order {{orderId}} is confirmed',
      content_body: `
        <mjml>
          <mj-body background-color="#f4f4f4">
            <mj-section background-color="#ffffff">
              <mj-column>
                <mj-text font-size="20px" font-family="helvetica">Order Confirmed!</mj-text>
                <mj-divider border-color="#F45E43"></mj-divider>
                <mj-text font-size="16px">Hi {{name}},</mj-text>
                <mj-text>Thanks for your purchase. We are processing order <b>#{{orderId}}</b> right now.</mj-text>
                <mj-button background-color="#F45E43" href="https://yourstore.com/orders/{{orderId}}">
                  View Order Status
                </mj-button>
              </mj-column>
            </mj-section>
          </mj-body>
        </mjml>
      `,
      locale: 'en',
      is_active: true,
    },
  });

  console.log({ orderSuccessTemplate });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });