import { createClient } from "@sanity/client";
// @ts-ignore - Package is installed with types, IDE may show false error
import { createImageUrlBuilder } from "@sanity/image-url";

export const sanityClient = createClient({
  projectId: 'sovnyov1',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2024-03-01',
});

// Preview client for Presentation Tool (loads drafts, no CDN)
export const previewClient = createClient({
  projectId: 'sovnyov1',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2024-03-01',
});

export const imageBuilder = createImageUrlBuilder(sanityClient);

export function urlFor(source: any) {
  return imageBuilder.image(source).quality(75).auto('format');
}

/** Lightbox / fullscreen: full resolution (no width/height), higher quality. */
export function urlForFullscreen(source: any): string {
  if (source == null) return '';
  if (typeof source === 'string') {
    return source.startsWith('http') ? source : '';
  }
  return imageBuilder.image(source).quality(100).auto('format').url();
}

/** Detail page main gallery — 1680px wide, quality 90 (matches sanity-image helper). */
export function urlForDetailGalleryPreview(source: any): string {
  if (source == null) return '';
  const w = 1680;
  const q = 90;
  if (typeof source === 'string') {
    if (!source.startsWith('http')) return '';
    return imageBuilder.image(source).width(w).quality(q).auto('format').url();
  }
  return imageBuilder.image(source).width(w).quality(q).auto('format').url();
}

// GROQ Queries
export const CATEGORIES_QUERY = `*[_type == "category" && !(_id in path("drafts.**"))] {
  _id,
  title,
  slug,
  order,
  parent->{
    _id,
    title,
    slug
  }
} | order(order asc)`;

export const PRODUCTS_QUERY = `*[_type == "product" && !(_id in path("drafts.**"))] {
  _id,
  name,
  "slug": slug.current,
  price,
  pricePLN,
  currency,
  description,
  mainImage,
  images,
  "category": category-> {
    title,
    "slug": slug.current,
    "parentSlug": parent->slug.current,
    "grandParentSlug": parent->parent->slug.current
  },
  productType,
  stripePriceId,
  polarUrl,
  inStock,
  stock,
  sizes,

  details,
  "twinProduct": twinProduct->{
    "slug": slug.current,
    name,
    productType,
    mainImage
  },
  showDigitalTwinLink,
  clo3dEmbedUrl,
  shipping
}`;

export async function getProducts() {
  // No CDN so inventory / sold-out updates show quickly after checkout reservations
  const documents = await sanityClient.withConfig({ useCdn: false }).fetch(PRODUCTS_QUERY);

  return documents.map((doc: any) => {
    // Construct category path array [grandparent, parent, current] filter out nulls
    const categoryPath = [
      doc.category?.grandParentSlug,
      doc.category?.parentSlug,
      doc.category?.slug
    ].filter(Boolean) as string[];

    // Transform details array [{label, value}] to object {Label: Value}
    const detailsMap: Record<string, string> = {};
    if (doc.details && Array.isArray(doc.details)) {
      doc.details.forEach((item: any) => {
        if (item.label && item.value) {
          detailsMap[item.label] = item.value;
        }
      });
    }

    return {
      id: doc._id,
      name: doc.name,
      price: doc.price,
      pricePLN: typeof doc.pricePLN === 'number' ? doc.pricePLN : undefined,
      currency: doc.currency || 'EUR',
      description: doc.description,
      slug: doc.slug,
      image: doc.mainImage ? urlFor(doc.mainImage).width(800).url() : undefined,
      mainImage: doc.mainImage, // Raw object for custom optimization
      images: doc.images ? doc.images.map((img: any) => urlFor(img).width(1200).url()) : [],
      gallery: doc.images, // Raw array for custom optimization
      categoryPath: categoryPath,

      // Sanity specific fields
      productType: doc.productType || 'physical', // Default to physical if not set
      stripePriceId: doc.stripePriceId,
      polarUrl: doc.polarUrl,
      inStock: doc.inStock !== false && (doc.stock === undefined || doc.stock === null || doc.stock > 0),
      stock: doc.stock ?? 1,
      sizes: doc.sizes,

      details: detailsMap,
      twinProduct: doc.twinProduct ? {
        ...doc.twinProduct,
        image: doc.twinProduct.mainImage ? urlFor(doc.twinProduct.mainImage).width(200).url() : undefined
      } : undefined,
      showDigitalTwinLink: doc.showDigitalTwinLink !== false, // Default to true
      clo3dEmbedUrl: doc.clo3dEmbedUrl,
      shipping: doc.shipping // Dimensions and weight
    };
  });
}

