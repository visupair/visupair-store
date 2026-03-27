// Rate Interface
export interface ShippingRate {
    id: string; // unique
    provider: string; // "InPost", "Furgonetka (DPD)", etc.
    service_level: string; // "Paczkomat 24/7", "Kurier Standard", etc.
    amount: number | string;
    currency: "PLN" | "EUR";
    estimated_days?: number;
    provider_type?: "inpost" | "furgonetka";
    provider_image_75?: string;
}

// Common Params
export interface RateParams {
    addressTo: {
        country: string;
        city: string;
        zip: string;
        street1: string;
        name?: string;      // Recipient name (optional)
        company?: string;   // Company name (optional)
        email?: string;     // Email (optional)
        phone?: string;     // Phone (optional)
    };
    parcel: {
        weight: string; // kg
        length: string; // cm (will be used as "depth" for Furgonetka)
        width: string; // cm
        height: string; // cm
    };
}
