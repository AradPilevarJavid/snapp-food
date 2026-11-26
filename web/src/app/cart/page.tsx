import type { Metadata } from "next";
import { CartCheckout } from "@/components/cart/cart-checkout";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">Your pickup order</p>
      <h1 className="page-title">Your cart.</h1>
      <CartCheckout />
    </main>
  );
}
