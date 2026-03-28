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
                    { title: 'Fashion Design', value: 'fashion' },
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
            validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
            name: 'pricePLN',
            title: 'Price (PLN) - Optional',
            type: 'number',
            description: 'Leave empty for automatic conversion from EUR (1 EUR ≈ 4.3 PLN)',
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
            description: 'How many pieces you have available. Automatically decreases when someone buys. Set to 0 for sold out.',
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
            description: 'The Price ID from Stripe (e.g. price_1OqXXXXXXXXXXXXX).',
            type: 'string',
            validation: (Rule) => Rule.required(),
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
    preview: {
        select: {
            title: 'name',
            subtitle: 'department',
            media: 'mainImage',
        },
    },
})
