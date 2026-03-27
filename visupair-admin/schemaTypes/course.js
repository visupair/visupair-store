import { defineField, defineType } from 'sanity'

export default defineType({
    name: 'course',
    title: 'Course',
    type: 'document',
    fields: [
        defineField({
            name: 'registrationOpen',
            title: 'Registration Open',
            type: 'boolean',
            description: 'Controls the "Registration Open" badge on the course detail page',
            initialValue: true,
        }),

        // FastSpring & R2 API Integration
        defineField({
            name: 'stripePriceId',
            title: 'Stripe Price ID',
            type: 'string',
            description: 'The Price ID from Stripe (e.g. price_1OqXXXXXXXXXXXXX).',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'digitalFileKey', // R2 Integration
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
        },
        prepare({ title, price, pricePLN, media, registrationOpen }) {
            return {
                title: title,
                subtitle: `€${price} / ${pricePLN}zł • ${registrationOpen ? '✅ Open' : '🔒 Closed'}`,
                media: media,
            }
        },
    },
})
