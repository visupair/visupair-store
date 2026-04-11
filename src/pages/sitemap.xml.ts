import type { APIRoute } from "astro";
import {
  getProducts,
  getCourses,
  getServices,
} from "../lib/sanity";
import { getPortfolioProjects } from "../lib/portfolio.js";
import { storeSections } from "../lib/store-data";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async () => {
  const base = (import.meta.env.SITE || "https://visupair.com").replace(
    /\/$/,
    "",
  );

  const paths: string[] = [
    "",
    "/about",
    "/contact",
    "/support",
    "/courses",
    "/portfolio",
    "/services",
    "/legal/terms-of-service",
    "/legal/privacy-policy",
    "/legal/refund-policy",
    "/legal/cookie-policy",
  ];

  for (const id of Object.keys(storeSections)) {
    paths.push(`/store/${id}`);
  }

  const urls = new Set<string>();
  for (const p of paths) {
    urls.add(`${base}${p}`);
  }

  try {
    const products = await getProducts();
    for (const p of products) {
      const sectionId = p.categoryPath?.[0];
      const slug = p.slug || p.id;
      if (sectionId && slug) {
        urls.add(`${base}/store/${sectionId}/${slug}`);
      }
    }
  } catch (e) {
    console.error("sitemap: products", e);
  }

  try {
    const courses = await getCourses();
    for (const c of courses) {
      if (c.slug) urls.add(`${base}/courses/${c.slug}`);
    }
  } catch (e) {
    console.error("sitemap: courses", e);
  }

  try {
    const services = await getServices();
    for (const s of services) {
      if (s.id) urls.add(`${base}/services/${s.id}`);
    }
  } catch (e) {
    console.error("sitemap: services", e);
  }

  try {
    const items = await getPortfolioProjects();
    for (const item of items) {
      if (item.slug) urls.add(`${base}/portfolio/${item.slug}`);
    }
  } catch (e) {
    console.error("sitemap: portfolio", e);
  }

  const sorted = [...urls].sort();

  function sitemapPriority(loc: string): string {
    try {
      const path = new URL(loc).pathname;
      if (path === "/" || path === "") return "1.0";
      if (/^\/store\/[^/]+\/[^/]+$/.test(path)) return "0.9";
      return "0.7";
    } catch {
      return "0.5";
    }
  }

  const urlEntries = sorted
    .map((loc) => {
      const priority = sitemapPriority(loc);
      return `<url><loc>${escapeXml(loc)}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
