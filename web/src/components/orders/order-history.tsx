"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiErrorMessage } from "@/api/client";
import { customerQueries } from "@/api/queries";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInButton } from "@/components/auth/sign-in-button";
import { formatMoney } from "@/lib/format-money";
import { publicConfig } from "@/lib/public-config";

function formatOrderDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function OrderHistory() {
  const { status } = useAuth();
  const ordersQuery = useQuery({
    ...customerQueries.orders(),
    enabled: status === "signed-in",
  });

  if (status === "loading") {
    return (
      <p className="notice-text" role="status">
        Checking sign-in status…
      </p>
    );
  }

  if (status !== "signed-in") {
    return (
      <div className="empty-panel">
        <h2>Sign in to see your order history.</h2>
        <p>
          Your orders are private to your account. Sign in to view your pickup
          orders.
        </p>
        <SignInButton label="Sign in to view orders" />
      </div>
    );
  }

  if (ordersQuery.isPending) {
    return (
      <p className="notice-text" role="status">
        Loading your orders…
      </p>
    );
  }

  if (ordersQuery.isError) {
    return (
      <div className="error-panel" role="alert">
        <p>{getApiErrorMessage(ordersQuery.error)}</p>
        <button
          className="button button-outline"
          type="button"
          onClick={() => void ordersQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (ordersQuery.data.length === 0) {
    return (
      <div className="empty-panel">
        <h2>Your next favorite is waiting.</h2>
        <p>Once you place a pickup order, it will appear here.</p>
      </div>
    );
  }

  return (
    <>
      {!publicConfig.currency && (
        <p className="notice-text" role="status">
          Currency display is not configured. Order amounts are shown without a
          currency symbol.
        </p>
      )}
      <ol className="order-list">
        {ordersQuery.data.map((order) => (
          <li className="order-card" key={order.id}>
            <div className="order-heading">
              <div>
                <h2>Order #{order.id}</h2>
                <time dateTime={order.created_at}>
                  {formatOrderDate(order.created_at)}
                </time>
              </div>
              <p className="order-total">{formatMoney(order.total_amount)}</p>
            </div>
            <p className="order-fulfillment">Pickup · Pay at the restaurant</p>
            <ul className="restaurant-order-list">
              {order.restaurant_orders.map((restaurantOrder) => (
                <li key={restaurantOrder.id}>
                  <h3>{restaurantOrder.restaurant_name}</h3>
                  <p className="order-status">
                    Order status: {restaurantOrder.status}
                  </p>
                  <ul className="order-line-list">
                    {restaurantOrder.lines.map((line) => (
                      <li key={line.id}>
                        <span>
                          {line.quantity} × {line.item_name}
                        </span>
                        <span>{formatMoney(line.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
