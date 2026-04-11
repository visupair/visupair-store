import type { SanityClient } from "@sanity/client";
import type { CartCheckoutItem } from "./checkout-cart-types";
import { getFurgonetkaRates } from "./shipping/furgonetka";
import type { RateParams, ShippingRate } from "./shipping/types";

/** Matches client fallbacks in cart/checkout when live FX is unavailable */
export const CHECKOUT_FX = { EUR_PLN: 4.3, PLN_EUR: 0.23 } as const;

export type CheckoutCurrencyLower = "eur" | "pln";

export function normalizedCheckoutCurrency(currency: string | undefined): CheckoutCurrencyLower {
    const c = (currency || "EUR").toUpperCase();
    return c === "PLN" ? "pln" : "eur";
}

export function convertAmountBetweenCurrencies(
    amount: number,
    from: "EUR" | "PLN",
    to: "EUR" | "PLN",
): number {
    if (from === to) return amount;
    if (from === "EUR" && to === "PLN") return amount * CHECKOUT_FX.EUR_PLN;
    return amount * CHECKOUT_FX.PLN_EUR;
}

/**
 * Authoritative minor units (cents / grosze) for a catalog row with EUR + optional PLN.
 * PLN fallback mirrors ProductDetail: round(EUR * 4.3) when pricePLN absent.
 */
export function minorUnitsForCatalogPrice(
    checkoutCurrency: CheckoutCurrencyLower,
    priceEur: number,
    pricePLN?: number | null,
): number {
    const eur = Math.max(0, Number(priceEur) || 0);
    if (checkoutCurrency === "eur") {
        return Math.round(eur * 100);
    }
    const pln =
        typeof pricePLN === "number" && pricePLN > 0 ? pricePLN : Math.round(eur * CHECKOUT_FX.EUR_PLN);
    return Math.round(pln * 100);
}

export interface SanityProductCheckoutDoc {
    _id: string;
    _type: "product";
    name: string;
    productType: "physical" | "digital";
    department?: string;
    sizes?: string[];
    price: number;
    pricePLN?: number;
    stripePriceId?: string;
    shipping?: {
        weight?: number;
        length?: number;
        width?: number;
        height?: number;
    };
}

export interface SanityCourseCheckoutDoc {
    _id: string;
    _type: "course";
    name: string;
    pricingType: "free" | "donation" | "paid" | "payAtDoor" | string;
    price?: number;
    pricePLN?: number;
    stripePriceId?: string;
}

export async function fetchProductsForCheckout(
    sanity: SanityClient,
    ids: string[],
): Promise<SanityProductCheckoutDoc[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    return sanity.fetch(
        `*[_id in $ids && _type == "product"]{
      _id,
      _type,
      name,
      productType,
      department,
      sizes,
      price,
      pricePLN,
      stripePriceId,
      shipping
    }`,
        { ids: unique },
    );
}

export async function fetchCourseForCheckout(
    sanity: SanityClient,
    id: string,
): Promise<SanityCourseCheckoutDoc | null> {
    return sanity.fetch(
        `*[_id == $id && _type == "course"][0]{
      _id,
      _type,
      name,
      pricingType,
      price,
      pricePLN,
      stripePriceId
    }`,
        { id },
    );
}

export class CheckoutMoneyError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.name = "CheckoutMoneyError";
        this.status = status;
    }
}

export function assertSingleProductStoreCheckout(
    doc: SanityProductCheckoutDoc | undefined,
    expectedType: "physical" | "digital",
    selectedSize?: string,
): asserts doc is SanityProductCheckoutDoc {
    if (!doc || doc._type !== "product") {
        throw new CheckoutMoneyError("Product not found.", 400);
    }
    if (doc.productType !== expectedType) {
        throw new CheckoutMoneyError("Product type mismatch. Refresh and try again.", 400);
    }
    const sizes = doc.sizes;
    if (doc.department === "fashion" && sizes && sizes.length > 0) {
        const s = (selectedSize || "").trim();
        if (!s || !sizes.includes(s)) {
            throw new CheckoutMoneyError("Please select a valid size.", 400);
        }
    }
}

export function assertProductMatchesCartLine(
    item: CartCheckoutItem,
    doc: SanityProductCheckoutDoc | undefined,
): asserts doc is SanityProductCheckoutDoc {
    if (!doc || doc._type !== "product") {
        throw new CheckoutMoneyError("One or more cart items are no longer available.", 400);
    }
    if (doc.productType !== item.productType) {
        throw new CheckoutMoneyError("Cart item type mismatch. Refresh and try again.", 400);
    }
    const sizes = doc.sizes;
    if (doc.department === "fashion" && sizes && sizes.length > 0) {
        const s = (item.selectedSize || "").trim();
        if (!s || !sizes.includes(s)) {
            throw new CheckoutMoneyError("Please select a valid size for each item.", 400);
        }
    }
}

