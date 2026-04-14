/**
 * ISO 3166-1 alpha-2 codes — physical shipping destinations we support.
 * Keep in sync with the country selector on `/cart/checkout`.
 */
export const ALLOWED_SHIPPING_COUNTRY_CODES = [
    "PL",
    "DE",
    "FR",
    "NL",
    "BE",
    "AT",
    "IT",
    "ES",
    "CZ",
    "HU",
    "LT",
    "LV",
    "EE",
] as const;

const allowed = new Set<string>(ALLOWED_SHIPPING_COUNTRY_CODES);

export function isAllowedShippingCountry(country: string | undefined | null): boolean {
    const c = String(country ?? "")
        .trim()
        .toUpperCase();
    return c.length === 2 && allowed.has(c);
}
