// Types for service pricing UI. Document content is loaded from Sanity (`getServices`).

export interface ServicePlan {
    _key?: string;
    name: string;
    price: number;
    /** PLN from CMS; if omitted, storefront derives PLN from EUR × 4.3 */
    pricePLN?: number;
    currency?: string;
    description?: string;
    features?: string[];
    highlight?: boolean;
    ctaLabel?: string;
}

export interface ServiceCategory {
    id: string;
    title: string;
    subtitle: string;
    plans: ServicePlan[];
}
