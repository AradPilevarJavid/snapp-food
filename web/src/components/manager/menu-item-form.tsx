"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import type { MenuItem, MenuItemCreate } from "@/api/client";
import { getApiErrorMessage } from "@/api/client";

const MenuItemInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a menu item name.").max(160),
  description: z.string().max(4000),
  price: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a price with up to two decimal places."),
  is_available: z.boolean(),
});

type FieldName = "name" | "description" | "price";
type FieldErrors = Partial<Record<FieldName, string>>;

type MenuItemFormProps = {
  item?: MenuItem;
  idPrefix: string;
  submitLabel: string;
  successMessage: string;
  disabled: boolean;
  onSave: (item: MenuItemCreate) => Promise<void>;
};

export function MenuItemForm({
  item,
  idPrefix,
  submitLabel,
  successMessage,
  disabled,
  onSave,
}: MenuItemFormProps) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFieldErrors({});
    setSubmitError(null);
    setStatusMessage("");

    const formData = new FormData(form);
    const parsed = MenuItemInputSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      price: formData.get("price"),
      is_available: formData.get("is_available") === "on",
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          (field === "name" || field === "description" || field === "price") &&
          errors[field] === undefined
        ) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      const firstInvalidField = Object.keys(errors)[0];
      if (firstInvalidField) {
        form
          .querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[name="${firstInvalidField}"]`,
          )
          ?.focus();
      }
      return;
    }

    try {
      await onSave(parsed.data);
      form.reset();
      setStatusMessage(successMessage);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  const nameId = `menu-item-${idPrefix}-name`;
  const descriptionId = `menu-item-${idPrefix}-description`;
  const priceId = `menu-item-${idPrefix}-price`;

  return (
    <form className="manager-menu-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="manager-form-field">
        <label htmlFor={nameId}>Item name</label>
        <input
          id={nameId}
          name="name"
          type="text"
          required
          maxLength={160}
          defaultValue={item?.name ?? ""}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
        />
        {fieldErrors.name && (
          <p className="error-text" id={`${nameId}-error`}>
            {fieldErrors.name}
          </p>
        )}
      </div>
      <div className="manager-form-field">
        <label htmlFor={descriptionId}>Description</label>
        <textarea
          id={descriptionId}
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={item?.description ?? ""}
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={
            fieldErrors.description ? `${descriptionId}-error` : undefined
          }
        />
        {fieldErrors.description && (
          <p className="error-text" id={`${descriptionId}-error`}>
            {fieldErrors.description}
          </p>
        )}
      </div>
      <div className="manager-form-field manager-price-field">
        <label htmlFor={priceId}>Price</label>
        <input
          id={priceId}
          name="price"
          type="text"
          inputMode="decimal"
          required
          maxLength={13}
          defaultValue={item?.price ?? ""}
          aria-invalid={Boolean(fieldErrors.price)}
          aria-describedby={
            fieldErrors.price ? `${priceId}-hint ${priceId}-error` : `${priceId}-hint`
          }
        />
        <p className="field-hint" id={`${priceId}-hint`}>
          Use up to two decimal places.
        </p>
        {fieldErrors.price && (
          <p className="error-text" id={`${priceId}-error`}>
            {fieldErrors.price}
          </p>
        )}
      </div>
      <label className="manager-availability">
        <input
          name="is_available"
          type="checkbox"
          defaultChecked={item?.is_available ?? true}
        />
        Available for pickup
      </label>
      <div className="manager-form-actions">
        <button className="button button-primary" type="submit" disabled={disabled}>
          {submitLabel}
        </button>
        <p className="notice-text" role="status">
          {statusMessage}
        </p>
      </div>
      <p className="error-text" role="alert">
        {submitError}
      </p>
    </form>
  );
}
