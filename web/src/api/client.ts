import type { components } from "@/api/generated/schema";
import {
  validateManagerIncomingOrderRead,
  validateManagerIncomingOrderReadArray,
  validateMenuItemRead,
  validateMenuItemReadArray,
  validateOrderRead,
  validateOrderReadArray,
  validateRestaurantManagerReadArray,
  validateRestaurantReadArray,
} from "@/api/generated/validators";
import { getUserManager } from "@/lib/auth/oidc-client";
import { publicConfig } from "@/lib/public-config";

type Validator<T> = (data: unknown) => data is T;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return "Your sign-in has expired. Sign in again to continue.";
  if (status === 403) return "This account does not have permission for that action.";
  if (status === 404) return "That restaurant or order is no longer available.";
  if (status === 409) return "This change conflicts with the latest order information.";
  if (status === 422) return "Some menu items are no longer available. Review your order and try again.";
  if (status === 429) return "There have been too many requests. Wait a moment and try again.";
  return "The ordering service could not complete your request. Please try again.";
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "The ordering service could not be reached. Check your connection and try again.";
}

async function accessToken(): Promise<string> {
  const manager = getUserManager();
  if (!manager) {
    throw new ApiError("Secure sign-in is not configured for this site.", null);
  }

  try {
    const user = await manager.getUser();
    if (!user || user.expired || !user.access_token) {
      throw new ApiError("Sign in to continue with your order.", 401);
    }
    return user.access_token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Your sign-in could not be verified. Please sign in again.", 401);
  }
}

async function request<T>(
  path: string,
  validator: Validator<T>,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    authenticated?: boolean;
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!publicConfig.apiBaseUrl) {
    throw new ApiError("The ordering service is not configured for this site.", null);
  }

  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.authenticated) {
    headers.set("Authorization", `Bearer ${await accessToken()}`);
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  let response: Response;
  try {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000);
    response = await fetch(new URL(path, `${publicConfig.apiBaseUrl}/`), {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request was cancelled. Try again when ready.", null);
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("The ordering service took too long to respond. Try again.", null);
    }
    throw new ApiError(
      "The ordering service could not be reached. Check your connection and try again.",
      null,
    );
  }

  if (!response.ok) {
    throw new ApiError(messageForStatus(response.status), response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The ordering service returned an unreadable response.", response.status);
  }

  if (!validator(payload)) {
    throw new ApiError("The ordering service returned data in an unexpected format.", response.status);
  }
  return payload;
}

async function requestNoContent(
  path: string,
  options: {
    method: "DELETE";
    authenticated: true;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (!publicConfig.apiBaseUrl) {
    throw new ApiError("The ordering service is not configured for this site.", null);
  }

  const headers = new Headers({ Accept: "application/json" });
  headers.set("Authorization", `Bearer ${await accessToken()}`);

  let response: Response;
  try {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000);
    response = await fetch(new URL(path, `${publicConfig.apiBaseUrl}/`), {
      method: options.method,
      headers,
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request was cancelled. Try again when ready.", null);
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("The ordering service took too long to respond. Try again.", null);
    }
    throw new ApiError(
      "The ordering service could not be reached. Check your connection and try again.",
      null,
    );
  }

  if (!response.ok) {
    throw new ApiError(messageForStatus(response.status), response.status);
  }
  if (response.status !== 204) {
    throw new ApiError("The ordering service returned an unexpected response.", response.status);
  }
}

export type Restaurant = components["schemas"]["RestaurantRead"];
export type MenuItem = components["schemas"]["MenuItemRead"];
export type MenuItemCreate = components["schemas"]["MenuItemCreate"];
export type MenuItemUpdate = components["schemas"]["MenuItemUpdate"];
export type Order = components["schemas"]["OrderRead"];
export type ManagerOrder = components["schemas"]["ManagerIncomingOrderRead"];
export type ManagerRestaurant = components["schemas"]["RestaurantManagerRead"];
export type ManagerOrderStatusUpdate =
  components["schemas"]["RestaurantOrderStatusUpdate"];

export function listRestaurants(signal?: AbortSignal): Promise<Restaurant[]> {
  return request(
    "/restaurants",
    validateRestaurantReadArray,
    signal ? { signal } : {},
  );
}

export function listRestaurantMenu(
  restaurantId: number,
  signal?: AbortSignal,
): Promise<MenuItem[]> {
  return request(`/restaurants/${restaurantId}/menu`, validateMenuItemReadArray, {
    ...(signal ? { signal } : {}),
  });
}

export function placeOrder(
  payload: components["schemas"]["OrderCreate"],
  idempotencyKey: string,
): Promise<Order> {
  return request("/orders", validateOrderRead, {
    method: "POST",
    body: payload,
    authenticated: true,
    idempotencyKey,
  });
}

export function getOrderHistory(signal?: AbortSignal): Promise<Order[]> {
  return request("/orders/me", validateOrderReadArray, {
    authenticated: true,
    ...(signal ? { signal } : {}),
  });
}

export function listManagerRestaurants(
  signal?: AbortSignal,
): Promise<ManagerRestaurant[]> {
  return request(
    "/manager/restaurants",
    validateRestaurantManagerReadArray,
    { authenticated: true, ...(signal ? { signal } : {}) },
  );
}

export function getManagerMenu(
  restaurantId: number,
  signal?: AbortSignal,
): Promise<MenuItem[]> {
  return request(
    `/manager/restaurants/${restaurantId}/menu`,
    validateMenuItemReadArray,
    { authenticated: true, ...(signal ? { signal } : {}) },
  );
}

export function createMenuItem(
  restaurantId: number,
  payload: MenuItemCreate,
): Promise<MenuItem> {
  return request(`/manager/restaurants/${restaurantId}/menu`, validateMenuItemRead, {
    method: "POST",
    body: payload,
    authenticated: true,
  });
}

export function updateMenuItem(
  restaurantId: number,
  itemId: number,
  payload: MenuItemUpdate,
): Promise<MenuItem> {
  return request(
    `/manager/restaurants/${restaurantId}/menu/${itemId}`,
    validateMenuItemRead,
    { method: "PATCH", body: payload, authenticated: true },
  );
}

export function deleteMenuItem(
  restaurantId: number,
  itemId: number,
): Promise<void> {
  return requestNoContent(
    `/manager/restaurants/${restaurantId}/menu/${itemId}`,
    { method: "DELETE", authenticated: true },
  );
}

export function getManagerOrders(
  restaurantId: number,
  signal?: AbortSignal,
): Promise<ManagerOrder[]> {
  return request(
    `/manager/restaurants/${restaurantId}/orders?limit=100&offset=0`,
    validateManagerIncomingOrderReadArray,
    { authenticated: true, ...(signal ? { signal } : {}) },
  );
}

export function updateManagerOrderStatus(
  restaurantId: number,
  orderId: number,
  payload: ManagerOrderStatusUpdate,
): Promise<ManagerOrder> {
  return request(
    `/manager/restaurants/${restaurantId}/orders/${orderId}`,
    validateManagerIncomingOrderRead,
    { method: "PATCH", body: payload, authenticated: true },
  );
}
