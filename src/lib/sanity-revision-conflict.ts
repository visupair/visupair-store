/** Detect Sanity optimistic-concurrency / transaction conflict errors for retry loops. */
export function isSanityRevisionConflict(err: unknown): boolean {
  const msg = String((err as Error)?.message || err);
  return /revision|mismatch|409|conflict/i.test(msg);
}

export const SANITY_STOCK_PATCH_ATTEMPTS = 8;
