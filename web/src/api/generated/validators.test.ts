import { describe, expect, it } from "vitest";
import {
  validateMenuItemRead,
  validateOrderRead,
  validateRestaurantManagerReadArray,
  validateRestaurantReadArray,
} from "./validators";

describe("generated API response validators", () => {
  it("accepts a restaurant list that matches the OpenAPI contract", () => {
    expect(
      validateRestaurantReadArray([
        {
          id: 1,
          name: "North Cafe",
          description: "Neighborhood coffee and lunch.",
          address: "10 Main Street",
          is_active: true,
        },
      ]),
    ).toBe(true);
  });

  it("rejects a response missing a required restaurant field", () => {
    expect(
      validateRestaurantReadArray([
        {
          id: 1,
          name: "North Cafe",
          description: "Neighborhood coffee and lunch.",
          is_active: true,
        },
      ]),
    ).toBe(false);
  });

  it("accepts assigned manager restaurants that match the OpenAPI contract", () => {
    expect(
      validateRestaurantManagerReadArray([
        {
          id: 8,
          name: "Market Kitchen",
          description: "Seasonal lunch.",
          address: "12 Market Street",
          is_active: true,
        },
      ]),
    ).toBe(true);
  });

  it("rejects a manager restaurant missing its address", () => {
    expect(
      validateRestaurantManagerReadArray([
        {
          id: 8,
          name: "Market Kitchen",
          description: "Seasonal lunch.",
          is_active: true,
        },
      ]),
    ).toBe(false);
  });

  it("rejects a menu price that does not match the backend schema", () => {
    expect(
      validateMenuItemRead({
        id: 3,
        restaurant_id: 1,
        name: "Soup",
        description: "",
        price: 4.5,
        is_available: true,
      }),
    ).toBe(false);
  });

  it("requires order snapshots and totals from the API contract", () => {
    expect(
      validateOrderRead({
        id: 2,
        fulfillment_method: "pickup",
        total_amount: "8.00",
        created_at: "2026-01-01T10:00:00Z",
        restaurant_orders: [],
      }),
    ).toBe(true);
  });

  it("rejects malformed order timestamps", () => {
    expect(
      validateOrderRead({
        id: 2,
        fulfillment_method: "pickup",
        total_amount: "8.00",
        created_at: "not-a-date",
        restaurant_orders: [],
      }),
    ).toBe(false);
  });
});
