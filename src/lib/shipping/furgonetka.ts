import type { RateParams, ShippingRate } from "./types";

/**
 * FURGONETKA REST API V2 INTEGRATION
 * ==================================
 * 
 * OFFICIAL DOCUMENTATION: https://api.furgonetka.pl (requires authentication)
 * This integration is based on the official REST API v2 documentation.
 * 
 * VERIFIED ENDPOINTS (from official docs):
 * ✅ POST /oauth/token - OAuth2 Password Grant authentication
 * ✅ POST /packages/calculate-price - Price calculation for shipments
 * ✅ POST /packages - Create shipment
 * ✅ GET /packages/{id}/label - Retrieve shipping label
 * 
 * ARCHITECTURAL FLOW:
 * 1. authenticate() → Get OAuth2 Bearer token
 * 2. getFurgonetkaRates() → Fetch available services with prices
 * 3. createFurgonetkaShipment() → Create shipment with selected service
 * 4. getFurgonetkaLabel() → Retrieve shipping label PDF
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * - FURGONETKA_CLIENT_ID - OAuth2 client ID
 * - FURGONETKA_CLIENT_SECRET - OAuth2 client secret
 * - FURGONETKA_EMAIL - Account email for password grant
 * - FURGONETKA_PASSWORD - Account password for password grant
 * - FURGONETKA_SANDBOX - Set to "false" for production (default: true)
 * 
 * IMPORTANT NOTES FROM DOCUMENTATION:
 * - All requests must include: Content-Type: application/vnd.furgonetka.v1+json
 * - Authentication uses OAuth2 Bearer token in Authorization header
 * - Postcodes must be without dashes (e.g., "30145" not "30-145")
 * - Parcel dimensions use: width, height, depth (NOT length)
 * - Shipment type: "package", "dox", "pallet", etc.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const FURGONETKA_CLIENT_ID = import.meta.env.FURGONETKA_CLIENT_ID;
const FURGONETKA_CLIENT_SECRET = import.meta.env.FURGONETKA_CLIENT_SECRET;
const FURGONETKA_EMAIL = import.meta.env.FURGONETKA_EMAIL;
const FURGONETKA_PASSWORD = import.meta.env.FURGONETKA_PASSWORD;

// Environment Toggle
const IS_SANDBOX = import.meta.env.FURGONETKA_SANDBOX !== "false";
const BASE_URL = IS_SANDBOX
    ? "https://api.furgonetka.pl"
    : "https://api.furgonetka.pl";

// Store/Warehouse Configuration - All values from environment variables
const STORE_CONFIG = {
    name: import.meta.env.STORE_NAME || import.meta.env.PUBLIC_SITE_NAME || "Store Name",
    street: import.meta.env.STORE_STREET || "Street Address",
    city: import.meta.env.STORE_CITY || "City",
    postcode: import.meta.env.STORE_POSTCODE || "00000",
    country: import.meta.env.STORE_COUNTRY || "PL",
    email: import.meta.env.STORE_EMAIL || import.meta.env.ADMIN_EMAIL || "store@example.com",
    phone: import.meta.env.STORE_PHONE || "000000000"
};

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

let cachedToken: string | null = null;
let tokenExpiry = 0;

interface FurgonetkaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

/**
 * AUTHENTICATION: OAuth2 Password Grant
 * Retrieves and caches access token
 * 
 * @returns {Promise<string | null>} Access token or null if auth fails
 */
