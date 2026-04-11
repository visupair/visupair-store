import type { SanityClient } from "@sanity/client";
import {
  isSanityRevisionConflict,
  SANITY_STOCK_PATCH_ATTEMPTS,
} from "./sanity-revision-conflict";

export class StockReservationError extends Error {
  code: "OUT_OF_STOCK" | "CONFLICT";
  constructor(message: string, code: "OUT_OF_STOCK" | "CONFLICT" = "OUT_OF_STOCK") {
    super(message);
    this.name = "StockReservationError";
    this.code = code;
  }
}

/**
 * Atomically lowers physical stock before Stripe Checkout (prevents oversell).
 * @returns true if a physical SKU was reserved; false for digital / missing product.
 */
export async function tryReservePhysicalStock(
  sanity: SanityClient,
  productRef: string,
  quantity: number,
): Promise<boolean> {
  const qty = Math.max(1, quantity | 0);

  for (let attempt = 0; attempt < SANITY_STOCK_PATCH_ATTEMPTS; attempt++) {
    const product = await sanity.getDocument(productRef);
    if (
      !product ||
      product._type !== "product" ||
      product.productType === "digital"
    ) {
      return false;
    }

    const current =
      typeof product.stock === "number" ? product.stock : 1;
    if (current < qty) {
      throw new StockReservationError(
        "This item is no longer available — it may have just sold.",
        "OUT_OF_STOCK",
      );
    }

    const newStock = current - qty;
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
      throw err;
    }
  }

  throw new StockReservationError(
    "Could not lock inventory. Please try again.",
    "CONFLICT",
  );
}

/**
 * Restores stock when Checkout is abandoned (session expired) or reservation is rolled back.
 */
export async function releasePhysicalStock(
  sanity: SanityClient,
  productRef: string,
  quantity: number,
): Promise<boolean> {
  const qty = Math.max(1, quantity | 0);
  let doc = await sanity.getDocument(productRef);
  if (!doc || doc._type !== "product" || doc.productType === "digital") {
    return false;
  }

  for (let attempt = 0; attempt < SANITY_STOCK_PATCH_ATTEMPTS; attempt++) {
    if (!doc) return false;
    const current = typeof doc.stock === "number" ? doc.stock : 0;
    const newStock = current + qty;
    try {
      await sanity
        .patch(productRef)
        .ifRevisionId(doc._rev as string)
        .set({
          stock: newStock,
          inStock: newStock > 0,
        })
        .commit();
      return true;
    } catch (err) {
      if (!isSanityRevisionConflict(err)) {
        console.error(`releasePhysicalStock failed for ${productRef}:`, err);
        return false;
      }
      doc = await sanity.getDocument(productRef);
    }
  }
  return false;
}

/** Stripe session metadata → physical lines that were reserved at session creation */
export function physicalReservationLinesFromStripeMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
): { ref: string; qty: number }[] {
  if (!metadata) return [];

  if (metadata.checkoutType === "cart" && metadata.cartItems) {
    try {
      const cartItems = JSON.parse(metadata.cartItems) as Array<{
        id?: string;
        qty?: number;
        type?: string;
      }>;
      const map = new Map<string, number>();
      for (const item of cartItems) {
        const t = item.type || "physical";
        if (t !== "physical" || !item.id) continue;
        const q = item.qty || 1;
        map.set(item.id, (map.get(item.id) || 0) + q);
      }
      return [...map.entries()].map(([ref, qty]) => ({ ref, qty }));
    } catch {
      return [];
    }
  }

  const pt = metadata.productType || "physical";
  if (pt === "physical" && metadata.productId) {
    return [{ ref: metadata.productId, qty: 1 }];
  }
  return [];
}

export function stripeSessionStockWasReserved(
  metadata: Record<string, string | undefined> | null | undefined,
): boolean {
  return metadata?.physicalStockReserved === "true";
}
