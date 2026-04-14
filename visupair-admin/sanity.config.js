import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { presentationTool, defineLocations } from 'sanity/presentation'
import { visionTool } from '@sanity/vision'
import { DownloadIcon } from '@sanity/icons'
import { schemaTypes } from './schemaTypes'
import { structure } from './structure'
import { TaxExportTool } from './tools/TaxExportTool'

export default defineConfig({
  name: 'default',
  title: 'visupair-admin',

  projectId: 'sovnyov1',
  dataset: 'production',

  tools: (prev) => [
    ...prev,
    {
      name: 'tax-export',
      title: 'Sales export',
      icon: DownloadIcon,
      component: TaxExportTool,
    },
  ],

  plugins: [
    structureTool({
      structure,
    }),
    presentationTool({
      // origin — корневой URL твоего сайта
      previewUrl: {
        origin: 'https://visupair.com',
      },
      // resolve.locations — маршрутизация документов на страницы сайта
      resolve: {
        locations: {
          product: defineLocations({
            select: { slug: 'slug.current' },
            resolve: (doc) =>
              doc?.slug
                ? { locations: [{ title: doc.slug, href: `/store/${doc.slug}` }] }
                : null,
          }),
          service: defineLocations({
            select: { slug: 'slug.current' },
            resolve: (doc) =>
              doc?.slug
                ? { locations: [{ title: doc.slug, href: `/services/${doc.slug}` }] }
                : null,
          }),
          portfolioProject: defineLocations({
            select: { slug: 'slug.current' },
            resolve: (doc) =>
              doc?.slug
                ? { locations: [{ title: doc.slug, href: `/portfolio/${doc.slug}` }] }
                : null,
          }),
          portfolioCategory: defineLocations({
            select: { slug: 'slug.current' },
            resolve: (doc) =>
              doc?.slug
                ? { locations: [{ title: doc.slug, href: `/portfolio/category/${doc.slug}` }] }
                : null,
          }),
          course: defineLocations({
            select: { slug: 'slug.current' },
            resolve: (doc) =>
              doc?.slug
                ? { locations: [{ title: doc.slug, href: `/courses/${doc.slug}` }] }
                : null,
          }),
        },
      },
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