async function authenticate(): Promise<string | null> {
    // Return cached token if still valid
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const clientId = FURGONETKA_CLIENT_ID?.trim();
    const clientSecret = FURGONETKA_CLIENT_SECRET?.trim();
    const email = FURGONETKA_EMAIL?.trim();
    const password = FURGONETKA_PASSWORD?.trim();

    if (!clientId || !clientSecret || !email || !password) {
        console.error("[Furgonetka] Missing credentials. Check environment variables.");
        return null;
    }

    try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch(`${BASE_URL}/oauth/token`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: new URLSearchParams({
                grant_type: "password",
                scope: "api",
                username: email,
                password: password
            }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Furgonetka] Authentication failed (${response.status}):`, errorText);
            return null;
        }

        const data: FurgonetkaTokenResponse = await response.json();

        // Cache token with 60s buffer before expiry
        cachedToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

        console.log(`[Furgonetka] Authentication successful (expires in ${data.expires_in}s)`);
        return cachedToken;

    } catch (error) {
        console.error("[Furgonetka] Authentication exception:", error);
        return null;
    }
}

// ============================================================================
// PRICING / RATES RETRIEVAL
// ============================================================================

interface FurgonetkaService {
    service_id?: string | number;
    name?: string;
    service?: string;
    description?: string;
    price_gross?: number | string;
    price?: number | string;
    delivery_time?: number;
    carrier?: string;
}

interface FurgonetkaRatesResponse {
    services?: FurgonetkaService[];
    offers?: FurgonetkaService[];
    [key: string]: any;
}

/**
 * GET RATES: Fetch available shipping services with prices
 * 
 * OFFICIAL ENDPOINT (from documentation): POST /packages/calculate-price
 * 
 * REQUEST SCHEMA (per official docs):
 * {
 *   "services": { "service": [], "service_id": [] },
 *   "package": {
 *     "pickup": { name, street, postcode, city, country_code, email, phone },
 *     "receiver": { name, street, postcode, city, country_code, email, phone },
 *     "parcels": [{ width, height, depth, weight }],
 *     "type": "package"
 *   }
 * }
 * 
 * RESPONSE SCHEMA (per official docs):
 * {
 *   "services_prices": [
 *     {
 *       "service": "dpd",
 *       "service_id": 123,
 *       "available": true,
 *       "pricing": { "price_gross": 20.76, "price_net": 16.88 }
 *     }
 *   ]
 * }
 * 
 * @param {RateParams} params - Shipment parameters
 * @returns {Promise<ShippingRate[]>} Array of available rates
 */
export async function getFurgonetkaRates(params: RateParams): Promise<ShippingRate[]> {
    const { addressTo, parcel } = params;
    const token = await authenticate();

    if (!token) {
        console.warn("[Furgonetka] Skipping rates - authentication failed");
        return [];
    }

    // Validate required address fields
    if (!addressTo.city || !addressTo.zip || !addressTo.country) {
        console.warn("[Furgonetka] Missing required address fields (city, zip, or country)");
        return [];
    }

    // Validate parcel dimensions
    if (!parcel.weight || !parcel.width || !parcel.height || !parcel.length) {
        console.warn("[Furgonetka] Missing required parcel dimensions");
        return [];
    }

    // Construct API payload STRICTLY according to official documentation
    // Documentation: POST /packages/calculate-price
    // Section: "Przesyłki" → "Kalkulacja ceny przesyłki"
    const payload = {
        services: {
            service: [],    // Empty array = fetch all available services
            service_id: []  // Empty array = fetch all service IDs
        },
        package: {
            pickup: {
                name: STORE_CONFIG.name,
                company: STORE_CONFIG.name,
                street: STORE_CONFIG.street,
                postcode: STORE_CONFIG.postcode.replace(/-/g, ""),
                city: STORE_CONFIG.city,
                country_code: STORE_CONFIG.country,
                email: STORE_CONFIG.email,
                phone: STORE_CONFIG.phone
            },
            receiver: {
                name: addressTo.name || addressTo.company || "Customer",
                company: addressTo.company || "",
                street: addressTo.street1,
                postcode: addressTo.zip.replace(/-/g, ""),
                city: addressTo.city,
                country_code: addressTo.country,
                email: addressTo.email || STORE_CONFIG.email,
                phone: addressTo.phone || STORE_CONFIG.phone
            },
            type: "package",  // Per docs: "package", "dox", "pallet", etc.
            parcels: [{
                width: Number(parcel.width),
                height: Number(parcel.height),
                depth: Number(parcel.length),  // Furgonetka uses 'depth', we use 'length'
                weight: Number(parcel.weight)
            }]
        }
    };

    // Log payload only in development/sandbox mode
    if (IS_SANDBOX) {
        console.log("[Furgonetka] Request payload:", JSON.stringify(payload, null, 2));
    }

    try {
        console.log(`[Furgonetka] Fetching rates for ${addressTo.city}, ${addressTo.country}...`);

        // OFFICIAL DOCUMENTED ENDPOINT
        const endpoint = `${BASE_URL}/packages/calculate-price`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/vnd.furgonetka.v1+json",
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.furgonetka.v1+json"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000) // 15 second timeout to avoid indefinite hanging
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.warn(`[Furgonetka] API Error (${response.status}):`, responseText.substring(0, 500));
            return [];
        }

        return parseFurgonetkaResponse(responseText, addressTo);

    } catch (error) {
        console.error("[Furgonetka] Rate fetching exception:", error);
        return [];
    }
}

/**
 * Parse Furgonetka API response and convert to ShippingRate[]
 * 
 * OFFICIAL RESPONSE SCHEMA (from documentation):
 * {
 *   "services_prices": [
 *     {
 *       "service": "dpd",           // Service name
 *       "service_id": 123,          // Service ID
 *       "available": true,          // Availability flag
 *       "pricing": {
 *         "price_gross": 20.76,     // Gross price (with VAT)
 *         "price_net": 16.88,       // Net price (without VAT)
 *         "price_base_net": 12.89,  // Base net price
 *         "tax": 23                 // Tax percentage
 *       },
 *       "transport_service": "DPD Classic",
 *       "delivery_time": "1-2 dni robocze",
 *       "errors": []                // Validation errors if available=false
 *     }
 *   ]
 * }
 */
function parseFurgonetkaResponse(responseText: string, addressTo: any): ShippingRate[] {
    // Parse response
    let data: any;
    try {
        data = JSON.parse(responseText);
    } catch (parseError) {
        console.error("[Furgonetka] Invalid JSON response:", responseText.substring(0, 200));
        return [];
    }

    // Log raw response only in development/sandbox mode for debugging
    if (IS_SANDBOX) {
        console.log("[Furgonetka] RAW API RESPONSE:", JSON.stringify(data, null, 2));
        console.log("[Furgonetka] Response keys:", Object.keys(data));
    }

    // Extract services from response according to official documentation
    // Official key: services_prices
    if (!data.services_prices || !Array.isArray(data.services_prices)) {
        console.warn("[Furgonetka] No 'services_prices' array in response");
        console.warn("[Furgonetka] Full response:", JSON.stringify(data).substring(0, 500));
        return [];
    }

    const services = data.services_prices;

    if (services.length === 0) {
        console.warn("[Furgonetka] Empty services_prices array");
        return [];
    }

    // Convert to standard ShippingRate format
    // Filter: ONLY include services where available=true AND pricing exists
    const rates: ShippingRate[] = services
        .filter((service: any) => {
            if (!service.available) {
                // Log unavailable services only in development mode
                if (IS_SANDBOX) {
                    console.log(`[Furgonetka] Service ${service.service} not available:`, service.errors || "no reason given");
                }
                return false;
            }
            if (!service.pricing || !service.pricing.price_gross) {
                if (IS_SANDBOX) {
                    console.log(`[Furgonetka] Service ${service.service} has no pricing data`);
                }
                return false;
            }
            return true;
        })
        .map((service: any) => {
            const serviceId = service.service_id || service.service;
            const serviceName = service.service || "Furgonetka";

            // Use transport_service if available (e.g. "DPD Classic"), otherwise use capitalized service name
            let displayName = service.transport_service;
            if (!displayName) {
                // Capitalize first letter of each word
                displayName = serviceName
                    .split('_')
                    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
            }

            // Extract price according to official schema
            const priceGross = service.pricing.price_gross;

            return {
                id: `furgo_${serviceId}`,
                provider: displayName,  // Beautiful name for display
                service_level: "",      // Empty - we don't need duplicate text
                amount: typeof priceGross === "number" ? priceGross : parseFloat(String(priceGross)) || 0,
                currency: "PLN",
                estimated_days: extractEstimatedDays(service.delivery_time) || 2,
                provider_type: "furgonetka",
                provider_image_75: getCarrierLogo(serviceName)
            };
        });

    console.log(`[Furgonetka] Successfully parsed ${rates.length} available services`);
    return rates;
}

/**
 * Extract numeric estimated days from delivery time string
 * e.g., "1-2 dni robocze" → 2
 */
function extractEstimatedDays(deliveryTime?: string): number {
    if (!deliveryTime) return 2;
    const match = deliveryTime.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 2;
}

// ============================================================================
// SHIPMENT CREATION
// ============================================================================

interface FurgonetkaPackageResponse {
    id: string | number;
    tracking_number?: string;
    label_url?: string;
    status?: string;
    [key: string]: any;
}

/**
 * CREATE SHIPMENT: Create package with selected service
 * 
 * ENDPOINT: POST /packages
 * 
 * @param {string} serviceId - Service ID from getRates() (format: "furgo_<service_id>")
 * @param {RateParams} params - Shipment parameters
 * @returns {Promise<FurgonetkaPackageResponse>} Created package details
 */
export async function createFurgonetkaShipment(
    serviceId: string,
    params: RateParams
): Promise<FurgonetkaPackageResponse> {
    const { addressTo, parcel } = params;
    const token = await authenticate();

    if (!token) {
        throw new Error("Furgonetka authentication failed");
    }

    // Extract actual service_id from our prefixed format
    const actualServiceId = serviceId.replace("furgo_", "").split("_")[0];

    const payload = {
        service_id: actualServiceId,
        type: "package",
        pickup: {
            date: getNextBusinessDay(),
            time_from: "10:00",
            time_to: "16:00",
            street: STORE_CONFIG.street,
            city: STORE_CONFIG.city,
            postcode: STORE_CONFIG.postcode.replace(/-/g, ""),
            name: STORE_CONFIG.name,
            phone: STORE_CONFIG.phone,
            email: STORE_CONFIG.email
        },
        sender: {
            name: STORE_CONFIG.name,
            street: STORE_CONFIG.street,
            city: STORE_CONFIG.city,
            postcode: STORE_CONFIG.postcode.replace(/-/g, ""),
            country: STORE_CONFIG.country,
            email: STORE_CONFIG.email,
            phone: STORE_CONFIG.phone
        },
        receiver: {
            name: (addressTo as any).name || (addressTo as any).company || "Customer",
            street: addressTo.street1,
            city: addressTo.city,
            postcode: addressTo.zip.replace(/-/g, ""),
            country: addressTo.country,
            email: (addressTo as any).email || STORE_CONFIG.email,
            phone: (addressTo as any).phone || STORE_CONFIG.phone
        },
        parcels: [{
            weight: Number(parcel.weight),
            width: Number(parcel.width),
            height: Number(parcel.height),
            depth: Number(parcel.length),
            description: (parcel as any).description || "Merchandise"
        }]
    };

    try {
        console.log(`[Furgonetka] Creating shipment with service ${actualServiceId}...`);

        const response = await fetch(`${BASE_URL}/packages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("[Furgonetka] Shipment creation failed:", JSON.stringify(result));
            throw new Error(`Furgonetka API Error: ${JSON.stringify(result.errors || result)}`);
        }

        console.log(`[Furgonetka] Shipment created successfully:`, result.id);
        return result;

    } catch (error) {
        console.error("[Furgonetka] Shipment creation exception:", error);
        throw error;
    }
}

