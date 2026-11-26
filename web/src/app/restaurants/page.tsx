import { Suspense } from "react";
import type { Metadata } from "next";
import { RestaurantBrowser } from "@/components/restaurants/restaurant-browser";

export const metadata: Metadata = {
  title: "Restaurants",
  description: "Explore local restaurants and pickup menus on Snapfood.",
};

export default function RestaurantsPage() {
  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">Find something good</p>
      <h1 className="page-title">Restaurants near you.</h1>
      <p className="page-description">
        Browse local menus, then add your favorites to a pickup order.
      </p>
      <Suspense
        fallback={
          <p className="notice-text" role="status">
            Loading restaurants…
          </p>
        }
      >
        <RestaurantBrowser />
      </Suspense>
    </main>
  );
}
