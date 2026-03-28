# Cart System — Visupair Store

This document explains how the cart (basket) system works in the Visupair Store, covering the full flow from adding a product to the cart through payment, stock management, and order fulfillment.

---

## Overview

The cart system allows customers to add multiple products to a single cart and pay for them together in one Stripe checkout session, with combined shipping calculated via Furgonetka. After payment, the store owner receives an email notification and a new order appears in the Sanity admin panel for manual fulfillment.

### Key Design Decisions

- **Unique products**: Each product can only be added once per cart (quantity is always 1). This is because the store sells handmade, one-of-a-kind items — not mass-produced goods.
- **Stock control from Sanity**: The store owner sets how many pieces of each product exist (e.g., 1 or 2). Stock decrements automatically after purchase. When stock reaches 0, the product becomes "Sold Out."
- **Manual fulfillment**: Furgonetka is used only for showing courier options and calculating shipping prices on the website. The actual shipment is created manually by the store owner on the Furgonetka website after receiving the order notification.
- **Shipping payment goes to Stripe**: The customer pays the full amount (products + shipping) to the store owner's Stripe account. The store owner then uses that money to ship via Furgonetka manually.

---

## Architecture

```
Client (Browser)                    Server (Astro API Routes)              External Services
─────────────────                   ──────────────────────────             ──────────────────
cartStore (nanostores)  ──────────► /api/cart-checkout  ──────────────────► Stripe Checkout
     │                              /api/shipping/rates ──────────────────► Furgonetka API
     │                              /api/stripe/webhook ──────────────────► Sanity (create order)
     │                                    │                                 Resend (send email)
     └── localStorage                     └── Decrement stock in Sanity
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `src/lib/cartStore.ts` | Client-side cart state management (nanostores + localStorage) |
| `src/pages/cart.astro` | Cart page UI — view items, remove items, proceed to checkout |
| `src/pages/cart/checkout.astro` | Checkout page — shipping address form, courier selection, payment |
| `src/pages/api/cart-checkout.ts` | Server API — creates a Stripe Checkout Session for the cart |
| `src/pages/api/stripe/webhook.ts` | Stripe webhook — creates Sanity order, decrements stock, sends email |
| `src/pages/checkout/success.astro` | Success page — shown after payment, clears cart from localStorage |
| `src/lib/email.ts` | Sends order notification email to store owner via Resend |
| `src/components/ProductDetail.astro` | Product page — "Add to Cart" / "Go to Cart" button logic |
| `src/components/Navigation.astro` | Navbar — cart icon with live item count badge |
| `src/components/AccountSidebar.astro` | Account sidebar — "My Cart" link |
| `visupair-admin/schemaTypes/product.js` | Sanity product schema — includes `stock` and `inStock` fields |
| `visupair-admin/schemaTypes/order.js` | Sanity order schema — stores order details, courier, shipping cost |

---

## Flow: Step by Step

### 1. Adding to Cart

**File**: `src/components/ProductDetail.astro` (client-side script)
**File**: `src/lib/cartStore.ts`

When a customer clicks "Add to Cart" on a product page:

1. If the product has sizes (fashion items), a size must be selected first.
2. The `addToCart()` function in `cartStore.ts` checks if the product (with the selected size) is already in the cart.
3. If already in cart → returns `false`, button switches to "Go to Cart."
4. If not in cart → adds the item with quantity fixed at 1, saves to `localStorage`, returns `true`.
5. The button briefly shows "Added!" (green), then permanently changes to "Go to Cart" (dark button linking to `/cart`).

Each cart item stores:
```typescript
{
  productId: string;
  name: string;
  price: number;         // EUR price
  pricePLN: number;      // PLN price
  image: string;         // Product thumbnail URL
  productType: 'physical' | 'digital';
  selectedSize?: string;
  quantity: 1;           // Always 1
  shipping?: {           // Physical products only
    weight: number;
    length: number;
    width: number;
    height: number;
  };
}
```

### 2. Cart Page

**File**: `src/pages/cart.astro`

Displays all items in the cart with:
- Product image, name, size variant, type (Physical/Digital), and price
- A remove button (X) for each item
- "Clear Cart" button to empty everything (no confirmation dialog)
- Order summary sidebar with subtotal and "Proceed to Checkout" button

The cart page detects the user's currency (EUR or PLN) and displays prices accordingly.

When "Proceed to Checkout" is clicked:
- Checks if user is logged in (redirects to `/login` if not)
- If cart has physical items → redirects to `/cart/checkout` (shipping form)
- If cart is all digital → calls `/api/cart-checkout` directly (no shipping needed)

### 3. Checkout Page (Shipping)

**File**: `src/pages/cart/checkout.astro`

For orders containing physical products:

1. Customer fills in contact info and shipping address (email, name, address, city, postal code, country).
2. Once address fields are filled, the page calls `/api/shipping/rates` (Furgonetka API) with the combined parcel dimensions.
3. Combined parcel is calculated by `getCombinedParcel()` in `cartStore.ts`:
   - Total weight = sum of all product weights
   - Length = max of all product lengths
   - Width = max of all product widths
   - Height = sum of all product heights
4. Available couriers are displayed with logos, delivery estimates, and prices.
5. Customer selects a courier, then clicks "Continue to Payment."

### 4. Stripe Checkout Session

**File**: `src/pages/api/cart-checkout.ts`

The server creates a Stripe Checkout Session with:
- One `line_item` per product (using `price_data` with dynamic pricing)
- One `line_item` for shipping cost (if applicable)
- `metadata` containing:
  - `checkoutType: "cart"`
  - `orderType`: "physical", "digital", or "mixed"
  - `cartItems`: JSON string with product IDs, names, quantities, sizes, prices
  - `selectedShippingLabel`: courier name (e.g., "DHL", "InPost")
  - `selectedShippingAmount`: shipping cost
  - `userEmail`: customer's email
- For physical orders: `shipping_address_collection` with allowed EU countries + US/UK

The customer is redirected to Stripe's hosted checkout page to complete payment.

### 5. After Payment (Webhook)

**File**: `src/pages/api/stripe/webhook.ts`

When Stripe sends a `checkout.session.completed` event:

1. **Parse cart items** from `session.metadata.cartItems` (JSON).
2. **Create a Sanity order** with:
   - `orderNumber` (Stripe payment intent ID)
   - `customerEmail`, `customerName`
   - `items[]` — each with a reference to the Sanity product, quantity, price, variant
   - `totalAmount`, `currency`
   - `selectedCourier`, `shippingAmount`
   - `shippingAddress` (from Stripe's shipping collection)
   - `status: "paid"`
3. **Decrement stock** for each purchased product:
   - Fetches the product from Sanity
   - Subtracts the purchased quantity from `stock`
   - If new stock is 0 → sets `inStock = false` (product becomes "Sold Out" on the website)
4. **Send email notification** to the store owner via Resend:
   - Includes order number, customer info, items list, courier, shipping cost, address, total
   - Both HTML and plain text versions

### 6. Success Page

**File**: `src/pages/checkout/success.astro`

After payment completes, the customer is redirected here. The page:
- Shows a "Payment Successful!" message
- Clears the cart from `localStorage`
- Provides a link to "View My Purchases"

### 7. Purchases Page

**File**: `src/pages/account/purchases.astro`

Customers can view their past orders, including:
- Order items with product images
- Selected courier
- Tracking number (when the store owner adds it in Sanity)
- Order status

---

## Stock Management

### Sanity Product Schema

**File**: `visupair-admin/schemaTypes/product.js`

Two fields control availability:

| Field | Type | Purpose |
|-------|------|---------|
| `inStock` | boolean | Master toggle — set to `false` manually or automatically when stock reaches 0 |
| `stock` | number | How many pieces exist. Default: 1. Auto-decrements after purchase. |

### How Stock Works

1. **You add a product in Sanity** and set `stock` to the number of pieces you have (e.g., 1 or 2).
2. **Customer buys** → webhook decrements `stock` by 1.
3. **When stock reaches 0** → webhook automatically sets `inStock = false`.
4. **On the website**:
   - Stock > 3: shows "In Stock"
   - Stock 1–3: shows "Only X left"
   - Stock 0: shows "Sold Out" and the "Add to Cart" button is replaced with a restock notification form
5. **Cart prevents duplicates**: A customer can only add 1 unit of any product to their cart.

### Data Flow for `inStock`

In `src/lib/sanity.ts`, when products are fetched:
```typescript
inStock: doc.inStock !== false && (doc.stock === undefined || doc.stock === null || doc.stock > 0)
```
This means a product is considered in stock only if:
- `inStock` is not manually set to `false`, AND
- `stock` is either unset (legacy products, treated as 1) or greater than 0

---

## Manual Fulfillment Workflow

After an order is placed:

1. You receive an **email** with the full order details (items, courier, address, total).
2. The order appears in **Sanity Studio** under "Orders" with status "Paid."
3. You go to the **Furgonetka website** and create a shipment manually:
   - Select the courier the customer chose (shown in the order)
   - Enter the customer's shipping address
   - Print the label and send the package
4. Back in **Sanity Studio**, update the order:
   - Set status to "Shipped"
   - Add the tracking number
5. The customer can see the tracking number on their "My Purchases" page.

---

## Environment Variables Required

| Variable | Service | Purpose |
|----------|---------|---------|
| `STRIPE_SECRET_KEY` | Stripe | Creating checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Verifying webhook signatures |
| `SANITY_API_TOKEN` | Sanity | Writing orders and updating product stock |
| `RESEND_API_KEY` | Resend | Sending order notification emails |
| `ADMIN_EMAIL` | — | Email address where order notifications are sent |
| `FURGONETKA_API_KEY` | Furgonetka | Fetching shipping rates |

---

## Cart Badge (Navbar)

**File**: `src/components/Navigation.astro`

The cart icon in the navbar shows a purple badge with the number of items. This updates reactively via `cartStore.cartCount` (a computed nanostore). When the count is 0, the badge is hidden.

---

## Currency Handling

The store supports EUR and PLN. Currency is detected by:

1. URL parameter `?currency=PLN` (for testing)
2. Server-side Cloudflare geolocation (if available)
3. Browser timezone (`Europe/Warsaw` → PLN)
4. Browser language (`pl-*` → PLN)
5. Default: EUR

Both prices are stored in the cart item (`price` for EUR, `pricePLN` for PLN). The correct one is sent to Stripe based on the detected currency. Shipping rates from Furgonetka (returned in PLN) are converted to EUR if needed using the `open.er-api.com` exchange rate API.
