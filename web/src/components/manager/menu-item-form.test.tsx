// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { MenuItemForm } from "./menu-item-form";

afterEach(cleanup);

function renderMenuItemForm(onSave = vi.fn(async () => {})) {
  const result = render(
    <MenuItemForm
      idPrefix="new"
      submitLabel="Add item"
      successMessage="Menu item added."
      disabled={false}
      onSave={onSave}
    />,
  );
  return { ...result, onSave };
}

describe("MenuItemForm", () => {
  it("uses accessible labels and passes validated values to the save handler", async () => {
    const user = userEvent.setup();
    const { container, onSave } = renderMenuItemForm();

    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Soup");
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Daily vegetable soup.",
    );
    await user.type(screen.getByRole("textbox", { name: "Price" }), "4.50");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "Soup",
      description: "Daily vegetable soup.",
      price: "4.50",
      is_available: true,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Menu item added.",
    );
    // jsdom cannot measure layout-dependent color contrast; verify it in the browser.
    const accessibilityResults = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(accessibilityResults.violations).toEqual([]);
  });

  it("focuses and describes an invalid price", async () => {
    const user = userEvent.setup();
    renderMenuItemForm();

    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Soup");
    await user.type(screen.getByRole("textbox", { name: "Price" }), "4.555");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const priceInput = screen.getByRole("textbox", { name: "Price" });
    expect(await screen.findByText("Enter a price with up to two decimal places."))
      .toBeInTheDocument();
    expect(priceInput).toHaveFocus();
    expect(priceInput).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the form values and announces a failed save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {
      throw new Error("The ordering service could not complete your request.");
    });
    renderMenuItemForm(onSave);

    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Soup");
    await user.type(screen.getByRole("textbox", { name: "Price" }), "4.50");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The ordering service could not be reached. Check your connection and try again.",
    );
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Soup");
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("4.50");
  });
});
