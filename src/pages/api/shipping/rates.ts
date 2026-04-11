import type { APIRoute } from "astro";
import { createClient } from "@sanity/client";
import type { CartCheckoutItem } from "../../../lib/checkout-cart-types";
import {
  buildParcelFromCartPhysicalLines,
  CheckoutMoneyError,
  fetchProductsForCheckout,
} from "../../../lib/checkout-server-money";
import { getApiSessionUserIfPresent } from "../../../lib/api-session";
import {
  checkRateLimit,
  RATE_LIMITS,
  resolveVisupairKv,
  tooManyRequestsResponse,
} from "../../../lib/rate-limit-kv";
import type { RateParams, ShippingRate } from "../../../lib/shipping/types";
import { getFurgonetkaRates } from "../../../lib/shipping/furgonetka";

/** Upper bounds for client-supplied parcel dimensions (abuse / bad data guard). */
const MAX_PARCEL_KG = 500;
const MAX_PARCEL_CM = 300;

function parsePositiveBounded(
  val: unknown,
  max: number,
): { ok: true; n: number } | { ok: false } {
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (!Number.isFinite(n) || n <= 0 || n > max) {
    return { ok: false };
  }
  return { ok: true, n };
}

function normalizeQuoteCartItems(raw: unknown): CartCheckoutItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartCheckoutItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.productId !== "string") continue;
    if (o.productType !== "physical" && o.productType !== "digital") continue;
    const qRaw = o.quantity;
    const q =
      typeof qRaw === "number" ? qRaw : parseInt(String(qRaw ?? "1"), 10);
    if (!Number.isFinite(q) || q < 1) continue;
    out.push({
      productId: o.productId,
      name: typeof o.name === "string" ? o.name : "",
      price: typeof o.price === "number" ? o.price : 0,
      quantity: Math.floor(q),
      productType: o.productType,
      selectedSize:
        typeof o.selectedSize === "string" ? o.selectedSize : undefined,
    });
  }
  return out;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    const kv = await resolveVisupairKv(context);
    const rl = await checkRateLimit(kv, request, RATE_LIMITS.shippingRates);
    if (!rl.ok) return tooManyRequestsResponse(rl.retryAfterSeconds);

    const body = await request.json();
    const {
      address,
      city,
      country,
      postalCode,
      parcel,
      cartItems,
    } = body as {
      address?: string;
      city?: string;
      country?: string;
      postalCode?: string;
      parcel?: {
        weight?: unknown;
        width?: unknown;
        height?: unknown;
        length?: unknown;
      };
      cartItems?: unknown;
    };

    if (!country || !postalCode || !city || !address) {
      return new Response(JSON.stringify({ error: "Missing address fields" }), {
        status: 400,
      });
    }

    let parcelParams: RateParams["parcel"];

    const itemsFromBody = normalizeQuoteCartItems(cartItems);

    if (itemsFromBody.length > 0) {
      const user = await getApiSessionUserIfPresent(context);
      if (!user) {
        return new Response(
          JSON.stringify({
            error: "Sign in to get shipping quotes from your cart.",
          }),
          { status: 401 },
        );
      }

      const physicalOnly = itemsFromBody.filter((i) => i.productType === "physical");
      if (physicalOnly.length === 0) {
        return new Response(
          JSON.stringify({ error: "No physical items to ship." }),
          { status: 400 },
        );
      }

      const sanity = createClient({
        projectId: "sovnyov1",
        dataset: "production",
        useCdn: false,
        apiVersion: "2024-03-01",
        token: import.meta.env.SANITY_API_TOKEN,
      });

      const productDocs = await fetchProductsForCheckout(
        sanity,
        physicalOnly.map((i) => i.productId),
      );
      const byId = new Map(productDocs.map((d) => [d._id, d]));

      try {
        parcelParams = buildParcelFromCartPhysicalLines(physicalOnly, byId);
      } catch (e) {
        if (e instanceof CheckoutMoneyError) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: e.status,
          });
        }
        throw e;
      }
    } else {
      if (!parcel || !parcel.weight || !parcel.width || !parcel.height || !parcel.length) {
        console.error("[Shipping API] Missing parcel dimensions:", parcel);
        return new Response(
          JSON.stringify({
            error:
              "Missing product shipping dimensions. Please add shipping details in Sanity CMS.",
            missingFields: {
              weight: !parcel?.weight,
              width: !parcel?.width,
              height: !parcel?.height,
              length: !parcel?.length,
            },
          }),
          { status: 400 },
        );
      }

      const w = parsePositiveBounded(parcel.weight, MAX_PARCEL_KG);
      const width = parsePositiveBounded(parcel.width, MAX_PARCEL_CM);
      const height = parsePositiveBounded(parcel.height, MAX_PARCEL_CM);
      const length = parsePositiveBounded(parcel.length, MAX_PARCEL_CM);
      if (!w.ok || !width.ok || !height.ok || !length.ok) {
        return new Response(
          JSON.stringify({
            error: `Parcel must be within positive limits (max ${MAX_PARCEL_KG} kg, ${MAX_PARCEL_CM} cm per side).`,
          }),
          { status: 400 },
        );
      }

      parcelParams = {
        length: String(length.n),
        width: String(width.n),
        height: String(height.n),
        weight: String(w.n),
      };
    }

    const params: RateParams = {
      addressTo: {
        street1: address,
        city: city,
        zip: postalCode,
        country: country,
      },
      parcel: parcelParams,
    };

    console.log(`Fetching rates for destination: ${country}, zip: ${postalCode}...`);
    console.log(
      `Parcel dimensions: ${parcelParams.width}×${parcelParams.height}×${parcelParams.length} cm, ${parcelParams.weight} kg`,
    );

    const fetchWithTimeout = <T>(promise: Promise<T>, ms: number, providerName: string) => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          console.warn(`[Timeout] ${providerName} failed to respond within ${ms}ms.`);
          reject(new Error(`${providerName} Timeout`));
        }, ms);

        promise.then(
          (res) => {
            clearTimeout(timer);
            resolve(res);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      });
    };

    const furgonetkaRates = await fetchWithTimeout(
      getFurgonetkaRates(params),
      16000,
      "Furgonetka",
    ).catch((e) => {
      console.error(`Furgonetka rate fetch failed:`, e.message);
      return [] as ShippingRate[];
    });

    const allRates: ShippingRate[] = [...furgonetkaRates];

    if (allRates.length === 0) {
      console.warn("No rates returned from any provider.");
      return new Response(JSON.stringify({ rates: [] }), { status: 200 });
    }

    allRates.sort((a, b) => {
      return parseFloat(String(a.amount)) - parseFloat(String(b.amount));
    });

    return new Response(JSON.stringify({ rates: allRates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Shipping Aggregator Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch rates" }),
      { status: 500 },
    );
  }
};
