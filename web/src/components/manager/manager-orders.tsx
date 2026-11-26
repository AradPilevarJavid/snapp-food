"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApiErrorMessage,
  updateManagerOrderStatus,
  type ManagerOrderStatusUpdate,
} from "@/api/client";
import {
  customerQueries,
  managerKeys,
  managerQueries,
} from "@/api/queries";
import { ManagerOrderCard } from "@/components/manager/manager-order-card";
import { publicConfig } from "@/lib/public-config";

export function ManagerOrders({ restaurantId }: { restaurantId: number }) {
  const queryClient = useQueryClient();
  const errorRef = useRef<HTMLDivElement>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const ordersQuery = useQuery(managerQueries.orders(restaurantId));
  const statusMutation = useMutation({
    mutationFn: ({
      orderId,
      payload,
    }: {
      orderId: number;
      payload: ManagerOrderStatusUpdate;
    }) => updateManagerOrderStatus(restaurantId, orderId, payload),
    onSuccess: async (order) => {
      setStatusMessage(
        `Order #${order.id} status updated to ${order.status.replace("_", " ")}.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: managerKeys.orders(restaurantId),
        }),
        queryClient.invalidateQueries({
          queryKey: customerQueries.orders().queryKey,
        }),
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: managerKeys.orders(restaurantId),
      });
    },
  });

  useEffect(() => {
    if (statusMutation.isError) errorRef.current?.focus();
  }, [statusMutation.isError]);

  function changeStatus(orderId: number, payload: ManagerOrderStatusUpdate) {
    setStatusMessage("");
    statusMutation.mutate({ orderId, payload });
  }

  return (
    <section
      className="manager-panel"
      aria-labelledby={`manager-orders-${restaurantId}`}
    >
      <div className="manager-section-heading">
        <div>
          <p className="eyebrow">Pickup queue</p>
          <h2 className="section-title" id={`manager-orders-${restaurantId}`}>
            Incoming orders
          </h2>
        </div>
      </div>
      <p className="notice-text" role="status">
        {statusMessage}
      </p>
      {!publicConfig.currency && (
        <p className="notice-text">
          Currency display is not configured. Amounts are shown without a
          currency symbol.
        </p>
      )}
      {statusMutation.isError && (
        <div
          className="error-panel"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <p>{getApiErrorMessage(statusMutation.error)}</p>
        </div>
      )}
      {ordersQuery.isPending ? (
        <p className="notice-text" role="status">
          Loading incoming orders…
        </p>
      ) : ordersQuery.isError ? (
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
      ) : ordersQuery.data.length === 0 ? (
        <div className="empty-panel">
          <h3>No pickup orders yet.</h3>
          <p>New orders for this restaurant will appear here.</p>
        </div>
      ) : (
        <>
          {ordersQuery.data.length === 100 && (
            <p className="notice-text">
              Showing the 100 most recent orders.
            </p>
          )}
          <ul className="manager-order-list">
            {ordersQuery.data.map((order) => (
              <ManagerOrderCard
                key={`${order.id}-${order.status}`}
                order={order}
                pending={statusMutation.isPending}
                onStatusChange={changeStatus}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
