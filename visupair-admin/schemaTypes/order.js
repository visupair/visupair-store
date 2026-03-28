export default {
    name: 'order',
    title: 'Order',
    type: 'document',
    fields: [
        {
            name: 'orderNumber',
            title: 'Order Number',
            type: 'string',
        },
        {
            name: 'createdAt',
            title: 'Created At',
            type: 'datetime',
            initialValue: () => new Date().toISOString()
        },
        {
            name: 'orderType',
            title: 'Order Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Physical', value: 'physical' },
                    { title: 'Digital', value: 'digital' },
                    { title: 'Mixed', value: 'mixed' }
                ],
                layout: 'radio'
            },
            initialValue: 'physical' // Default fallback
        },
        {
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Pending', value: 'pending' },
                    { title: 'Processing', value: 'processing' },
                    { title: 'Paid', value: 'paid' },
                    { title: 'Shipped', value: 'shipped' },
                    { title: 'Delivered', value: 'delivered' },
                    { title: 'Cancelled', value: 'cancelled' },
                    { title: 'Refunded', value: 'refunded' }
                ],
                layout: 'radio'
            },
            initialValue: 'pending'
        },
        {
            name: 'userId',
            title: 'User ID',
            type: 'string',
            description: 'The ID of the user from Better Auth (D1 Database)',
            readOnly: true
        },
        {
            name: 'customerName',
            title: 'Customer Name',
            type: 'string'
        },
        {
            name: 'customerEmail',
            title: 'Customer Email',
            type: 'string'
        },
        {
            name: 'items',
            title: 'Line Items',
            type: 'array',
            of: [
                {
                    type: 'object',
                    fields: [
                        {
                            name: 'product',
                            title: 'Product',
                            type: 'reference',
                            to: [{ type: 'product' }, { type: 'course' }]
                        },
                        {
                            name: 'productType',
                            title: 'Product Type',
                            type: 'string',
                            options: {
                                list: [
                                    { title: 'Physical', value: 'physical' },
                                    { title: 'Digital', value: 'digital' }
                                ]
                            }
                        },
                        {
                            name: 'quantity',
                            title: 'Quantity',
                            type: 'number'
                        },
                        {
                            name: 'price',
                            title: 'Price (at purchase)',
                            type: 'number'
                        },
                        {
                            name: 'variant',
                            title: 'Variant',
                            type: 'string',
                            description: 'E.g. Size: M, Color: Red'
                        },
                        {
                            name: 'licenseKey',
                            title: 'License Key',
                            type: 'string',
                            hidden: ({ parent }) => parent?.productType !== 'digital'
                        }
                    ],
                    preview: {
                        select: {
                            title: 'product.title',
                            subtitle: 'variant',
                            price: 'price',
                            quantity: 'quantity',
                            media: 'product.mainImage'
                        },
                        prepare({ title, subtitle, price, quantity, media }) {
                            return {
                                title: `${quantity}x ${title}`,
                                subtitle: `${subtitle ? subtitle + ' - ' : ''}€${price}`,
                                media
                            }
                        }
                    }
                }
            ]
        },
        {
            name: 'totalAmount',
            title: 'Total Amount',
            type: 'number'
        },
        {
            name: 'currency',
            title: 'Currency',
            type: 'string',
            initialValue: 'EUR'
        },
        {
            name: 'paymentProvider',
            title: 'Payment Provider',
            type: 'string',
            options: {
                list: [
                    { title: 'Stripe', value: 'stripe' }
                ]
            }
        },
        {
            name: 'stripePaymentIntentId',
            title: 'Stripe Payment Intent ID',
            type: 'string',
            description: 'Stripe Payment Intent ID'
        },
        {
            name: 'shippingAddress',
            title: 'Shipping Address',
            type: 'object',
            fields: [
                { name: 'name', type: 'string', title: 'Name' },
                { name: 'street', type: 'string', title: 'Street' },
                { name: 'city', type: 'string', title: 'City' },
                { name: 'zip', type: 'string', title: 'ZIP Code' },
                { name: 'country', type: 'string', title: 'Country' }
            ],
            hidden: ({ document }) => {
                return document?.orderType === 'digital';
            }
        },
        {
            name: 'selectedCourier',
            title: 'Selected Courier',
            type: 'string',
            description: 'Courier chosen by customer at checkout (e.g. DHL, DPD, InPost)'
        },
        {
            name: 'shippingAmount',
            title: 'Shipping Cost',
            type: 'number',
            description: 'Shipping cost paid by customer'
        },
        {
            name: 'shippingTransactionId',
            title: 'Shipping Transaction ID',
            type: 'string'
        },
        {
            name: 'trackingNumber',
            title: 'Tracking Number',
            type: 'string'
        },
        {
            name: 'carrier',
            title: 'Carrier',
            type: 'string'
        }
    ],
    preview: {
        select: {
            title: 'orderNumber',
            subtitle: 'customerEmail',
            status: 'status',
            date: 'createdAt',
            total: 'totalAmount',
            currency: 'currency'
        },
        prepare({ title, subtitle, status, date, total, currency }) {
            const statusEmoji = {
                pending: '⏳',
                paid: '✅',
                shipped: '🚚',
                delivered: '📦',
                cancelled: '❌'
            }[status] || '❓';

            return {
                title: `${statusEmoji} Order ${title}`,
                subtitle: `${subtitle} - ${new Date(date).toLocaleDateString()} - ${total} ${currency}`
            }
        }
    }
}
