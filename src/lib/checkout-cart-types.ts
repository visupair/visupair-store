export interface CartCheckoutItem {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    productType: "physical" | "digital";
    selectedSize?: string;
}
