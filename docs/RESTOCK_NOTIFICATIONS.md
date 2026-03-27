# Restock Notification Feature

## Overview
When a product is marked as "Out of Stock" in Sanity CMS, the Buy Now button is automatically replaced with a "Notify Me When Available" form. Customers can enter their email to receive notifications when the product is back in stock.

## How It Works

### 1. Customer Experience
- When viewing an out-of-stock product, customers see a notification form instead of the Buy Now button
- They enter their email address
- They receive an immediate confirmation email
- When you restock the product, they'll receive a notification email

### 2. Admin Workflow
- You receive an email notification when someone requests restock alerts
- The email contains:
  - Customer's email address
  - Product name and ID
  - Instructions for next steps

### 3. Restocking Process
When you have the product back in stock:
1. Update the product in Sanity CMS (set "In Stock" to `true`)
2. The customer can now purchase normally
3. (Future enhancement: Automatic email notifications when stock status changes)

## Setup Instructions

### 1. Environment Variables
Add these variables to your `.env` file:

```env
# Resend API Key (for sending emails)
RESEND_API_KEY=re_your_api_key_here

# Admin email to receive restock notifications
ADMIN_EMAIL=your-admin-email@visupair.com
```

### 2. Get Resend API Key
1. Sign up at https://resend.com
2. Verify your domain (or use their test domain for development)
3. Create an API key in the dashboard
4. Add it to your `.env` file

### 3. Configure Sender Email
In `/src/pages/api/restock-notification.ts`, update the `from` field:
```typescript
from: "Visupair Store <notifications@your-verified-domain.com>"
```

**Important:** The email must match a domain you've verified in Resend.

## Testing

### Development Mode
You can test with Resend's sandbox mode:
- Any `@resend.dev` email will work without verification
- Example: `test@resend.dev`

### Production
- Verify your custom domain in Resend
- Update the sender email to use your domain
- Test with real email addresses

## Email Templates

### Admin Notification
Sent when a customer requests restock notification.
- Subject: "Restock Request: [Product Name]"
- Contains: Customer email, product details, next steps

### Customer Confirmation
Sent immediately after customer submits their email.
- Subject: "We'll notify you when [Product Name] is back in stock"
- Confirms their request was received

## API Endpoint

**POST** `/api/restock-notification`

Request body:
```json
{
  "email": "customer@example.com",
  "productId": "product-123",
  "productName": "Product Name"
}
```

Response:
```json
{
  "success": true,
  "message": "Notification request received"
}
```

## Future Enhancements

1. **Database Storage**
   - Store restock requests in a database
   - Track which customers have been notified
   - Prevent duplicate notifications

2. **Automatic Notifications**
   - Listen to Sanity webhook when product stock status changes
   - Automatically send emails to all waiting customers
   - Mark notifications as sent

3. **Admin Dashboard**
   - View all pending restock requests
   - Manually trigger notification emails
   - See statistics on requested products

## Troubleshooting

### Emails not sending
1. Check `RESEND_API_KEY` is correct in `.env`
2. Verify sender domain in Resend dashboard
3. Check server logs for error messages

### Customer not receiving confirmation
1. Check spam folder
2. Verify email address format
3. Check Resend dashboard for delivery status

### Form not appearing
1. Ensure product `inStock` is set to `false` in Sanity
2. Clear browser cache
3. Check browser console for JavaScript errors

## Support
For issues or questions, check:
- Resend documentation: https://resend.com/docs
- Astro API routes: https://docs.astro.build/en/guides/endpoints/
