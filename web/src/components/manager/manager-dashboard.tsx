"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { ApiError, getApiErrorMessage } from "@/api/client";
import { managerQueries } from "@/api/queries";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInButton } from "@/components/auth/sign-in-button";
import { ManagerMenu } from "@/components/manager/manager-menu";
import { ManagerOrders } from "@/components/manager/manager-orders";

const restaurantIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

export function ManagerDashboard() {
  const { status, error: authError } = useAuth();
  const search = useSearchParams();
  const restaurantsQuery = useQuery({
    ...managerQueries.restaurants(),
    enabled: status === "signed-in",
  });
  const selectedRaw = search.get("restaurant");
  const selectedResult = selectedRaw
    ? restaurantIdSchema.safeParse(selectedRaw)
    : null;

  if (status === "loading") {
    return (
      <p className="notice-text" role="status">
        Checking manager sign-in…
      </p>
    );
  }

  if (status !== "signed-in") {
    return (
      <div className={status === "error" ? "error-panel" : "empty-panel"}>
        <h2>Sign in with an approved restaurant account.</h2>
        <p>
          Menu and pickup-order access is limited to managers approved by
          Snapfood.
        </p>
        {authError && <p role="alert">{authError}</p>}
        <SignInButton label="Restaurant sign in" />
      </div>
    );
  }

  if (restaurantsQuery.isPending) {
    return (
      <p className="notice-text" role="status">
        Loading your restaurant access…
      </p>
    );
  }

  if (restaurantsQuery.isError) {
    const message =
      restaurantsQuery.error instanceof ApiError &&
      restaurantsQuery.error.status === 403
        ? "This account does not have approved manager access. Contact Snapfood if you need access."
        : getApiErrorMessage(restaurantsQuery.error);

    return (
      <div className="error-panel" role="alert">
        <p>{message}</p>
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
        <h2>Your manager access is awaiting a restaurant assignment.</h2>
        <p>Contact Snapfood to finish setting up your restaurant.</p>
      </div>
    );
  }

  if (selectedRaw && !selectedResult?.success) {
    return (
      <div className="error-panel" role="alert">
        <p>That restaurant selection is not valid.</p>
        <Link className="text-link" href="/manager">
          Return to your restaurants
        </Link>
      </div>
    );
  }

  const selectedId =
    selectedResult?.success === true ? selectedResult.data : null;
  const selectedRestaurant = selectedId
    ? restaurantsQuery.data.find((restaurant) => restaurant.id === selectedId)
    : restaurantsQuery.data[0];

  if (!selectedRestaurant) {
    return (
      <div className="error-panel" role="alert">
        <p>This restaurant is not assigned to your account.</p>
        <Link className="text-link" href="/manager">
          Return to your restaurants
        </Link>
      </div>
    );
  }

  return (
    <div className="manager-dashboard">
      {restaurantsQuery.data.length > 1 && (
        <form className="manager-restaurant-picker" action="/manager" method="get">
          <label htmlFor="manager-restaurant">
            Choose a restaurant
            <select
              id="manager-restaurant"
              name="restaurant"
              defaultValue={selectedRestaurant.id}
            >
              {restaurantsQuery.data.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-outline" type="submit">
            View restaurant
          </button>
        </form>
      )}
      <ManagerMenu restaurant={selectedRestaurant} />
      <ManagerOrders restaurantId={selectedRestaurant.id} />
    </div>
  );
}
