import { stripHtml, truncateMetaDescription } from "./seo-utils";

export const PORTFOLIO_INDEX_DEFAULT_DESC =
  "Explore Visupair's portfolio: branding, web design, 3D, fashion, and selected creative projects.";

export function metaDescriptionFromPortfolioBody(
  description: string | undefined | null,
  fallback: string,
): string {
  const plain = stripHtml(String(description ?? ""));
  if (!plain) return fallback;
  return truncateMetaDescription(plain);
}

/** Prefer a featured project’s cover; otherwise any item with a main image. */
export function pickPortfolioListOgImage(
  items: Array<{ mainImage?: string | null; isFeatured?: boolean }>,
): string | undefined {
  const withImg = items.filter((i) => i.mainImage);
  if (withImg.length === 0) return undefined;
  const featured = withImg.find((i) => i.isFeatured);
  const pick = featured ?? withImg[0]!;
  const url = pick.mainImage;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

/**
 * Single canonical URL for a project: category route when possible so
 * /portfolio/[slug] and /portfolio/category/.../[slug] consolidate.
 */
export function portfolioProjectCanonicalPath(item: {
  slug?: string | null;
  categorySlug?: string | null;
}): string {
  const slug = item.slug?.trim();
  if (!slug) return "/portfolio";
  const cat = item.categorySlug?.trim();
  if (cat) return `/portfolio/category/${cat}/${slug}`;
  return `/portfolio/${slug}`;
}
