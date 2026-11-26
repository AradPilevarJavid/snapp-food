import { queryOptions } from "@tanstack/react-query";
import {
  getManagerMenu,
  getManagerOrders,
  getOrderHistory,
  listManagerRestaurants,
  listRestaurantMenu,
  listRestaurants,
} from "@/api/client";
import { ApiError } from "@/api/client";

export const restaurantQueries = {
  all: () =>
    queryOptions({
      queryKey: ["restaurants"] as const,
      queryFn: ({ signal }) => listRestaurants(signal),
      staleTime: 60_000,
    }),
  menu: (restaurantId: number) =>
    queryOptions({
      queryKey: ["restaurants", restaurantId, "menu"] as const,
      queryFn: ({ signal }) => listRestaurantMenu(restaurantId, signal),
      staleTime: 0,
    }),
};

export const customerQueries = {
  orders: () =>
    queryOptions({
      queryKey: ["customer", "orders"] as const,
      queryFn: ({ signal }) => getOrderHistory(signal),
      staleTime: 15_000,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status !== null && error.status < 500) &&
        failureCount < 1,
    }),
};

export const managerKeys = {
  all: ["manager"] as const,
  restaurants: () => [...managerKeys.all, "restaurants"] as const,
  menu: (restaurantId: number) =>
    [...managerKeys.all, restaurantId, "menu"] as const,
  orders: (restaurantId: number) =>
    [...managerKeys.all, restaurantId, "orders"] as const,
};

export const managerQueries = {
  restaurants: () =>
    queryOptions({
      queryKey: managerKeys.restaurants(),
      queryFn: ({ signal }) => listManagerRestaurants(signal),
      staleTime: 60_000,
    }),
  menu: (restaurantId: number) =>
    queryOptions({
      queryKey: managerKeys.menu(restaurantId),
      queryFn: ({ signal }) => getManagerMenu(restaurantId, signal),
      staleTime: 15_000,
    }),
  orders: (restaurantId: number) =>
    queryOptions({
      queryKey: managerKeys.orders(restaurantId),
      queryFn: ({ signal }) => getManagerOrders(restaurantId, signal),
      staleTime: 10_000,
    }),
};
