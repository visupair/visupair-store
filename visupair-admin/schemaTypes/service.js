export default {
    name: 'service',
    title: 'Service',
    type: 'document',
    fields: [
        {
            name: 'title',
            title: 'Title',
            type: 'string',
            validation: Rule => Rule.required(),
        },
        {
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: {
                source: 'title',
                maxLength: 96,
            },
            validation: Rule => Rule.required(),
        },
        {
            name: 'subtitle',
            title: 'Subtitle',
            type: 'string', // e.g. "Crafting the face of your brand..."
        },
        {
            name: 'description',
            title: 'Full Description',
            type: 'text',
            description: 'Optional: Detailed description if needed for a separate page section',
        },
        {
            name: 'plans',
            title: 'Pricing Plans',
            type: 'array',
            of: [
                {
                    type: 'object',
                    title: 'Plan',
                    fields: [
                        {
                            name: 'name',
                            title: 'Plan Name',
                            type: 'string',
                            initialValue: 'Basic',
                            options: {
                                list: ['Basic', 'Standard', 'Premium']
                            }
                        },
                        { name: 'price', title: 'Price', type: 'number' },
                        { name: 'currency', title: 'Currency', type: 'string', initialValue: '€' },
                        { name: 'description', title: 'Short Description', type: 'text', rows: 2 },
                        {
                            name: 'features',
                            title: 'Features',
                            type: 'array',
                            of: [{ type: 'string' }]
                        },
                        { name: 'highlight', title: 'Is Popular / Highlighted?', type: 'boolean', initialValue: false },
                        { name: 'ctaLabel', title: 'Button Label', type: 'string', placeholder: 'e.g. Start Basic' },
                    ],
                    preview: {
                        select: {
                            title: 'name',
                            price: 'price',
                            currency: 'currency',
                            highlight: 'highlight',
                        },
                        prepare({ title, price, currency, highlight }) {
                            return {
                                title: title,
                                subtitle: `${price} ${currency} ${highlight ? '(Popular)' : ''}`
                            }
                        }
                    }
                }
            ]
        }
    ],
}