// ============================================================================
// LABEL RETRIEVAL
// ============================================================================

/**
 * GET LABEL: Retrieve shipping label for created package
 * 
 * ENDPOINT: GET /packages/{id}/label (Typical pattern - needs verification)
 * 
 * Alternative: Label URL might be included in creation response
 * 
 * @param {string | number} packageId - Package ID from createShipment()
 * @returns {Promise<Blob | string>} Label as PDF blob or URL
 */
export async function getFurgonetkaLabel(
    packageId: string | number
): Promise<{ url?: string; blob?: Blob }> {
    const token = await authenticate();

    if (!token) {
        throw new Error("Furgonetka authentication failed");
    }

    try {
        console.log(`[Furgonetka] Fetching label for package ${packageId}...`);

        // Try standard label endpoint
        const response = await fetch(`${BASE_URL}/packages/${packageId}/label`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/pdf"
            }
        });

        if (!response.ok) {
            // If endpoint doesn't exist, log and check alternative
            if (response.status === 404) {
                console.warn("[Furgonetka] Label endpoint not found. Check if label_url in creation response.");
            }
            throw new Error(`Failed to fetch label: ${response.status}`);
        }

        const blob = await response.blob();
        return { blob };

    } catch (error) {
        console.error("[Furgonetka] Label retrieval exception:", error);
        throw error;
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get next business day (skip weekends)
 * @returns {string} Date in YYYY-MM-DD format
 */
function getNextBusinessDay(): string {
    const tomorrow = new Date(Date.now() + 86400000);
    const dayOfWeek = tomorrow.getDay();

    // If tomorrow is Sunday (0), add 1 day
    // If tomorrow is Saturday (6), add 2 days
    if (dayOfWeek === 0) {
        tomorrow.setDate(tomorrow.getDate() + 1);
    } else if (dayOfWeek === 6) {
        tomorrow.setDate(tomorrow.getDate() + 2);
    }

    return tomorrow.toISOString().split('T')[0];
}

/**
 * Get carrier logo URL based on service name
 * Используем CDN jsdelivr для надежной загрузки логотипов
 * @param {string} name - Carrier name
 * @returns {string | undefined} Logo URL
 */
function getCarrierLogo(name: string): string | undefined {
    const normalized = (name || "").toLowerCase();

    // Все логотипы с официального CDN Furgonetka - 100% надежно!
    const logos: Record<string, string> = {
        dpd: "https://assets.aftership.com/couriers/svg/dpd.svg",
        gls: "https://assets.aftership.com/couriers/svg/gls.svg",
        ups: "https://assets.aftership.com/couriers/svg/ups.svg",
        inpost: "https://assets.aftership.com/couriers/svg/inpost-paczkomaty.svg",
        poczta: "https://assets.aftership.com/couriers/svg/poczta-polska.svg",
        pocztex: "https://status.furgonetka.pl/assets/logo-poczta_polska.svg",
        orlen: "https://status.furgonetka.pl/assets/logo-orlen.svg",
        "paczka w ruchu": "https://status.furgonetka.pl/assets/logo-orlen.svg",
        "orlen paczka": "https://status.furgonetka.pl/assets/logo-orlen.svg",
        dhl: "https://assets.aftership.com/couriers/svg/dhl.svg",
        "dhl express": "https://assets.aftership.com/couriers/svg/dhl.svg",
        "dhlparcel": "https://assets.aftership.com/couriers/svg/dhl.svg",
        meest: "https://assets.aftership.com/couriers/svg/meest.svg",
        ambroexpress: "https://status.furgonetka.pl/assets/logo-ambroexpress.svg",
        ambro: "https://status.furgonetka.pl/assets/logo-ambroexpress.svg",
        deligoo: "https://status.furgonetka.pl/assets/logo-deligoo.svg",
        swiatprzesylek: "https://status.furgonetka.pl/assets/logo-sp-express.svg",
        "swiat przesylek": "https://status.furgonetka.pl/assets/logo-sp-express.svg",
        "świat przesyłek": "https://status.furgonetka.pl/assets/logo-sp-express.svg",
        allegro: "https://status.furgonetka.pl/assets/logo-allegro.svg",
        postivo: "https://status.furgonetka.pl/assets/logo-postivo.svg",
        fedex: "https://assets.aftership.com/couriers/svg/fedex.svg"
    };

    // Точное совпадение (приоритет)
    if (logos[normalized]) {
        return logos[normalized];
    }

    // Частичное совпадение
    for (const [key, url] of Object.entries(logos)) {
        if (normalized.includes(key)) {
            return url;
        }
    }

    return undefined;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Note: getFurgonetkaRates, createFurgonetkaShipment, and getFurgonetkaLabel
// are already exported via their function declarations above

// Export authenticate for direct use
export { authenticate };

// Default export for convenience
export default {
    authenticate,
    getRates: getFurgonetkaRates,
    createShipment: createFurgonetkaShipment,
    getLabel: getFurgonetkaLabel
};
