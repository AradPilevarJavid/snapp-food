// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CartProvider, useCart } from "./cart-provider";

const STORAGE_KEY = "snapfood-cart-v2";

function CartControls() {
  const {
    addItem,
    ensureIdempotencyKey,
    idempotencyKey,
    isReady,
    itemCount,
    storageError,
  } = useCart();
  return (
    <>
      <output aria-label="Cart item count">{itemCount}</output>
      <output aria-label="Order retry key">{idempotencyKey ?? "none"}</output>
      <button
        type="button"
        disabled={!isReady}
        onClick={() => addItem(1, 7)}
      >
        Add soup to cart
      </button>
      <button
        type="button"
        disabled={!isReady}
        onClick={() => ensureIdempotencyKey()}
      >
        Prepare order retry
      </button>
      {storageError && <p role="alert">{storageError}</p>}
    </>
  );
}

function renderCart() {
  return render(
    <CartProvider>
      <CartControls />
    </CartProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("CartProvider", () => {
  it("persists menu identifiers and quantities, then restores them", async () => {
    renderCart();
    const addButton = await screen.findByRole("button", {
      name: "Add soup to cart",
    });

    await waitFor(() => expect(addButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton);

    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        '{"items":[{"restaurantId":1,"menuItemId":7,"quantity":1}],"idempotencyKey":null}',
      ),
    );
    cleanup();

    renderCart();
    await waitFor(() =>
      expect(screen.getByLabelText("Cart item count").textContent).toBe("1"),
    );
  });

  it("reports a saved cart that fails runtime validation", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      '{"items":[{"restaurantId":1,"menuItemId":7,"quantity":51}],"idempotencyKey":null}',
    );

    renderCart();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your saved cart could not be read");
  });

  it("persists one retry key and rotates it when the cart changes", async () => {
    renderCart();
    const addButton = await screen.findByRole("button", {
      name: "Add soup to cart",
    });
    const prepareButton = screen.getByRole("button", {
      name: "Prepare order retry",
    });

    await waitFor(() => expect(addButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton);
    fireEvent.click(prepareButton);

    await waitFor(() => {
      expect(screen.getByLabelText("Order retry key").textContent).toMatch(
        /^[0-9a-f-]{36}$/,
      );
    });
    const storedCart = window.localStorage.getItem(STORAGE_KEY);
    expect(storedCart).toContain('"quantity":1');
    expect(storedCart).toContain(
      `"idempotencyKey":"${screen.getByLabelText("Order retry key").textContent}"`,
    );

    fireEvent.click(addButton);
    await waitFor(() =>
      expect(screen.getByLabelText("Order retry key").textContent).toBe("none"),
    );
  });
});
