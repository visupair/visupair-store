import { defineField, defineType } from 'sanity'

export default defineType({
    name: 'category',
    title: 'Category',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: {
                source: 'title',
                maxLength: 96,
            },
            validation: (Rule) => Rule.required(),
        }),
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
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'parent',
            title: 'Parent Category',
            type: 'reference',
            to: [{ type: 'category' }],
            description: 'Select a parent category if this is a sub-category',
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
        }),
        defineField({
            name: 'order',
            title: 'Display Order',
            type: 'number',
            description: 'Use a number (1, 2, 3...) to control the sort order.',
            initialValue: 0,
        }),
    ],
    preview: {
        select: {
            title: 'title',
            parentTitle: 'parent.title',
        },
        prepare({ title, parentTitle }) {
            return {
                title: title,
                subtitle: parentTitle ? `in ${parentTitle}` : 'Root Category',
            }
        },
    },
})
