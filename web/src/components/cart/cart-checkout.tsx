"use client";

import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuItem } from "@/api/client";
import { getApiErrorMessage, placeOrder } from "@/api/client";
import { customerQueries, restaurantQueries } from "@/api/queries";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInButton } from "@/components/auth/sign-in-button";
import { useCart } from "@/components/cart/cart-provider";
import { formatMoney } from "@/lib/format-money";
import { publicConfig } from "@/lib/public-config";

function parseCents(amount: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [whole = "0", fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function formatCents(amount: bigint): string {
  return formatMoney((Number(amount) / 100).toFixed(2));
}

export function CartCheckout() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const {
    items,
    isReady,
    storageError,
    checkoutPending,
    ensureIdempotencyKey,
    setCheckoutPending,
    setQuantity,
    removeItem,
    clearCart,
  } = useCart();
  const restaurantsQuery = useQuery({
    ...restaurantQueries.all(),
    enabled: isReady && items.length > 0,
  });
  const menuQueries = useQueries({
    queries: [...new Set(items.map((item) => item.restaurantId))].map(
      (restaurantId) => restaurantQueries.menu(restaurantId),
    ),
  });
  const mutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: Parameters<typeof placeOrder>[0];
      idempotencyKey: string;
    }) => placeOrder(payload, idempotencyKey),
    onSuccess: async () => {
      clearCart();
      await queryClient.invalidateQueries({
        queryKey: customerQueries.orders().queryKey,
      });
    },
    onSettled: () => setCheckoutPending(false),
  });

  function submitOrder() {
    if (checkoutPending) return;
    const key = ensureIdempotencyKey();
    if (!key) return;
    setCheckoutPending(true);
    mutation.mutate({
      idempotencyKey: key,
      payload: {
        fulfillment_method: "pickup",
        items: items.map((item) => ({
          menu_item_id: item.menuItemId,
          quantity: item.quantity,
        })),
      },
    });
  }

  if (!isReady) {
    return (
      <p className="notice-text" role="status">
        Loading your saved cart…
      </p>
    );
  }

  if (items.length === 0 && !mutation.data) {
    return (
      <div className="empty-panel">
        <h2>Your cart is ready when you are.</h2>
        <p>Explore local menus and add something delicious to get started.</p>
        <Link className="button button-primary" href="/restaurants">
          Explore restaurants
        </Link>
      </div>
    );
  }

  if (mutation.data) {
    return (
      <div className="success-panel" role="status">
        <p className="eyebrow">Order received</p>
        <h2>Thanks for ordering with Snapfood.</h2>
        <p>
          Order #{mutation.data.id} is confirmed for pickup. Pay the restaurant
          directly when you collect it.
        </p>
        <p className="success-total">
          Order total: {formatMoney(mutation.data.total_amount)}
        </p>
        <Link className="button button-primary" href="/orders">
          View your orders
        </Link>
      </div>
    );
  }

  if (restaurantsQuery.isPending) {
    return (
      <p className="notice-text" role="status">
        Checking current menu prices…
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

  const menuError = menuQueries.find((query) => query.isError);
  if (menuError?.isError) {
    return (
      <div className="error-panel" role="alert">
        <p>{getApiErrorMessage(menuError.error)}</p>
        <button
          className="button button-outline"
          type="button"
          onClick={() => {
            void Promise.all(menuQueries.map((query) => query.refetch()));
          }}
        >
          Refresh menus
        </button>
      </div>
    );
  }

  if (menuQueries.some((query) => query.isPending)) {
    return (
      <p className="notice-text" role="status">
        Checking current menu prices…
      </p>
    );
  }

  if (menuQueries.some((query) => query.isFetching)) {
    return (
      <p className="notice-text" role="status">
        Refreshing current menu prices…
      </p>
    );
  }

  const menuItems = menuQueries.flatMap((query) => query.data ?? []);
  const menuById = new Map<number, MenuItem>(
    menuItems.map((menuItem) => [menuItem.id, menuItem]),
  );
  const restaurantById = new Map(
    (restaurantsQuery.data ?? []).map((restaurant) => [
      restaurant.id,
      restaurant,
    ]),
  );
  const cartLines = items.map((cartItem) => {
    const menuItem = menuById.get(cartItem.menuItemId);
    const restaurant =
      menuItem?.restaurant_id === cartItem.restaurantId
        ? restaurantById.get(menuItem.restaurant_id)
        : undefined;
    return { ...cartItem, menuItem, restaurant };
  });
  const unavailableLines = cartLines.filter(
    (line) => !line.menuItem || !line.restaurant,
  );
  const subtotalCents = cartLines.reduce((total, line) => {
    const cents = line.menuItem ? parseCents(line.menuItem.price) : null;
    return cents === null ? total : total + cents * BigInt(line.quantity);
  }, 0n);
  const canCheckout =
    unavailableLines.length === 0 &&
    status === "signed-in" &&
    Boolean(publicConfig.currency) &&
    !mutation.isPending &&
    items.length > 0;

  return (
    <section aria-labelledby="cart-items-heading">
      {storageError && (
        <p className="error-text" role="alert">
          {storageError}
        </p>
      )}
      <h2 className="section-title" id="cart-items-heading">
        Review your pickup order
      </h2>
      <p className="notice-text">
        Prices are checked again by the restaurant service when you place your
        order. Pay the restaurant directly at pickup.
      </p>
      {unavailableLines.length > 0 && (
        <div className="error-panel" role="alert">
          <p>
            Some items are no longer available. Remove them before placing your
            order.
          </p>
        </div>
      )}
      <ul className="cart-list">
        {cartLines.map((line) =>
          line.menuItem && line.restaurant ? (
            <li className="cart-line" key={line.menuItemId}>
              <div className="cart-line-details">
                <p className="eyebrow">{line.restaurant.name}</p>
                <h3>{line.menuItem.name}</h3>
                <p>
                  {formatCents(
                    (parseCents(line.menuItem.price) ?? 0n) *
                      BigInt(line.quantity),
                  )}
                </p>
              </div>
              <div className="cart-line-actions">
                <label>
                  Quantity
                  <select
                    value={line.quantity}
                    disabled={checkoutPending}
                    onChange={(event) =>
                      setQuantity(
                        line.menuItemId,
                        Number(event.currentTarget.value),
                      )
                    }
                  >
                    {Array.from({ length: 50 }, (_, index) => index + 1).map(
                      (quantity) => (
                        <option key={quantity} value={quantity}>
                          {quantity}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  className="text-button"
                  type="button"
                  disabled={checkoutPending}
                  onClick={() => removeItem(line.menuItemId)}
                  aria-label={`Remove ${line.menuItem.name} from cart`}
                >
                  Remove
                </button>
              </div>
            </li>
          ) : (
            <li className="cart-line cart-line-unavailable" key={line.menuItemId}>
              <div>
                <h3>Item unavailable</h3>
                <p>It may have been removed or is no longer offered.</p>
              </div>
              <button
                className="text-button"
                type="button"
                disabled={checkoutPending}
                onClick={() => removeItem(line.menuItemId)}
                aria-label="Remove unavailable item from cart"
              >
                Remove
              </button>
            </li>
          ),
        )}
      </ul>
      <div className="cart-summary">
        <p>
          <strong>Estimated total</strong>
          <strong>{formatCents(subtotalCents)}</strong>
        </p>
        <p>Pickup order · No online payment</p>
        {!publicConfig.currency && (
          <p className="error-text" role="alert">
            Currency display must be configured before placing an order.
          </p>
        )}
        {status === "signed-in" ? (
          <button
            className="button button-primary"
            type="button"
            disabled={!canCheckout}
            onClick={submitOrder}
          >
            {mutation.isPending ? "Placing your order…" : "Place pickup order"}
          </button>
        ) : (
          <SignInButton label="Sign in to place your order" />
        )}
        {mutation.isError && (
          <p className="error-text" role="alert">
            {getApiErrorMessage(mutation.error)}
          </p>
        )}
      </div>
    </section>
  );
}
