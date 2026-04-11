import type { SanityClient } from "@sanity/client";
import type Stripe from "stripe";
import {
  physicalReservationLinesFromStripeMetadata,
  releasePhysicalStock,
  stripeSessionStockWasReserved,
} from "./physical-stock-reservation";

function inventoryReleaseLockId(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `checkoutInvRel.${safe}`.slice(0, 200);
}

async function tryAcquireInventoryReleaseLock(
  sanity: SanityClient,
  sessionId: string,
  source: string,
): Promise<boolean> {
  const _id = inventoryReleaseLockId(sessionId);
  try {
    await sanity.create({
      _id,
      _type: "checkoutInventoryRelease",
      sessionId,
      source,
      releasedAt: new Date().toISOString(),
    });
    return true;
  } catch (e: any) {
    if (e.statusCode === 409) return false;
    const msg = String(e?.message || e);
    if (/document already exists|duplicate|already exist/i.test(msg)) {
      return false;
    }
    throw e;
  }
}

function stringifyMetadata(
  meta: Stripe.Metadata | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta) return out;
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

/**
 * Restores physical stock when Checkout is abandoned (user cancelled or session expired).
 * Idempotent: uses a Sanity lock doc + Stripe metadata flag (open sessions only).
 */
export async function releaseInventoryIfHeld(
  sanity: SanityClient,
  stripe: Stripe,
  sessionId: string,
  source: "cancel_page" | "webhook_expired",
): Promise<void> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "paid") return;

  const meta = session.metadata || {};
  if (!stripeSessionStockWasReserved(meta)) return;
  if (meta.inventoryHoldReleased === "true") return;

  const acquired = await tryAcquireInventoryReleaseLock(sanity, sessionId, source);
  if (!acquired) return;

  const lines = physicalReservationLinesFromStripeMetadata(meta);
  for (const line of lines) {
    try {
      await releasePhysicalStock(sanity, line.ref, line.qty);
      console.log(
        `🔓 Released hold ${line.ref} (+${line.qty}) — ${source} (${sessionId})`,
      );
    } catch (e) {
      console.error(`Release hold failed for ${line.ref}:`, e);
    }
  }

  if (session.status === "open") {
    const nextMeta = stringifyMetadata(session.metadata);
    nextMeta.inventoryHoldReleased = "true";
    try {
      await stripe.checkout.sessions.update(sessionId, { metadata: nextMeta });
    } catch (e) {
      console.warn("Could not set inventoryHoldReleased on session:", e);
    }
    try {
      await stripe.checkout.sessions.expire(sessionId);
    } catch (e) {
      console.warn("Session expire after release (non-fatal):", e);
    }
  }
}
