import type { Metadata } from "next";
import { OrderHistory } from "@/components/orders/order-history";

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">A fresh start, or a favorite repeat</p>
      <h1 className="page-title">Your orders.</h1>
      <OrderHistory />
    </main>
  );
}
