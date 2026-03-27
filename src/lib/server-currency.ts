// Server-side currency detection using Cloudflare IP geolocation
// This is the BEST PRACTICE for accurate currency detection

export type Currency = 'EUR' | 'PLN';

// Exchange rate: 1 EUR = X PLN
export const EUR_TO_PLN_RATE = 4.3;

/**
 * Detects user's currency based on their country (from Cloudflare headers)
 * This is the most reliable method for production
 * 
 * @param request - The incoming request object
 * @returns Currency code (EUR or PLN)
 */
export function detectCurrencyFromRequest(request: Request): Currency | undefined {
    // Method 1: Cloudflare CF-IPCountry header (most reliable)
    const cfCountry = request.headers.get('CF-IPCountry');

    if (cfCountry) {
        console.log('Cloudflare country detected:', cfCountry);

        // Poland
        if (cfCountry === 'PL') {
            console.log('Currency: PLN (Poland detected via Cloudflare)');
            return 'PLN';
        }

        // You can add more countries here if needed
        // if (cfCountry === 'CZ') return 'CZK'; // Czech Republic
        // if (cfCountry === 'HU') return 'HUF'; // Hungary

        // Default to EUR for known non-PL countries handled by Cloudflare
        return 'EUR';
    }

    // Method 2: Vercel/Netlify geolocation headers (fallback)
    const vercelCountry = request.headers.get('x-vercel-ip-country');
    const netlifyCountry = request.headers.get('x-country-code');

    const country = vercelCountry || netlifyCountry;

    if (country) {
        console.log('Platform country detected:', country);

        if (country === 'PL') {
            console.log('Currency: PLN (Poland detected via platform)');
            return 'PLN';
        }
        return 'EUR';
    }

    // Default to undefined to let client-side detection handle it (better for local dev/VPN)
    console.log('Currency: Undetermined (server), delegating to client');
    return undefined;
}

/**
 * Gets the appropriate price based on currency
 * Automatically converts EUR to PLN if pricePLN is not provided
 */
export function getPrice(priceEUR: number, pricePLN: number | undefined, currency: Currency): number {
    if (currency === 'PLN') {
        return pricePLN || Math.round(priceEUR * EUR_TO_PLN_RATE);
    }
    return priceEUR;
}

/**
 * Formats price with currency symbol
 */
export function formatPrice(priceEUR: number, pricePLN: number | undefined, currency: Currency): string {
    const price = getPrice(priceEUR, pricePLN, currency);

    if (currency === 'PLN') {
        return `${price}zł`;
    }
    return `€${price}`;
}

/**
 * Converts EUR to PLN
 */
export function convertEURtoPLN(priceEUR: number): number {
    return Math.round(priceEUR * EUR_TO_PLN_RATE);
}
