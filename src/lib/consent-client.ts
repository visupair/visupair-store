/**
 * Client-side cookie consent (preferences live in localStorage as `visupair_cookie_v1`).
 * Load optional trackers only when the relevant flags are true — see `getVisupairConsent()`.
 */

export interface VisupairConsent {
  essential: true;
  marketing: boolean;
  personalization: boolean;
  analytics: boolean;
  updatedAt: number;
}

export function getVisupairConsent(): VisupairConsent | null {
  if (typeof window === "undefined") return null;
  const c = window.__VISUPAIR_CONSENT__;
  if (!c || typeof c !== "object") return null;
  return c;
}

export function hasMarketingConsent(): boolean {
  return !!getVisupairConsent()?.marketing;
}

export function hasPersonalizationConsent(): boolean {
  return !!getVisupairConsent()?.personalization;
}

export function hasAnalyticsConsent(): boolean {
  return !!getVisupairConsent()?.analytics;
}

/** Subscribe; returns unsubscribe. Safe to call from `astro:page-load`. */
export function onVisupairConsentUpdate(
  fn: (detail: VisupairConsent) => void,
): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<VisupairConsent>;
    if (ce.detail) fn(ce.detail);
  };
  document.addEventListener("visupair-consent-update", handler);
  return () => document.removeEventListener("visupair-consent-update", handler);
}