export async function getCategories() {
  const categories = await sanityClient.fetch(CATEGORIES_QUERY);

  // Transform flat list to tree
  const categoryMap = new Map();
  const roots: any[] = [];

  // 1. Create map of all categories with normalized shape
  categories.forEach((cat: any) => {
    categoryMap.set(cat.slug.current, {
      id: cat.slug.current,
      title: cat.title,
      order: cat.order || 0,
      // image: ... if we had one
      children: [],
      parentSlug: cat.parent?.slug.current
    });
  });

  // 2. Build tree
  categories.forEach((cat: any) => {
    const node = categoryMap.get(cat.slug.current);
    const parentSlug = cat.parent?.slug.current;
    if (parentSlug && categoryMap.has(parentSlug)) {
      const parent = categoryMap.get(parentSlug);
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // 3. Sort logic helper
  const sortFn = (a: any, b: any) => (a.order || 0) - (b.order || 0);

  // Sort roots
  roots.sort(sortFn);

  // Sort children of all nodes
  categoryMap.forEach((node) => {
    if (node.children && node.children.length > 0) {
      node.children.sort(sortFn);
    }
  });

  return roots;
}

export async function getCategoriesTree() {
  return getCategories();
}

// Services Query
export const SERVICES_QUERY = `*[_type == "service" && !(_id in path("drafts.**"))] | order(_createdAt asc) {
  _id,
  title,
  "slug": slug.current,
  subtitle,
  description,
  plans[] {
     _key,
     name,
     price,
     currency,
     description,
     features,
     highlight,
     ctaLabel
  }
}`;

// Courses Query
export const COURSES_QUERY = `*[_type == "course" && !(_id in path("drafts.**"))] | order(_createdAt asc) {
  _id,
  name,
  "slug": slug.current,
  pricingType,
  price,
  pricePLN,
  stripePriceId,
  donationPresets,
  description,
  mainImage,
  registrationOpen,
  instructor {
    name,
    title,
    avatar
  },
  details {
    duration,
    level,
    software
  },
  curriculum[] {
    _key,
    title,
    week
  }
}`;

export async function getCourses() {
  try {
    const courses = await sanityClient.fetch(COURSES_QUERY);
    if (!courses) {
      console.warn("getCourses: Sanity returned null/undefined");
      return [];
    }
    console.log(`getCourses: Fetched ${courses.length} courses from Sanity`);
    return courses.map((course: any) => ({
      _id: course._id,
      name: course.name,
      slug: course.slug,
      pricingType: course.pricingType || 'paid',
      price: course.price,
      pricePLN: course.pricePLN,
      stripePriceId: course.stripePriceId,
      donationPresets: course.donationPresets || [5, 25, 50],
      description: course.description,
      mainImage: course.mainImage ? urlFor(course.mainImage).width(1200).url() : undefined,
      registrationOpen: course.registrationOpen !== false,
      instructor: course.instructor ? {
        ...course.instructor,
        avatar: course.instructor.avatar ? urlFor(course.instructor.avatar).width(200).url() : undefined
      } : undefined,
      details: course.details || {},
      curriculum: course.curriculum || []
    }));
  } catch (error) {
    console.error("getCourses: Error fetching courses from Sanity:", error);
    throw error;
  }
}

export async function getServices() {
  try {
    const services = await sanityClient.fetch(SERVICES_QUERY);
    if (!services) {
      console.warn("getServices: Sanity returned null/undefined");
      return [];
    }
    console.log(`getServices: Fetched ${services.length} services from Sanity`);
    return services.map((service: any) => ({
      id: service.slug, // Map slug to ID for frontend compatibility
      title: service.title,
      subtitle: service.subtitle,
      description: service.description,
      plans: service.plans || []
    }));
  } catch (error) {
    console.error("getServices: Error fetching services from Sanity:", error);
    throw error;
  }
}
