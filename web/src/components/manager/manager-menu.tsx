"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createMenuItem,
  deleteMenuItem,
  getApiErrorMessage,
  updateMenuItem,
  type ManagerRestaurant,
  type MenuItem,
  type MenuItemCreate,
} from "@/api/client";
import { managerKeys, managerQueries, restaurantQueries } from "@/api/queries";
import { MenuItemForm } from "@/components/manager/menu-item-form";
import { formatMoney } from "@/lib/format-money";

export function ManagerMenu({ restaurant }: { restaurant: ManagerRestaurant }) {
  const queryClient = useQueryClient();
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const menuQuery = useQuery(managerQueries.menu(restaurant.id));

  async function refreshMenuData() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: managerKeys.menu(restaurant.id),
      }),
      queryClient.invalidateQueries({
        queryKey: restaurantQueries.menu(restaurant.id).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: restaurantQueries.all().queryKey,
      }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: number | null;
      payload: MenuItemCreate;
    }) =>
      itemId === null
        ? createMenuItem(restaurant.id, payload)
        : updateMenuItem(restaurant.id, itemId, payload),
    onSuccess: refreshMenuData,
  });
  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteMenuItem(restaurant.id, itemId),
    onSuccess: async () => {
      setConfirmingDeleteId(null);
      await refreshMenuData();
    },
  });

  function saveItem(itemId: number | null) {
    return async (payload: MenuItemCreate) => {
      await saveMutation.mutateAsync({ itemId, payload });
    };
  }

  function renderMenuItem(item: MenuItem) {
    const confirmingDelete = confirmingDeleteId === item.id;

    return (
      <li className="manager-menu-item" key={item.id}>
        <details>
          <summary>
            <span>{item.name}</span>
            <span className="manager-menu-meta">
              {formatMoney(item.price)} ·{" "}
              {item.is_available ? "Available" : "Unavailable"}
            </span>
          </summary>
          <MenuItemForm
            item={item}
            idPrefix={String(item.id)}
            submitLabel="Save changes"
            successMessage="Menu item saved."
            disabled={saveMutation.isPending || deleteMutation.isPending}
            onSave={saveItem(item.id)}
          />
          {confirmingDelete ? (
            <div className="manager-delete-confirmation">
              <p>Remove {item.name} from this restaurant’s menu?</p>
              <button
                className="button button-outline"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(item.id)}
              >
                {deleteMutation.isPending ? "Removing item…" : "Remove item"}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => setConfirmingDeleteId(null)}
              >
                Keep item
              </button>
            </div>
          ) : (
            <button
              className="text-button"
              type="button"
              disabled={saveMutation.isPending || deleteMutation.isPending}
              onClick={() => setConfirmingDeleteId(item.id)}
            >
              Remove menu item
            </button>
          )}
        </details>
      </li>
    );
  }

  return (
    <section
      className="manager-panel"
      aria-labelledby={`manager-menu-${restaurant.id}`}
    >
      <div className="manager-section-heading">
        <div>
          <p className="eyebrow">Menu management</p>
          <h2 className="section-title" id={`manager-menu-${restaurant.id}`}>
            Your menu
          </h2>
        </div>
      </div>
      <div className="manager-create-panel">
        <h3>Add a menu item</h3>
        <MenuItemForm
          idPrefix="new"
          submitLabel="Add item"
          successMessage="Menu item added."
          disabled={saveMutation.isPending || deleteMutation.isPending}
          onSave={saveItem(null)}
        />
      </div>
      {deleteMutation.isError && (
        <p className="error-text" role="alert">
          {getApiErrorMessage(deleteMutation.error)}
        </p>
      )}
      {menuQuery.isPending ? (
        <p className="notice-text" role="status">
          Loading your menu…
        </p>
      ) : menuQuery.isError ? (
        <div className="error-panel" role="alert">
          <p>{getApiErrorMessage(menuQuery.error)}</p>
          <button
            className="button button-outline"
            type="button"
            onClick={() => void menuQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : menuQuery.data.length === 0 ? (
        <div className="empty-panel">
          <h3>Your menu is ready to grow.</h3>
          <p>Add your first pickup item above.</p>
        </div>
      ) : (
        <ul className="manager-menu-list">{menuQuery.data.map(renderMenuItem)}</ul>
      )}
    </section>
  );
}
