import { atom, computed } from 'nanostores';

export interface CartItem {
    productId: string;
    name: string;
    price: number;
    pricePLN: number;
    image: string;
    productType: 'physical' | 'digital';
    selectedSize?: string;
    quantity: number;
    shipping?: {
        weight: number;
        length: number;
        width: number;
        height: number;
    };
}

const CART_STORAGE_KEY = 'visupair_cart';

function loadFromStorage(): CartItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveToStorage(items: CartItem[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('Failed to save cart:', e);
    }
}

export const cartStore = atom<CartItem[]>([]);

export const cartCount = computed(cartStore, (items) => items.length);

export const cartTotal = computed(cartStore, (items) =>
    items.reduce((sum, item) => sum + item.price, 0)
);

export const cartTotalPLN = computed(cartStore, (items) =>
    items.reduce((sum, item) => sum + item.pricePLN, 0)
);

export function initCart() {
    cartStore.set(loadFromStorage());
}

/**
 * Returns true if the product (with optional size variant) is already in the cart.
 */
export function isInCart(productId: string, selectedSize?: string): boolean {
    return cartStore.get().some(
        (i) => i.productId === productId && i.selectedSize === selectedSize
    );
}

/** True if any cart line matches this product (any size variant). */
export function isProductInCartAnySize(productId: string): boolean {
    return cartStore.get().some((i) => i.productId === productId);
}

/**
 * Adds an item. Each product is unique — if already in cart, this is a no-op
 * and returns false. Returns true if the item was actually added.
 */
export function addToCart(item: Omit<CartItem, 'quantity'>): boolean {
    const current = cartStore.get();
    const exists = current.some(
        (i) => i.productId === item.productId && i.selectedSize === item.selectedSize
    );

    if (exists) return false;

    const updated = [...current, { ...item, quantity: 1 }];
    cartStore.set(updated);
    saveToStorage(updated);
    return true;
}

export function removeFromCart(productId: string, selectedSize?: string) {
    const current = cartStore.get();
    const updated = current.filter(
        (i) => !(i.productId === productId && i.selectedSize === selectedSize)
    );
    cartStore.set(updated);
    saveToStorage(updated);
}

/** Remove every line item for this product (all size variants). */
export function removeAllLinesForProduct(productId: string) {
    const current = cartStore.get();
    const updated = current.filter((i) => i.productId !== productId);
    if (updated.length === current.length) return;
    cartStore.set(updated);
    saveToStorage(updated);
}

export function clearCart() {
    cartStore.set([]);
    saveToStorage([]);
}

export function hasPhysicalItems(): boolean {
    return cartStore.get().some((i) => i.productType === 'physical');
}

export function getCombinedParcel() {
    const physicalItems = cartStore.get().filter((i) => i.productType === 'physical' && i.shipping);
    if (physicalItems.length === 0) return null;

    let totalWeight = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let totalHeight = 0;

    for (const item of physicalItems) {
        if (!item.shipping) continue;
        totalWeight += item.shipping.weight || 0;
        maxLength = Math.max(maxLength, item.shipping.length || 0);
        maxWidth = Math.max(maxWidth, item.shipping.width || 0);
        totalHeight += item.shipping.height || 0;
    }

    return {
        weight: totalWeight.toFixed(2),
        length: maxLength.toString(),
        width: maxWidth.toString(),
        height: totalHeight.toString(),
    };
}
