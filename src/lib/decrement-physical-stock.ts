import type { SanityClient } from "@sanity/client";
import {
  isSanityRevisionConflict,
  SANITY_STOCK_PATCH_ATTEMPTS,
} from "./sanity-revision-conflict";

/**
 * After a successful sale, lower `stock` and set `inStock: false` at zero.
 * Digital products are skipped (no inventory in Sanity for downloads).
 */
export async function decrementPhysicalProductStock(
  sanity: SanityClient,
  productRef: string,
  quantitySold: number,
): Promise<boolean> {
  const qty = Math.max(1, quantitySold);

  for (let attempt = 0; attempt < SANITY_STOCK_PATCH_ATTEMPTS; attempt++) {
    const product = await sanity.getDocument(productRef);
    if (
      !product ||
      product._type !== "product" ||
      product.productType === "digital"
    ) {
      return false;
    }

    const currentStock =
      typeof product.stock === "number" ? product.stock : 1;
    const newStock = Math.max(0, currentStock - qty);
    const patch: Record<string, unknown> = { stock: newStock };
    if (newStock === 0) patch.inStock = false;

    try {
      await sanity
        .patch(productRef)
        .ifRevisionId(product._rev as string)
        .set(patch)
        .commit();
      return true;
    } catch (err) {
      if (isSanityRevisionConflict(err)) continue;
      console.error(`decrementPhysicalProductStock failed for ${productRef}:`, err);
      return false;
    }
  }

  console.error(
    `decrementPhysicalProductStock: exhausted retries for ${productRef}`,
  );
  return false;
}
