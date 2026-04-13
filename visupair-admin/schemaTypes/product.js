import { defineField, defineType } from 'sanity'

export default defineType({
    name: 'product',
    title: 'Product',
    type: 'document',
    fields: [
        // Department Selection (Controls what fields differ)
        defineField({
            name: 'department',
            title: 'Department',
            type: 'string',
            options: {
                list: [
                    { title: 'Garments', value: 'fashion' },
                    { title: '3D Models', value: '3d-models' },
                    { title: 'Artworks', value: 'artworks' },
                ],
                layout: 'radio',
            },
            initialValue: 'fashion',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'category',
            title: 'Category',
            type: 'reference',
            to: [{ type: 'category' }],
            options: {
                filter: ({ document }) => {
                    return {
                        filter: 'department == $department',
                        params: {
                            department: document.department,
                        },
                    }
                },
            },
        }),
        defineField({
            name: 'name',
            title: 'Product Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: {
                source: 'name',
                maxLength: 96,
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'price',
            title: 'Price (EUR)',
            type: 'number',
            hidden: ({ document }) =>
                document?.productType === 'digital' &&
                document?.isFree === true &&
                (document?.department === 'fashion' || document?.department === '3d-models'),
            validation: (Rule) =>
                Rule.custom((value, context) => {
                    const doc = context.document
                    if (doc?.isFree && (doc?.department === 'fashion' || doc?.department === '3d-models')) {
                        return true
                    }
                    if (value == null || value === undefined) return 'Required'
                    if (Number(value) < 0) return 'Must be 0 or greater'
                    return true
                }),
        }),
        defineField({
            name: 'pricePLN',
            title: 'Price (PLN) - Optional',
            type: 'number',
            description: 'Leave empty for automatic conversion from EUR (1 EUR ≈ 4.3 PLN)',
            hidden: ({ document }) =>
                document?.productType === 'digital' &&
                document?.isFree === true &&
                (document?.department === 'fashion' || document?.department === '3d-models'),
            validation: (Rule) => Rule.min(0),
        }),
        defineField({
            name: 'currency',
            title: 'Currency (Legacy - will be auto-detected)',
            type: 'string',
            options: {
                list: [
                    { title: 'EUR (€)', value: 'EUR' },
                    { title: 'PLN (zł)', value: 'PLN' },
                ],
                layout: 'radio',
            },
            initialValue: 'EUR',
            hidden: true,
        }),
        defineField({
            name: 'inStock',
            title: 'In Stock',
            type: 'boolean',
            initialValue: true,
        }),
        defineField({
            name: 'stock',
            title: 'Stock Quantity',
            type: 'number',
            description:
                'Physical products only: decreases automatically in Studio after each paid sale (Stripe). At 0, In stock is turned off. Digital products ignore this at checkout.',
            initialValue: 1,
            validation: (Rule) => Rule.min(0).integer(),
        }),
        defineField({
            name: 'details',
            title: 'Specifications / Details',
            type: 'array',
            of: [
                {
                    type: 'object',
                    fields: [
                        defineField({ name: 'label', title: 'Label', type: 'string' }),
                        defineField({ name: 'value', title: 'Value', type: 'string' }),
                    ],
                    preview: {
                        select: {
                            title: 'label',
                            subtitle: 'value',
                        },
                    },
                },
            ],
        }),
        // Fashion Specifics: Sizes
        defineField({
            name: 'sizes',
            title: 'Sizes',
            type: 'array',
            of: [{ type: 'string' }],
            hidden: ({ document }) => document?.department !== 'fashion',
        }),


        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
        }),
        defineField({
            name: 'mainImage',
            title: 'Main Image',
            type: 'image',
            options: {
                hotspot: true,
            },
        }),
        defineField({
            name: 'images',
            title: 'Gallery Images',
            type: 'array',
            of: [{ type: 'image', options: { hotspot: true } }],
        }),
        defineField({
            name: 'productType',
            title: 'Product Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Physical', value: 'physical' },
                    { title: 'Digital', value: 'digital' },
                ],
                layout: 'radio',
            },
            initialValue: 'physical',
        }),
        defineField({
            name: 'isFree',
            title: 'Free digital product',
            type: 'boolean',
            description:
                'No Stripe checkout — customers claim from the store while signed in. Only for Garments or 3D Models digital products with an R2 file key.',
            initialValue: false,
            hidden: ({ document }) =>
                document?.productType !== 'digital' ||
                (document?.department !== 'fashion' && document?.department !== '3d-models'),
        }),

        // Shipping Specifications (Physical Only)
        defineField({
            name: 'shipping',
            title: 'Shipping Details',
            description: 'Required for accurate shipping rate calculation via Furgonetka and other carriers.',
            type: 'object',
            hidden: ({ document }) => document?.productType !== 'physical',
            fields: [
                defineField({
                    name: 'weight',
                    title: 'Weight (kg)',
                    type: 'number',
                    description: 'Product weight in kilograms',
                    validation: (Rule) => Rule.required().min(0.01).error('Weight must be at least 0.01 kg'),
                    initialValue: 0.5
                }),
                defineField({
                    name: 'length',
                    title: 'Length (cm)',
                    type: 'number',
                    description: 'Longest side of the package',
                    validation: (Rule) => Rule.required().min(1).error('Length must be at least 1 cm'),
                    initialValue: 30
                }),
                defineField({
                    name: 'width',
                    title: 'Width (cm)',
                    type: 'number',
                    description: 'Middle dimension of the package',
                    validation: (Rule) => Rule.required().min(1).error('Width must be at least 1 cm'),
                    initialValue: 20
                }),
                defineField({
                    name: 'height',
                    title: 'Height (cm)',
                    type: 'number',
                    description: 'Shortest side of the package',
                    validation: (Rule) => Rule.required().min(1).error('Height must be at least 1 cm'),
                    initialValue: 5
                })
            ]
        }),

        // Payment Integrations

        defineField({
            name: 'stripePriceId',
            title: 'Stripe Price ID',
            description:
                'The Price ID from Stripe (e.g. price_1OqXXXXXXXXXXXXX). Keep Price unit_amount in sync with Price (EUR) / Price (PLN) here — checkout charges the Stripe Price, not this number alone. Run: npm run check:stripe-sanity-prices',
            type: 'string',
            hidden: ({ document }) =>
                document?.productType === 'digital' &&
                document?.isFree === true &&
                (document?.department === 'fashion' || document?.department === '3d-models'),
            validation: (Rule) =>
                Rule.custom((value, context) => {
                    const doc = context.document
                    if (doc?.isFree && (doc?.department === 'fashion' || doc?.department === '3d-models')) {
                        return true
                    }
                    if (!value || String(value).trim() === '') return 'Required'
                    return true
                }),
        }),
        defineField({
            name: 'digitalFileKey', // R2 Integration
            title: 'Digital File Key (R2)',
            description: 'Path to the file in Cloudflare R2 bucket (e.g. "courses/blender-course.zip"). Required for digital products.',
            type: 'string',
            hidden: ({ document }) => document?.productType !== 'digital',
        }),
        defineField({
            name: 'showDigitalTwinLink',
            title: 'Show "View Digital Twin" Button',
            type: 'boolean',
            initialValue: true,
            description: 'If disabled, the button linking to the twin product will be hidden.',
            hidden: ({ document }) => document?.department !== 'fashion',
        }),
        // Reciprocal Digital Twin (Reference) - Only for Fashion
        defineField({
            name: 'twinProduct',
            title: 'Twin Product',
            description: 'The counterpart product (e.g., Physical version for a Digital item, or vice versa).',
            type: 'reference',
            to: [{ type: 'product' }],
            hidden: ({ document }) => document?.department !== 'fashion',
        }),
        defineField({
            name: 'clo3dEmbedUrl',
            title: 'Clo 3D Embed URL',
            description: 'URL for the Clo 3D viewer iFrame (e.g. from style.clo-set.com)',
            type: 'url',
            hidden: ({ document }) => document?.department !== 'fashion' || document?.productType !== 'digital',
        }),
    ],
    validation: (Rule) =>
        Rule.custom((_, context) => {
            const doc = context.document
            if (!doc?.isFree) return true
            if (doc.productType !== 'digital') {
                return 'Free products must use Product Type: Digital.'
            }
            if (doc.department === 'artworks') {
                return 'Free products are not available for Artworks.'
            }
            if (doc.department !== 'fashion' && doc.department !== '3d-models') {
                return 'Free products are only available for Garments or 3D Models.'
            }
            const key = doc.digitalFileKey
            if (!key || String(key).trim() === '') {
                return 'Digital File Key (R2) is required for free digital products.'
            }
            return true
        }),
    preview: {
        select: {
            title: 'name',
            subtitle: 'department',
            media: 'mainImage',
        },
    },
})
