import { sanityClient } from "sanity:client";

// Fetch all portfolio categories
export async function getPortfolioCategories() {
    const query = `*[_type == "portfolioCategory"] | order(order asc, title asc) {
        title,
        "slug": slug.current,
        description
    }`;
    return await sanityClient.fetch(query);
}

// Fetch all portfolio projects
export async function getPortfolioProjects() {
    const query = `*[_type == "portfolioProject"] | order(order asc, year desc) {
        name,
        "title": name, // Map name to title for frontend compatibility
        "slug": slug.current,
        "category": category->title,
        "categorySlug": category->slug.current,
        year,
        "tools": tools[].value,
        description,
        isFeatured,
        "mainImage": mainImage.asset->url,
        "gallery": gallery[].asset->url,
        youtubeUrl
    }`;
    return await sanityClient.fetch(query);
}

// Fetch a single portfolio project by slug
export async function getPortfolioProject(slug) {
    const query = `*[_type == "portfolioProject" && slug.current == $slug][0] {
        name,
        "title": name, // Map name to title for frontend compatibility
        "slug": slug.current,
        "category": category->title,
        "categorySlug": category->slug.current,
        year,
        "tools": tools[].value,
        description,
        isFeatured,
        "mainImage": mainImage.asset->url,
        "gallery": gallery[].asset->url,
        "images": gallery[].asset->url,
        youtubeUrl
    }`;
    return await sanityClient.fetch(query, { slug });
}
