import type { APIRoute } from "astro";
import type { RateParams, ShippingRate } from "../../../lib/shipping/types";
import { getFurgonetkaRates } from "../../../lib/shipping/furgonetka";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { address, city, country, postalCode, parcel } = body;

    // Validate input presence
    if (!country || !postalCode || !city || !address) {
      return new Response(JSON.stringify({ error: "Missing address fields" }), { status: 400 });
    }

    // CRITICAL: Validate parcel dimensions - NO FALLBACKS allowed
    if (!parcel || !parcel.weight || !parcel.width || !parcel.height || !parcel.length) {
      console.error("[Shipping API] Missing parcel dimensions:", parcel);
      return new Response(
        JSON.stringify({
          error: "Missing product shipping dimensions. Please add shipping details in Sanity CMS.",
          missingFields: {
            weight: !parcel?.weight,
            width: !parcel?.width,
            height: !parcel?.height,
            length: !parcel?.length
          }
        }),
        { status: 400 }
      );
    }

    // Prepare Common Parameters - ONLY from provided data, NO defaults
    const params: RateParams = {
      addressTo: {
        street1: address,
        city: city,
        zip: postalCode,
        country: country
      },
      parcel: {
        length: String(parcel.length),
        width: String(parcel.width),
        height: String(parcel.height),
        weight: String(parcel.weight)
      }
    };

    console.log(`Fetching rates for destination: ${country}, zip: ${postalCode}...`);
    console.log(`Parcel dimensions: ${parcel.width}×${parcel.height}×${parcel.length} cm, ${parcel.weight} kg`);

    // Wrap in a promise that rejects after 20 seconds to prevent total API freezups
    const fetchWithTimeout = <T>(promise: Promise<T>, ms: number, providerName: string) => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          console.warn(`[Timeout] ${providerName} failed to respond within ${ms}ms.`);
          reject(new Error(`${providerName} Timeout`));
        }, ms);

        promise.then(
          (res) => { clearTimeout(timer); resolve(res); },
          (err) => { clearTimeout(timer); reject(err); }
        );
      });
    };

    // Fetch Rates from Furgonetka Provider
    const furgonetkaRates = await fetchWithTimeout(getFurgonetkaRates(params), 16000, "Furgonetka").catch((e) => {
      console.error(`Furgonetka rate fetch failed:`, e.message);
      return [] as ShippingRate[];
    });

    // Return Furgonetka Rates
    let allRates: ShippingRate[] = [...furgonetkaRates];

    if (allRates.length === 0) {
      console.warn("No rates returned from any provider.");
      // In "production", we might return an empty list or a specific error code
      // For UI feedback:
      return new Response(JSON.stringify({ rates: [] }), { status: 200 });
    }

    // Sort by Price (Cheapest First)
    allRates.sort((a, b) => {
      // Simple parse, assuming numeric strings. If mixed currencies, this is tricky.
      // The frontend handles currency conversion, but sorting mixed currencies is hard without exchange rates.
      // Assuming mostly PLN for PL and EUR for EU.
      // Ideally we should normalize to one currency for sorting, but for now raw value sort is approximation.
      return parseFloat(String(a.amount)) - parseFloat(String(b.amount));
    });

    // Limit to top options if needed, or return all
    // Returning top 5 to avoid overwhelming UI
    // const cheapestRates = allRates.slice(0, 5);

    return new Response(JSON.stringify({ rates: allRates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Shipping Aggregator Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to fetch rates" }), { status: 500 });
  }
};
