// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type { ManagerOrder } from "@/api/client";
import { ManagerOrderCard } from "./manager-order-card";

const order = {
  id: 21,
  customer_order_id: 17,
  restaurant_id: 4,
  restaurant_name: "Market Kitchen",
  status: "received",
  allowed_next_statuses: ["preparing", "cancelled"],
  subtotal: "12.50",
  created_at: "2026-03-01T10:00:00Z",
  fulfillment_method: "pickup",
  lines: [
    {
      id: 1,
      menu_item_id: 8,
      item_name: "Soup",
      quantity: 2,
      unit_price: "6.25",
      line_total: "12.50",
    },
  ],
} satisfies ManagerOrder;

afterEach(cleanup);

describe("ManagerOrderCard", () => {
  it("only offers server-provided next statuses and submits the selection", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const { container } = render(
      <ul>
        <ManagerOrderCard
          order={order}
          pending={false}
          onStatusChange={onStatusChange}
        />
      </ul>,
    );

    const select = screen.getByRole("combobox", {
      name: "Update pickup status",
    });
    expect(screen.getByRole("option", { name: "Preparing" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Cancelled" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Ready for pickup" })).toBeNull();

    await user.selectOptions(select, "preparing");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(onStatusChange).toHaveBeenCalledWith(21, { status: "preparing" });

    const accessibilityResults = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(accessibilityResults.violations).toEqual([]);
  });

  it("does not offer transitions from a terminal status", () => {
    const pickedUpOrder = {
      ...order,
      status: "picked_up",
      allowed_next_statuses: [],
    } satisfies ManagerOrder;

    render(
      <ul>
        <ManagerOrderCard
          order={pickedUpOrder}
          pending={false}
          onStatusChange={vi.fn()}
        />
      </ul>,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Current status:")).toBeInTheDocument();
    expect(screen.getByText("Picked up")).toBeInTheDocument();
  });
});
