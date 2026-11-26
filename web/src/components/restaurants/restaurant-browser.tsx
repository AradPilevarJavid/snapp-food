"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getApiErrorMessage } from "@/api/client";
import { restaurantQueries } from "@/api/queries";
import { useCart } from "@/components/cart/cart-provider";
import { formatMoney } from "@/lib/format-money";
import { publicConfig } from "@/lib/public-config";

const restaurantIdSchema = z.coerce.number().int().positive();
const priceSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/);

export function RestaurantBrowser() {
  const searchParams = useSearchParams();
  const {
    addItem,
    checkoutPending,
    isReady: cartReady,
    storageError,
  } = useCart();
  const restaurantsQuery = useQuery(restaurantQueries.all());
  const selectedRaw = searchParams.get("restaurant");
  const selectedResult = selectedRaw
    ? restaurantIdSchema.safeParse(selectedRaw)
    : null;
  const selectedId =
    selectedResult?.success === true ? selectedResult.data : null;
  const selectedRestaurant = restaurantsQuery.data?.find(
    (restaurant) => restaurant.id === selectedId,
  );
  const menuQuery = useQuery({
    ...restaurantQueries.menu(selectedId ?? -1),
    enabled: selectedId !== null && selectedRestaurant !== undefined,
  });

  if (restaurantsQuery.isPending) {
    return (
      <p className="notice-text" role="status">
        Finding restaurants…
      </p>
    );
  }

  if (restaurantsQuery.isError) {
    return (
      <div className="error-panel" role="alert">
        <p>{getApiErrorMessage(restaurantsQuery.error)}</p>
        <button
          className="button button-outline"
          type="button"
          onClick={() => void restaurantsQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (restaurantsQuery.data.length === 0) {
    return (
      <div className="empty-panel">
        <h2>No restaurants are listed yet.</h2>
        <p>Check back soon as neighborhood kitchens join Snapfood.</p>
      </div>
    );
  }

  if (selectedRaw && !selectedId) {
    return (
      <div className="error-panel" role="alert">
        <p>That restaurant selection is not valid.</p>
        <Link className="text-link" href="/restaurants">
          Browse all restaurants
        </Link>
      </div>
    );
  }

  if (selectedId && !selectedRestaurant) {
    return (
      <div className="error-panel" role="alert">
        <p>That restaurant is not available. Choose another restaurant.</p>
        <Link className="text-link" href="/restaurants">
          Browse all restaurants
        </Link>
      </div>
    );
  }

  return (
    <>
      {storageError && (
        <p className="error-text" role="alert">
          {storageError}
        </p>
      )}
      {selectedRestaurant ? (
        <section aria-labelledby="selected-restaurant-heading">
          <Link className="text-link" href="/restaurants">
            ← All restaurants
          </Link>
          <div className="restaurant-detail-heading">
            <div>
              <p className="eyebrow">{selectedRestaurant.address}</p>
              <h2 id="selected-restaurant-heading">
                {selectedRestaurant.name}
              </h2>
              <p className="page-description">
                {selectedRestaurant.description}
              </p>
            </div>
            {!publicConfig.currency && (
              <p className="notice-text" role="status">
                Currency display is not configured. Amounts are shown without a
                currency symbol.
              </p>
            )}
          </div>
          {menuQuery.isPending ? (
            <p className="notice-text" role="status">
              Loading the menu…
            </p>
          ) : menuQuery.isError ? (
            <div className="error-panel" role="alert">
              <p>{getApiErrorMessage(menuQuery.error)}</p>
              <button
                className="button button-outline"
                type="button"
                onClick={() => void menuQuery.refetch()}
              >
                Try again
              </button>
            </div>
          ) : menuQuery.data.length === 0 ? (
            <div className="empty-panel">
              <h3>The menu is being updated.</h3>
              <p>This restaurant has no available items right now.</p>
            </div>
          ) : (
            <ul className="menu-list">
              {menuQuery.data.map((item) => (
                <li className="menu-item-card" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description || "Freshly prepared to order."}</p>
                    <p
                      className="menu-price"
                      aria-label={`Price ${formatMoney(item.price)}`}
                    >
                      {formatMoney(item.price)}
                    </p>
                  </div>
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={
                      !cartReady ||
                      checkoutPending ||
                      !priceSchema.safeParse(item.price).success
                    }
                    aria-label={`Add ${item.name} to cart`}
                    onClick={() =>
                      addItem(selectedRestaurant.id, item.id)
                    }
                  >
                    Add to cart
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Available restaurants">
          <ul className="restaurant-grid">
            {restaurantsQuery.data.map((restaurant) => (
              <li className="restaurant-card" key={restaurant.id}>
                <p className="eyebrow">{restaurant.address}</p>
                <h2>{restaurant.name}</h2>
                <p>{restaurant.description || "A neighborhood kitchen ready for pickup."}</p>
                <Link
                  className="button button-primary"
                  href={{
                    pathname: "/restaurants",
                    query: { restaurant: String(restaurant.id) },
                  }}
                >
                  Browse menu
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
