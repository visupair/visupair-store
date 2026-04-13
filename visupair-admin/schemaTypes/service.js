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
            name: 'sortOrder',
            title: 'Sidebar order',
            type: 'number',
            description:
                'Lower numbers appear first in the site services sidebar and lists. Use 1, 2, 3… to set the order. Leave empty to fall back to creation date after numbered items.',
            validation: Rule => Rule.integer().min(0),
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
                        {
                            name: 'price',
                            title: 'Price (EUR)',
                            type: 'number',
                            description: 'Amount in euros — shown to visitors outside Poland (and as fallback).',
                            validation: Rule => Rule.required().min(0),
                        },
                        {
                            name: 'pricePLN',
                            title: 'Price (PLN)',
                            type: 'number',
                            description:
                                'Amount in Polish złoty for visitors from Poland. If empty, the site estimates PLN as EUR × 4.3 (same as the store).',
                        },
                        {
                            name: 'currency',
                            title: 'Currency (legacy)',
                            type: 'string',
                            hidden: () => true,
                        },
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
                            pricePLN: 'pricePLN',
                            highlight: 'highlight',
                        },
                        prepare({ title, price, pricePLN, highlight }) {
                            const pln =
                                typeof pricePLN === 'number' && pricePLN > 0
                                    ? ` · ${pricePLN} zł`
                                    : ''
                            return {
                                title: title,
                                subtitle: `€${price ?? ''}${pln} ${highlight ? '(Popular)' : ''}`,
                            }
                        },
                    },
                }
            ]
        }
    ],
}
