import type { Product } from "./store-data";
import { stripHtml } from "./seo-utils";

export type ProductJsonLdInput = {
  product: Product;
  /** Fully qualified product page URL (prefer canonical /store/{section}/{slug}). */
  productPageUrl: string;
  currency: string;
  price: number;
  inStock: boolean;
  /** Absolute image URLs. */
  imageUrls: string[];
  /** Free digital product — offer price is 0 in structured data. */
  isFreeOffer?: boolean;
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
};

/** schema.org Product + Offer for Google rich results eligibility. */
export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const {
    product,
    productPageUrl,
    currency,
    price,
    inStock,
    imageUrls,
    isFreeOffer,
    aggregateRating,
  } = input;

  const desc = stripHtml(
    typeof product.description === "string" ? product.description : "",
  );
  const description =
    desc.length > 0 ? desc.slice(0, 5000) : `${product.name} — Visupair store`;

  const offerPriceMajor = isFreeOffer
    ? "0"
    : Number.isFinite(price)
      ? String(price)
      : "0";

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description,
    image: imageUrls.length > 0 ? imageUrls : undefined,
    sku: product.id,
    brand: {
      "@type": "Brand",
      name: "Visupair",
    },
    offers: {
      "@type": "Offer",
      url: productPageUrl,
      priceCurrency: currency,
      price: offerPriceMajor,
      availability: isFreeOffer || inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  if (
    aggregateRating &&
    aggregateRating.reviewCount > 0 &&
    Number.isFinite(aggregateRating.ratingValue)
  ) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: aggregateRating.ratingValue.toFixed(1),
      reviewCount: aggregateRating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return ld;
}
