import { Resend } from "resend";

interface OrderNotificationParams {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    items: Array<{
        variant?: string;
        quantity?: number;
        price?: number;
        productType?: string;
    }>;
    totalAmount: number;
    currency: string;
    selectedCourier?: string;
    shippingAmount?: number;
    shippingAddress?: {
        name?: string;
        street?: string;
        city?: string;
        zip?: string;
        country?: string;
    } | null;
}

export async function sendOrderNotification(params: OrderNotificationParams) {
    const apiKey = import.meta.env.RESEND_API_KEY;
    const adminEmail = import.meta.env.ADMIN_EMAIL;

    if (!apiKey || !adminEmail) {
        console.warn("[Email] Missing RESEND_API_KEY or ADMIN_EMAIL, skipping notification");
        return;
    }

    const resend = new Resend(apiKey);

    const {
        orderNumber,
        customerName,
        customerEmail,
        items,
        totalAmount,
        currency,
        selectedCourier,
        shippingAmount,
        shippingAddress,
    } = params;

    const itemLines = items
        .map((item) => {
            const name = item.variant || "Product";
            const qty = item.quantity || 1;
            const price = item.price || 0;
            return `  - ${name} x${qty} — ${currency} ${price.toFixed(2)}`;
        })
        .join("\n");

    const addressLines = shippingAddress
        ? [
              shippingAddress.name,
              shippingAddress.street,
              `${shippingAddress.zip} ${shippingAddress.city}`,
              shippingAddress.country,
          ]
              .filter(Boolean)
              .join(", ")
        : "N/A (digital order)";

    const courierLine = selectedCourier
        ? `Courier: ${selectedCourier} (${currency} ${(shippingAmount || 0).toFixed(2)})`
        : "No shipping required";

    const textBody = `New Order Received!

Order: #${orderNumber}
Customer: ${customerName} (${customerEmail})

Items:
${itemLines}

${courierLine}
Ship to: ${addressLines}

Total: ${currency} ${totalAmount.toFixed(2)}

---
Manage this order in Sanity Studio.
`;

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
  <h1 style="font-size: 22px; margin-bottom: 24px; color: #1a1a2e;">New Order #${orderNumber}</h1>
  
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td style="padding: 8px 0; color: #666; font-size: 14px;">Customer</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600;">${customerName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666; font-size: 14px;">Email</td>
      <td style="padding: 8px 0; text-align: right;"><a href="mailto:${customerEmail}" style="color: #8480ff;">${customerEmail}</a></td>
    </tr>
  </table>

  <h3 style="font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee;">Items</h3>
  ${items
      .map(
          (item) => `
    <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px;">
      <span>${item.variant || "Product"} x${item.quantity || 1}</span>
      <span style="font-weight: 600;">${currency} ${(item.price || 0).toFixed(2)}</span>
    </div>
  `
      )
      .join("")}

  ${
      selectedCourier
          ? `
  <div style="margin-top: 16px; padding: 12px; background: #f8f8ff; border-radius: 8px; font-size: 14px;">
    <strong>Courier:</strong> ${selectedCourier}<br/>
    <strong>Shipping cost:</strong> ${currency} ${(shippingAmount || 0).toFixed(2)}
  </div>
  `
          : ""
  }

  ${
      shippingAddress
          ? `
  <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 8px; font-size: 14px;">
    <strong>Ship to:</strong><br/>
    ${addressLines}
  </div>
  `
          : ""
  }

  <div style="margin-top: 24px; padding-top: 16px; border-top: 2px solid #8480ff; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 18px; font-weight: 700;">Total</span>
    <span style="font-size: 18px; font-weight: 700; color: #8480ff;">${currency} ${totalAmount.toFixed(2)}</span>
  </div>
</div>
`;

    try {
        await resend.emails.send({
            from: "Visupair Store <orders@visupair.com>",
            to: [adminEmail],
            subject: `New Order #${orderNumber} — ${currency} ${totalAmount.toFixed(2)}`,
            text: textBody,
            html: htmlBody,
        });
        console.log("[Email] Order notification sent to", adminEmail);
    } catch (error) {
        console.error("[Email] Failed to send notification:", error);
        throw error;
    }
}
