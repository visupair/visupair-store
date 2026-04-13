import type { SanityClient } from "@sanity/client";

const ORDERS_WITH_DIGITAL_LINES = `*[_type == "order" && lower(customerEmail) == $email && status in ["paid", "processing", "shipped", "delivered"]] | order(createdAt desc) {
  _id,
  items[]{
    _key,
    productType,
    "ref": product._ref
  }
}`;

export type OwnedDigitalPurchaseMap = {
    productIds: string[];
    purchaseHashByProductId: Record<string, string>;
};

/**
 * Digital product ids the customer owns and a URL hash for each product’s newest
 * matching line on `/account/purchases` (`#purchase-line-{orderId}-{itemKey}`).
 */
export async function fetchOwnedDigitalPurchaseMap(
    client: SanityClient,
    email: string,
): Promise<OwnedDigitalPurchaseMap> {
    const normalized = email.trim().toLowerCase();
    const orders = await client.fetch<
        {
            _id: string;
            items?: {
                _key?: string;
                productType?: string;
                ref?: string;
            }[];
        }[]
    >(ORDERS_WITH_DIGITAL_LINES, { email: normalized });

    const productIds = new Set<string>();
    const purchaseHashByProductId: Record<string, string> = {};

    for (const o of orders || []) {
        for (const line of o.items || []) {
            if (
                line?.productType === "digital" &&
                line?.ref &&
                line?._key
            ) {
                const ref = String(line.ref);
                productIds.add(ref);
                if (!purchaseHashByProductId[ref]) {
                    purchaseHashByProductId[ref] =
                        `#purchase-line-${o._id}-${line._key}`;
                }
            }
        }
    }

    return {
        productIds: [...productIds],
        purchaseHashByProductId,
    };
}

export async function purchaseHashForDigitalProduct(
    client: SanityClient,
    email: string,
    productId: string,
): Promise<string | null> {
    const { purchaseHashByProductId } = await fetchOwnedDigitalPurchaseMap(
        client,
        email,
    );
    return purchaseHashByProductId[productId] ?? null;
}
