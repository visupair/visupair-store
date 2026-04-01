export default {
    name: 'order',
    title: 'Order',
    type: 'document',
    fieldsets: [
        { name: 'customer', title: '👤 Customer', options: { collapsible: true, collapsed: false } },
        { name: 'items', title: '📦 Items', options: { collapsible: true, collapsed: false } },
        { name: 'shipping', title: '🚚 Shipping & Tracking', options: { collapsible: true, collapsed: true } },
        { name: 'admin', title: '⚙️ Admin', options: { collapsible: true, collapsed: true } },
    ],
    fields: [
        // ── Core (always visible at top) ──
        {
            name: 'orderNumber',
            title: 'Order Number',
            type: 'string',
            readOnly: true,
        },
        {
            name: 'createdAt',
            title: 'Created At',
            type: 'datetime',
            readOnly: true,
        },
        {
            name: 'status',
            title: 'Payment status',
            type: 'string',
            description:
                'Payment / fulfilment admin only (not the customer delivery steps). Use **Delivery timeline** in Shipping for Confirmed → Shipped → Delivered.',
            options: {
                list: [
                    { title: 'Paid', value: 'paid' },
                    { title: 'Processing', value: 'processing' },
                    { title: 'Cancelled', value: 'cancelled' },
                    { title: 'Refunded', value: 'refunded' },
                ],
                layout: 'radio',
            },
        },
        {
            name: 'orderType',
            title: 'Order Type',
            type: 'string',
            readOnly: true,
            options: {
                list: [
                    { title: 'Physical', value: 'physical' },
                    { title: 'Digital', value: 'digital' },
                    { title: 'Mixed', value: 'mixed' },
                    { title: 'Course', value: 'course' },
                ],
            },
        },
        {
            name: 'totalAmount',
            title: 'Total Amount',
            type: 'number',
            readOnly: true,
            description: 'Amount paid by customer (set automatically from Stripe)',
        },

        // ── Customer ──
        {
            name: 'customerName',
            title: 'Customer Name',
            type: 'string',
            fieldset: 'customer',
            readOnly: true,
        },
        {
            name: 'customerEmail',
            title: 'Customer Email',
            type: 'string',
            fieldset: 'customer',
            readOnly: true,
        },

        // ── Items ──
        {
            name: 'items',
            title: 'Items',
            type: 'array',
            fieldset: 'items',
            of: [
                {
                    type: 'object',
                    fields: [
                        {
                            name: 'product',
                            title: 'Product',
                            type: 'reference',
                            to: [{ type: 'product' }, { type: 'course' }],
                        },
                        {
                            name: 'productType',
                            title: 'Type',
                            type: 'string',
                            options: {
                                list: [
                                    { title: 'Physical', value: 'physical' },
                                    { title: 'Digital', value: 'digital' },
                                    { title: 'Course', value: 'course' },
                                ],
                            },
                        },
                        {
                            name: 'quantity',
                            title: 'Qty',
                            type: 'number',
                        },
                        {
                            name: 'price',
                            title: 'Price',
                            type: 'number',
                        },
                        {
                            name: 'variant',
                            title: 'Variant',
                            type: 'string',
                        },
                    ],
                    preview: {
                        select: {
                            title: 'product.title',
                            subtitle: 'variant',
                            price: 'price',
                            quantity: 'quantity',
                            media: 'product.mainImage',
                        },
                        prepare({ title, subtitle, price, quantity, media }) {
                            return {
                                title: `${quantity || 1}× ${title || 'Product'}`,
                                subtitle: subtitle ? `${subtitle} — €${price}` : `€${price}`,
                                media,
                            };
                        },
                    },
                },
            ],
        },

        // ── Shipping & Tracking ──
        {
            name: 'shippingAddress',
            title: 'Shipping Address',
            type: 'object',
            fieldset: 'shipping',
            readOnly: true,
            fields: [
                { name: 'name', type: 'string', title: 'Name' },
                { name: 'street', type: 'string', title: 'Street' },
                { name: 'city', type: 'string', title: 'City' },
                { name: 'zip', type: 'string', title: 'ZIP Code' },
                { name: 'country', type: 'string', title: 'Country' },
            ],
        },
        {
            name: 'selectedCourier',
            title: 'Selected Courier',
            type: 'string',
            fieldset: 'shipping',
            readOnly: true,
            description: 'Courier chosen by customer at checkout',
        },
        {
            name: 'trackingNumber',
            title: 'Tracking Number',
            type: 'string',
            fieldset: 'shipping',
            description: 'Paste the tracking code from Furgonetka here',
        },
        {
            name: 'trackingUrl',
            title: 'Tracking URL',
            type: 'url',
            fieldset: 'shipping',
            description: 'Direct link to courier tracking page — customer can click it',
        },
        {
            name: 'estimatedDelivery',
            title: 'Estimated Delivery',
            type: 'date',
            fieldset: 'shipping',
        },
        {
            name: 'shippingTimelineStage',
            title: 'Delivery timeline (customer view)',
            type: 'string',
            fieldset: 'shipping',
            description:
                'Controls the progress steps on My Purchases: Confirmed → Shipped → Delivered. Move this as you dispatch and complete the order.',
            initialValue: 'confirmed',
            options: {
                list: [
                    { title: 'Confirmed — paid, preparing shipment', value: 'confirmed' },
                    { title: 'Shipped — handed to courier', value: 'shipped' },
                    { title: 'Delivered — completed', value: 'delivered' },
                ],
                layout: 'radio',
            },
        },

        // ── Admin ──
        {
            name: 'stripePaymentIntentId',
            title: 'Stripe Payment ID',
            type: 'string',
            fieldset: 'admin',
            readOnly: true,
        },
        {
            name: 'internalNotes',
            title: 'Internal Notes',
            type: 'text',
            fieldset: 'admin',
            description: 'Private notes (not visible to customer)',
        },
    ],
    preview: {
        select: {
            title: 'orderNumber',
            subtitle: 'customerEmail',
            status: 'status',
            timeline: 'shippingTimelineStage',
            date: 'createdAt',
            total: 'totalAmount',
        },
        prepare({ title, subtitle, status, timeline, date, total }) {
            let emoji = '❓';
            if (status === 'cancelled') emoji = '❌';
            else if (status === 'refunded') emoji = '↩️';
            else if (status === 'processing') emoji = '🔄';
            else if (status === 'paid' || status === 'shipped' || status === 'delivered') {
                // shipped/delivered = legacy docs before payment/timeline split
                const t =
                    timeline === 'delivered' || status === 'delivered'
                        ? 'delivered'
                        : timeline === 'shipped' || status === 'shipped'
                          ? 'shipped'
                          : 'confirmed';
                emoji =
                    t === 'delivered' ? '📦' : t === 'shipped' ? '🚚' : '✅';
            }

            const d = date ? new Date(date).toLocaleDateString() : '';
            return {
                title: `${emoji} #${(title || '').slice(-8)} — €${total || 0}`,
                subtitle: `${subtitle || ''} · ${d}`,
            };
        },
    },
};
