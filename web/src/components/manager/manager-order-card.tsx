"use client";

import { useState, type FormEvent } from "react";
import type {
  ManagerOrder,
  ManagerOrderStatusUpdate,
} from "@/api/client";
import { formatMoney } from "@/lib/format-money";

const statusLabels: Record<ManagerOrder["status"], string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

function formatOrderDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(date);
}

export function ManagerOrderCard({
  order,
  pending,
  onStatusChange,
}: {
  order: ManagerOrder;
  pending: boolean;
  onStatusChange: (
    orderId: number,
    payload: ManagerOrderStatusUpdate,
  ) => void;
}) {
  const [selectedStatus, setSelectedStatus] =
    useState<ManagerOrderStatusUpdate["status"] | "">("");
  const availableStatuses = order.allowed_next_statuses;

  function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedStatus) {
      onStatusChange(order.id, { status: selectedStatus });
    }
  }

  return (
    <li className="order-card manager-order-card">
      <div className="order-heading">
        <div>
          <h3>Pickup order #{order.id}</h3>
          <p>
            Placed{" "}
            <time dateTime={order.created_at}>
              {formatOrderDate(order.created_at)}
            </time>
          </p>
        </div>
        <p className="order-total">{formatMoney(order.subtotal)}</p>
      </div>
      <p className="order-fulfillment">
        Pickup · Customer order #{order.customer_order_id}
      </p>
      <p className="order-status">
        Current status: <strong>{statusLabels[order.status]}</strong>
      </p>
      <ul className="order-line-list">
        {order.lines.map((line) => (
          <li key={line.id}>
            <span>
              {line.quantity} × {line.item_name}
            </span>
            <span>{formatMoney(line.line_total)}</span>
          </li>
        ))}
      </ul>
      {availableStatuses.length > 0 && (
        <form className="manager-status-form" onSubmit={submitStatus}>
          <label htmlFor={`order-status-${order.id}`}>
            Update pickup status
            <select
              id={`order-status-${order.id}`}
              required
              value={selectedStatus}
              disabled={pending}
              onChange={(event) =>
                setSelectedStatus(
                  availableStatuses.find(
                    (status) => status === event.target.value,
                  ) ?? "",
                )
              }
            >
              <option value="" disabled>
                Choose a status
              </option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-outline"
            type="submit"
            disabled={pending || !selectedStatus}
          >
            Update status
          </button>
        </form>
      )}
    </li>
  );
}
