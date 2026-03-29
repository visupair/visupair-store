import { defineField, defineType } from 'sanity'

export default defineType({
    name: 'course',
    title: 'Course',
    type: 'document',
    fields: [
        defineField({
            name: 'pricingType',
            title: 'Pricing Type',
            type: 'string',
            description: 'How students pay for this course',
            options: {
                list: [
                    { title: 'Paid (Online Payment)', value: 'paid' },
                    { title: 'Free', value: 'free' },
                    { title: 'Donation (Free + Optional Donation)', value: 'donation' },
                    { title: 'Pay at the Door', value: 'payAtDoor' },
                ],
                layout: 'radio',
            },
            initialValue: 'paid',
            validation: (Rule) => Rule.required(),
        }),

        defineField({
            name: 'registrationOpen',
            title: 'Registration Open',
            type: 'boolean',
            description: 'Controls the "Registration Open" badge on the course detail page',
            initialValue: true,
        }),

        defineField({
            name: 'stripePriceId',
            title: 'Stripe Price ID',
            type: 'string',
            description: 'The Price ID from Stripe (e.g. price_1OqXXXXXXXXXXXXX). Only needed for Paid courses.',
            hidden: ({ document }) => document?.pricingType !== 'paid',
        }),
        defineField({
            name: 'digitalFileKey',
            title: 'Digital File Key (R2)',
            description: 'Path to the course files in Cloudflare R2 bucket (e.g. "courses/painting-essentials.zip").',
            type: 'string',
        }),
        defineField({
            name: 'name',
            title: 'Course Name',
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
            description: 'Required for Paid and Pay at the Door courses. Leave empty for Free courses.',
            hidden: ({ document }) => document?.pricingType === 'free' || document?.pricingType === 'donation',
            validation: (Rule) => Rule.custom((value, context) => {
                const pricingType = context.document?.pricingType
                if ((pricingType === 'paid' || pricingType === 'payAtDoor') && (!value || value <= 0)) {
                    return 'Price is required for paid courses'
                }
                return true
            }),
        }),
        defineField({
            name: 'pricePLN',
            title: 'Price (PLN) - Optional',
            type: 'number',
            description: 'Leave empty for automatic conversion from EUR (1 EUR ≈ 4.3 PLN)',
            hidden: ({ document }) => document?.pricingType === 'free' || document?.pricingType === 'donation',
            validation: (Rule) => Rule.min(0),
        }),
        defineField({
            name: 'donationPresets',
            title: 'Donation Preset Amounts (EUR)',
            type: 'array',
            of: [{ type: 'number' }],
            description: 'Suggested donation amounts shown to students (e.g. 5, 25, 50)',
            initialValue: [5, 25, 50],
            hidden: ({ document }) => document?.pricingType !== 'donation',
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 4,
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'mainImage',
            title: 'Course Thumbnail',
            type: 'image',
            options: {
                hotspot: true,
            },
        }),
        defineField({
            name: 'details',
            title: 'Course Details',
            type: 'object',
            fields: [
                {
                    name: 'duration',
                    title: 'Duration',
                    type: 'string',
                    placeholder: 'e.g., "6 Weeks", "Self-Paced"',
                },
                {
                    name: 'level',
                    title: 'Level',
                    type: 'string',
                    options: {
                        list: [
                            { title: 'Beginner', value: 'Beginner' },
                            { title: 'Intermediate', value: 'Intermediate' },
                            { title: 'Advanced', value: 'Advanced' },
                            { title: 'All Levels', value: 'All Levels' },
                        ],
                    },
                },
                {
                    name: 'software',
                    title: 'Software',
                    type: 'string',
                    description: 'Required software (optional)',
                    placeholder: 'e.g., "Blender", "Rhino Gold"',
                },
            ],
        }),
        defineField({
            name: 'curriculum',
            title: 'Curriculum & Schedule',
            type: 'array',
            of: [
                {
                    type: 'object',
                    fields: [
                        {
                            name: 'week',
                            title: 'Week',
                            type: 'string',
                            placeholder: 'e.g., "Week 01", "Bonus"',
                            validation: (Rule) => Rule.required(),
                        },
                        {
                            name: 'title',
                            title: 'Lesson Title',
                            type: 'string',
                            validation: (Rule) => Rule.required(),
                        },
                    ],
                    preview: {
                        select: {
                            week: 'week',
                            title: 'title',
                        },
                        prepare({ week, title }) {
                            return {
                                title: `${week}: ${title}`,
                            }
                        },
                    },
                },
            ],
        }),
        defineField({
            name: 'instructor',
            title: 'Instructor',
            type: 'object',
            fields: [
                {
                    name: 'name',
                    title: 'Name',
                    type: 'string',
                    validation: (Rule) => Rule.required(),
                },
                {
                    name: 'title',
                    title: 'Title/Role',
                    type: 'string',
                    validation: (Rule) => Rule.required(),
                },
                {
                    name: 'avatar',
                    title: 'Avatar',
                    type: 'image',
                    options: {
                        hotspot: true,
                    },
                },
            ],
        }),
    ],
    preview: {
        select: {
            title: 'name',
            price: 'price',
            pricePLN: 'pricePLN',
            media: 'mainImage',
            registrationOpen: 'registrationOpen',
            pricingType: 'pricingType',
        },
        prepare({ title, price, pricePLN, media, registrationOpen, pricingType }) {
            const typeLabels = {
                paid: '💳 Paid',
                free: '🆓 Free',
                donation: '🎁 Donation',
                payAtDoor: '🚪 Pay at Door',
            }
            const typeLabel = typeLabels[pricingType] || '💳 Paid'
            const priceStr = pricingType === 'free' || pricingType === 'donation'
                ? typeLabel
                : `${typeLabel} • €${price || 0}${pricePLN ? ' / ' + pricePLN + 'zł' : ''}`
            return {
                title: title,
                subtitle: `${priceStr} • ${registrationOpen ? '✅ Open' : '🔒 Closed'}`,
                media: media,
            }
        },
    },
})
