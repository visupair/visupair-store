import type { SanityClient } from "@sanity/client";

/** True if this email has a paid store order that includes the product. */
export async function userOwnsStoreProduct(
  sanity: SanityClient,
  customerEmail: string,
  productSanityId: string,
): Promise<boolean> {
  const normalized = customerEmail.trim().toLowerCase();
  if (!normalized || !productSanityId) return false;

  const count = await sanity.fetch<number>(
    `count(*[_type == "order" && lower(customerEmail) == $email && status in ["paid", "processing", "shipped", "delivered"] && $productId in items[].product._ref])`,
    { email: normalized, productId: productSanityId },
  );
  return typeof count === "number" && count > 0;
}
