import type { APIRoute } from "astro";
import { Resend } from "resend";

// Initialize Resend with API key from environment
const resend = new Resend(import.meta.env.RESEND_API_KEY);

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email, productId, productName, productUrl } = body;

    // Validate input
    if (!email || !productId || !productName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Send notification to admin about the restock request
    const adminEmail = await resend.emails.send({
      from: "Visupair Store <notifications@visupair.com>",
      to: [import.meta.env.ADMIN_EMAIL || "admin@visupair.com"],
      subject: `Restock Request: ${productName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8480ff;">Restock Request Received</h2>
          <p>A customer has requested to be notified when this product is back in stock:</p>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Product:</strong> <a href="${productUrl}" style="color: #8480ff; text-decoration: none;">${productName}</a></p>
            <p style="margin: 8px 0;"><strong>Product ID:</strong> ${productId}</p>
            <p style="margin: 8px 0;"><strong>Customer Email:</strong> ${email}</p>
            ${productUrl ? `<p style="margin: 8px 0;"><strong>Product Link:</strong> <a href="${productUrl}" style="color: #8480ff;">${productUrl}</a></p>` : ''}
          </div>

          <p style="color: #666;">
            <strong>Next Steps:</strong><br/>
            1. Review product availability<br/>
            2. When restocked, update the product in Sanity (set "In Stock" to true)<br/>
            3. Send a notification email to the customer at: ${email}
          </p>

          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          
          <p style="color: #999; font-size: 12px;">
            This is an automated notification from Visupair Store.
          </p>
        </div>
      `,
    });

    // Send confirmation email to customer
    const customerEmail = await resend.emails.send({
      from: "Visupair Store <notifications@visupair.com>",
      to: [email],
      subject: `We'll notify you when "${productName}" is back in stock`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8480ff;">Thank You for Your Interest!</h2>
          <p>Hi there,</p>
          
          <p>We've received your request to be notified when <strong>${productName}</strong> becomes available again.</p>

          <div style="background: #f0f9ff; border-left: 4px solid #8480ff; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #333;">
              ✓ We'll send you an email as soon as this item is back in stock.
            </p>
          </div>

          <p>
            We appreciate your patience! We're working hard to restock this item and will notify you 
            as soon as it's available for purchase.
          </p>

          <p style="margin-top: 30px;">
            Best regards,<br/>
            <strong>The Visupair Team</strong>
          </p>

          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;" />
          
          <p style="color: #999; font-size: 12px;">
            You're receiving this email because you requested to be notified about product availability.
          </p>
        </div>
      `,
    });

    console.log("Restock notification emails sent:", {
      admin: adminEmail.data?.id,
      customer: customerEmail.data?.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notification request received",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing restock notification:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request. Please try again." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
