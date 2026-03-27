// Currency detection utility based on user location

export type Currency = 'EUR' | 'PLN';

export interface CurrencyInfo {
    code: Currency;
    symbol: string;
}

const CURRENCY_SYMBOLS: Record<Currency, string> = {
    EUR: '€',
    PLN: 'zł',
};

// Exchange rate: 1 EUR = X PLN
// Update this value periodically to match current exchange rates
export const EUR_TO_PLN_RATE = 4.3;

/**
 * Detects user's preferred currency based on their location
 * Uses multiple methods with priority: timezone (most reliable), then browser language
 */
export function detectUserCurrency(): Currency {
    // PRIORITY 1: Check timezone (most reliable for physical location)
    if (typeof Intl !== 'undefined') {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            // Polish timezones
            if (timezone && (timezone.includes('Warsaw') || timezone === 'Europe/Warsaw' || timezone === 'Poland')) {
                return 'PLN';
            }
        } catch (e) {
            // Timezone detection failed, continue to next method
        }
    }

    // PRIORITY 2: Check browser's locale
    if (typeof navigator !== 'undefined') {
        const locale = navigator.language || (navigator as any).userLanguage;
        
        // Polish locales
        if (locale && locale.toLowerCase().startsWith('pl')) {
            return 'PLN';
        }
    }

    // Default to EUR for other European users
    return 'EUR';
}

/**
 * Gets currency info (code and symbol)
 */
export function getCurrencyInfo(currency?: Currency): CurrencyInfo {
    const code = currency || detectUserCurrency();
    return {
        code,
        symbol: CURRENCY_SYMBOLS[code],
    };
}

/**
 * Formats price with currency symbol
 */
export function formatPrice(priceEUR: number, pricePLN?: number, currency?: Currency): string {
    const detectedCurrency = currency || detectUserCurrency();
    
    if (detectedCurrency === 'PLN' && pricePLN) {
        return `${pricePLN}zł`;
    }
    
    return `€${priceEUR}`;
}

/**
 * Gets the appropriate price based on user's currency
 * Automatically converts EUR to PLN if pricePLN is not provided
 */
export function getPrice(priceEUR: number, pricePLN?: number, currency?: Currency): number {
    const detectedCurrency = currency || detectUserCurrency();
    
    if (detectedCurrency === 'PLN') {
        // Use provided PLN price, or auto-convert from EUR
        return pricePLN || Math.round(priceEUR * EUR_TO_PLN_RATE);
    }
    
    return priceEUR;
}

/**
 * Converts EUR to PLN using current exchange rate
 */
export function convertEURtoPLN(priceEUR: number): number {
    return Math.round(priceEUR * EUR_TO_PLN_RATE);
}
