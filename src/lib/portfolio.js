import { sanityClient } from "sanity:client";

/** Legacy tools were `{ value: string }[]`; current schema is `string[]`. */
function normalizePortfolioTools(tools) {
    if (!Array.isArray(tools)) return [];
    return tools
        .map((entry) => {
            if (typeof entry === "string") return entry;
            if (entry && typeof entry.value === "string") return entry.value;
            return null;
        })
        .filter((t) => t != null && t !== "");
}

// Fetch all portfolio categories
export async function getPortfolioCategories() {
    const query = `*[_type == "portfolioCategory"] | order(order asc, title asc) {
        title,
        "slug": slug.current,
        description
    }`;
    return await sanityClient.fetch(query);
}

// Fetch all portfolio projects (ordering is applied in PortfolioGrid: year + _updatedAt).
export async function getPortfolioProjects() {
    const query = `*[_type == "portfolioProject"] {
        name,
        "title": name, // Map name to title for frontend compatibility
        "slug": slug.current,
        "category": category->title,
        "categorySlug": category->slug.current,
        year,
        tools,
        description,
        isFeatured,
        "mainImage": mainImage.asset->url,
        "gallery": gallery[].asset->url,
        youtubeUrl,
        "youtubeVideos": youtubeVideos[],
        _updatedAt
    }`;
    const rows = await sanityClient.fetch(query);
    return rows.map((doc) => ({
        ...doc,
        tools: normalizePortfolioTools(doc.tools),
    }));
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
        tools,
        description,
        isFeatured,
        "mainImage": mainImage.asset->url,
        "gallery": gallery[].asset->url,
        "images": gallery[].asset->url,
        youtubeUrl,
        "youtubeVideos": youtubeVideos[],
        _updatedAt
    }`;
    const doc = await sanityClient.fetch(query, { slug });
    if (!doc) return null;
    return {
        ...doc,
        tools: normalizePortfolioTools(doc.tools),
    };
}