export function buildParcelFromCartPhysicalLines(
    items: CartCheckoutItem[],
    byId: Map<string, SanityProductCheckoutDoc>,
): RateParams["parcel"] {
    let totalWeight = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let totalHeight = 0;

    for (const item of items) {
        if (item.productType !== "physical") continue;
        const doc = byId.get(item.productId);
        if (!doc) throw new CheckoutMoneyError("Missing product for shipping quote.", 400);
        const sh = doc.shipping;
        if (
            !sh ||
            typeof sh.weight !== "number" ||
            typeof sh.length !== "number" ||
            typeof sh.width !== "number" ||
            typeof sh.height !== "number"
        ) {
            throw new CheckoutMoneyError(
                "Shipping is not configured for one of your items. Please contact support.",
                400,
            );
        }
        const q = Math.max(1, item.quantity || 1);
        totalWeight += sh.weight * q;
        maxLength = Math.max(maxLength, sh.length);
        maxWidth = Math.max(maxWidth, sh.width);
        totalHeight += sh.height * q;
    }

    if (totalWeight <= 0) {
        throw new CheckoutMoneyError("Cannot calculate shipping for this cart.", 400);
    }

    return {
        weight: totalWeight.toFixed(2),
        length: String(maxLength),
        width: String(maxWidth),
        height: String(totalHeight),
    };
}

function parseRateAmount(rate: ShippingRate): number {
    return parseFloat(String(rate.amount));
}

async function fetchFurgonetkaWithTimeout(
    params: RateParams,
    ms: number,
): Promise<ShippingRate[]> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Furgonetka Timeout")), ms);
        getFurgonetkaRates(params)
            .then((r) => {
                clearTimeout(t);
                resolve(r);
            })
            .catch((e) => {
                clearTimeout(t);
                reject(e);
            });
    });
}

/**
 * Looks up the carrier rate the user selected and returns the shipping amount in checkout currency (minor units).
 */
export async function resolveShippingAmountMinorUnits(input: {
    shippingAddress: {
        address?: string;
        street?: string;
        city?: string;
        postalCode?: string;
        zip?: string;
        country?: string;
    };
    selectedShippingId: string;
    parcel: RateParams["parcel"];
    checkoutCurrency: CheckoutCurrencyLower;
}): Promise<{ minorUnits: number; providerLabel: string }> {
    const street = String(input.shippingAddress.address || input.shippingAddress.street || "").trim();
    const city = String(input.shippingAddress.city || "").trim();
    const zipRaw = String(input.shippingAddress.postalCode || input.shippingAddress.zip || "").trim();
    const country = String(input.shippingAddress.country || "").trim().toUpperCase();

    if (!street || !city || !zipRaw || !country) {
        throw new CheckoutMoneyError("Complete shipping address is required.", 400);
    }

    const zip = zipRaw.replace(/-/g, "");

    const params: RateParams = {
        addressTo: {
            street1: street,
            city,
            zip,
            country,
        },
        parcel: input.parcel,
    };

    let rates: ShippingRate[];
    try {
        rates = await fetchFurgonetkaWithTimeout(params, 16_000);
    } catch {
        throw new CheckoutMoneyError(
            "Shipping quotes are temporarily unavailable. Please try again in a moment.",
            503,
        );
    }

    if (!rates.length) {
        throw new CheckoutMoneyError(
            "No shipping options for this address. Try another address or contact support.",
            400,
        );
    }

    const selected = rates.find((r) => r.id === input.selectedShippingId);
    if (!selected) {
        throw new CheckoutMoneyError(
            "Selected shipping method is no longer valid. Refresh shipping options and try again.",
            400,
        );
    }

    const raw = parseRateAmount(selected);
    if (!Number.isFinite(raw) || raw < 0) {
        throw new CheckoutMoneyError("Invalid shipping rate from carrier.", 502);
    }

    const rateCurrency: "EUR" | "PLN" = selected.currency === "EUR" ? "EUR" : "PLN";
    const target: "EUR" | "PLN" = input.checkoutCurrency === "eur" ? "EUR" : "PLN";
    const converted = convertAmountBetweenCurrencies(raw, rateCurrency, target);
    return {
        minorUnits: Math.round(converted * 100),
        providerLabel: selected.provider || selected.service_level || "Shipping",
    };
}
