import { defineArrayMember, defineField, defineType } from 'sanity'

/** Portfolio years: 2020 (oldest work) through 2035; newest first in the dropdown. */
const portfolioYearOptions = (() => {
    const list = []
    for (let y = 2035; y >= 2020; y--) {
        list.push({ title: String(y), value: y })
    }
    return list
})()

/** Fixed list for Tools & Technologies (dropdown per entry; add multiple). */
const portfolioToolOptions = [
    // Adobe Creative Cloud (common apps)
    { title: 'Photoshop', value: 'Photoshop' },
    { title: 'Illustrator', value: 'Illustrator' },
    { title: 'InDesign', value: 'InDesign' },
    { title: 'After Effects', value: 'After Effects' },
    { title: 'Premiere Pro', value: 'Premiere Pro' },
    { title: 'Lightroom', value: 'Lightroom' },
    { title: 'Adobe XD', value: 'Adobe XD' },
    { title: 'Audition', value: 'Audition' },
    { title: 'Media Encoder', value: 'Media Encoder' },
    { title: 'Animate', value: 'Animate' },
    { title: 'Acrobat', value: 'Acrobat' },
    { title: 'Substance 3D Painter', value: 'Substance 3D Painter' },
    { title: 'Substance 3D Designer', value: 'Substance 3D Designer' },
    { title: 'Substance 3D Modeler', value: 'Substance 3D Modeler' },
    // Design, web & 3D
    { title: 'Figma', value: 'Figma' },
    { title: 'CorelDRAW', value: 'CorelDRAW' },
    { title: 'Affinity Designer', value: 'Affinity Designer' },
    { title: 'Affinity Photo', value: 'Affinity Photo' },
    { title: 'Affinity Publisher', value: 'Affinity Publisher' },
    { title: 'FontLab 8', value: 'FontLab 8' },
    { title: 'Webflow', value: 'Webflow' },
    { title: 'Spline 3D', value: 'Spline 3D' },
    { title: 'Blender 3D', value: 'Blender 3D' },
    { title: 'Cascadeur', value: 'Cascadeur' },
    { title: 'Unreal Engine 5', value: 'Unreal Engine 5' },
    { title: 'TouchDesigner', value: 'TouchDesigner' },
    { title: 'Marvelous Designer', value: 'Marvelous Designer' },
    { title: 'DaVinci Resolve', value: 'DaVinci Resolve' },
    { title: 'CLO 3D', value: 'CLO 3D' },
    { title: 'Houdini', value: 'Houdini' },
    { title: 'Nuke', value: 'Nuke' },
]

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
            description: 'Project year (dropdown): 2020–2035, newest at the top.',
            options: {
                list: portfolioYearOptions,
                layout: 'dropdown',
            },
            initialValue: new Date().getFullYear(),
            validation: (Rule) =>
                Rule.required()
                    .integer()
                    .min(2020)
                    .max(2035),
        }),
        defineField({
            name: 'tools',
            title: 'Tools & Technologies',
            description:
                'Add one row per tool. Pick from the list (Adobe apps, Figma, 3D & video tools).',
            type: 'array',
            of: [
                {
                    type: 'string',
                    options: {
                        list: portfolioToolOptions,
                        layout: 'dropdown',
                    },
                    validation: (Rule) => Rule.required(),
                },
            ],
        }),
        defineField({
            name: 'youtubeVideos',
            title: 'YouTube Videos',
            description: 'Add multiple YouTube video URLs. Videos will appear on the left side gallery.',
            type: 'array',
            of: [
                {
                    type: 'object',
                    fields: [
                        defineField({
                            name: 'url',
                            title: 'YouTube Video URL',
                            type: 'url',
                            validation: (Rule) => Rule.required(),
                            description: 'e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                        }),
                        defineField({
                            name: 'title',
                            title: 'Video title (optional)',
                            type: 'string',
                            description:
                                'Short label for accessibility (iframe title). If empty, the site uses Video: [project name].',
                        }),
                    ],
                    preview: {
                        select: {
                            title: 'title',
                            url: 'url',
                        },
                        prepare(selection) {
                            const { title, url } = selection;
                            return {
                                title: title?.trim() || 'YouTube Video',
                                subtitle: url,
                            };
                        },
                    },
                },
            ],
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
            description:
                'Drag multiple files from your computer onto this area at once to upload them together, or use + Add item. Order here matches the project page gallery.',
            of: [
                defineArrayMember({
                    type: 'image',
                    options: { hotspot: true },
                }),
            ],
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
