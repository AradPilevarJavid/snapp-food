// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { ManagerRestaurant } from "@/api/client";
import { managerQueries } from "@/api/queries";
import { ManagerMenu } from "./manager-menu";
import { ManagerOrders } from "./manager-orders";

const restaurant = {
  id: 4,
  name: "Market Kitchen",
  description: "Seasonal lunch.",
  address: "12 Market Street",
  is_active: true,
} satisfies ManagerRestaurant;

afterEach(cleanup);

function renderWithQueryClient(
  queryKey: readonly unknown[],
  data: unknown,
  view: ReactNode,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(queryKey, data);
  return render(
    <QueryClientProvider client={queryClient}>{view}</QueryClientProvider>,
  );
}

describe("manager panels", () => {
  it("shows an empty menu with an accessible way to add items", async () => {
    const options = managerQueries.menu(restaurant.id);
    const { container } = renderWithQueryClient(
      options.queryKey,
      [],
      <ManagerMenu restaurant={restaurant} />,
    );

    expect(screen.getByText("Your menu is ready to grow.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
    const accessibilityResults = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(accessibilityResults.violations).toEqual([]);
  });

  it("shows an empty pickup queue accessibly", async () => {
    const options = managerQueries.orders(restaurant.id);
    const { container } = renderWithQueryClient(
      options.queryKey,
      [],
      <ManagerOrders restaurantId={restaurant.id} />,
    );

    expect(screen.getByText("No pickup orders yet.")).toBeInTheDocument();
    const accessibilityResults = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(accessibilityResults.violations).toEqual([]);
  });
});
