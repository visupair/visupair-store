import { defineField, defineType } from 'sanity'

export default defineType({
    name: 'portfolioProject',
    title: 'Portfolio Project',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Project Name',
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
            name: 'category',
            title: 'Category',
            type: 'reference',
            to: [{ type: 'portfolioCategory' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'year',
            title: 'Year',
            type: 'number',
            validation: (Rule) => Rule.required().min(2000).max(new Date().getFullYear()),
        }),
        defineField({
            name: 'tools',
            title: 'Tools & Technologies',
            type: 'array',
            of: [
                {
                    type: 'object',
                    fields: [
                        defineField({
                            name: 'value',
                            title: 'Value',
                            type: 'string',
                            validation: (Rule) => Rule.required(),
                        }),
                    ],
                    preview: {
                        select: {
                            title: 'value',
                        },
                    },
                },
            ],
        }),
        defineField({
            name: 'youtubeUrl',
            title: 'YouTube Video URL',
            description: 'Add a YouTube video URL (e.g. https://www.youtube.com/watch?v=...) to embed in the project details.',
            type: 'url',
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
        }),
        defineField({
            name: 'isFeatured',
            title: 'Featured Project',
            type: 'boolean',
            initialValue: false,
        }),
        defineField({
            name: 'order',
            title: 'Display Order',
            type: 'number',
            description: 'Use a number (1, 2, 3...) to control the sort order. Lower numbers appear first.',
            initialValue: 0,
        }),
        defineField({
            name: 'mainImage',
            title: 'Main Image',
            type: 'image',
            options: {
                hotspot: true,
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'gallery',
            title: 'Gallery Images',
            type: 'array',
            of: [{ type: 'image', options: { hotspot: true } }],
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'category.title',
            media: 'mainImage',
        },
    },
})
