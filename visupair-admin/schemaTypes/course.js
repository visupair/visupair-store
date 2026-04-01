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
            description:
                'How this course is sold on the site (free, donation-based, pay at the door, or paid online). Each signup is stored as a Course Registration with its own row: you will see Pricing Type there too (Free, Donation with amount if they paid, Paid with fee charged, etc.).',
            options: {
                list: [
                    { title: 'Free', value: 'free' },
                    { title: 'Donation (free entry + optional donation)', value: 'donation' },
                    { title: 'Paid (online payment)', value: 'paid' },
                    { title: 'Pay at the door', value: 'payAtDoor' },
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
            description:
                'Controls whether people can register on the website. Turn off manually to close registration, or leave the system to turn it off automatically when “Maximum participants” is reached.',
            initialValue: true,
        }),

        defineField({
            name: 'maxParticipants',
            title: 'Maximum participants',
            type: 'number',
            description:
                'Optional. How many people can register in total for this course. When that many registrations exist, “Registration Open” is set off automatically. Leave empty for no limit (only manual open/close). This number is not shown on the website.',
            validation: (Rule) =>
                Rule.custom((value) => {
                    if (value === undefined || value === null || value === '') return true
                    const n = Number(value)
                    if (!Number.isInteger(n) || n < 1) {
                        return 'Use a whole number of at least 1, or leave empty'
                    }
                    return true
                }),
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
            name: 'startsAt',
            title: 'Course start (date & time)',
            type: 'datetime',
            description:
                'When this course begins (first session or kickoff). Shown on the course catalog and course page. Leave empty if the date is not set yet or the offering is fully on-demand / self-paced.',
            options: {
                timeStep: 15,
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
            startsAt: 'startsAt',
        },
        prepare({ title, price, pricePLN, media, registrationOpen, pricingType, startsAt }) {
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
            let startStr = ''
            if (startsAt) {
                try {
                    const d = new Date(startsAt)
                    if (!Number.isNaN(d.getTime())) {
                        const dateFmt = new Intl.DateTimeFormat('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                        })
                        const parts = dateFmt.formatToParts(d)
                        const day = parts.find((p) => p.type === 'day')?.value ?? ''
                        const month = (parts.find((p) => p.type === 'month')?.value ?? '').toUpperCase()
                        const year = parts.find((p) => p.type === 'year')?.value ?? ''
                        const timePart = d.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                        })
                        startStr = ` • 📅 ${day} ${month} ${year} - ${timePart}`
                    }
                } catch { /* ignore */ }
            }
            return {
                title: title,
                subtitle: `${priceStr}${startStr} • ${registrationOpen ? '✅ Open' : '🔒 Closed'}`,
                media: media,
            }
        },
    },
})
