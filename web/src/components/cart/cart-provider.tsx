"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

const STORAGE_KEY = "snapfood-cart-v2";
const CartItemSchema = z
  .object({
    restaurantId: z.number().int().positive(),
    menuItemId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(50),
  })
  .strict();
const CartSchema = z
  .array(CartItemSchema)
  .max(100)
  .superRefine((items, context) => {
    const seen = new Set<number>();
    items.forEach((item, index) => {
      if (seen.has(item.menuItemId)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate menu item",
          path: [index, "menuItemId"],
        });
      }
      seen.add(item.menuItemId);
    });
  });
const StoredCartSchema = z
  .object({
    items: CartSchema,
    idempotencyKey: z.uuid().nullable(),
  })
  .strict();

export type CartItem = z.infer<typeof CartItemSchema>;

type CartContextValue = {
  items: CartItem[];
  isReady: boolean;
  storageError: string | null;
  itemCount: number;
  checkoutPending: boolean;
  idempotencyKey: string | null;
  ensureIdempotencyKey: () => string | null;
  setCheckoutPending: (pending: boolean) => void;
  addItem: (restaurantId: number, menuItemId: number) => void;
  setQuantity: (menuItemId: number, quantity: number) => void;
  removeItem: (menuItemId: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const raw: unknown = JSON.parse(stored);
          const parsed = StoredCartSchema.safeParse(raw);
          if (parsed.success) {
            if (active) {
              setItems(parsed.data.items);
              setIdempotencyKey(parsed.data.idempotencyKey);
            }
          } else if (active) {
            setStorageError("Your saved cart could not be read. A new cart is ready.");
          }
        }
      } catch {
        if (active) setStorageError("Your cart could not be saved in this browser.");
      } finally {
        if (active) setIsReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ items, idempotencyKey }),
      );
    } catch {
      void Promise.resolve().then(() => {
        setStorageError("Your cart could not be saved in this browser.");
      });
    }
  }, [idempotencyKey, isReady, items]);

  const ensureIdempotencyKey = useCallback(() => {
    if (idempotencyKey) return idempotencyKey;

    try {
      const key = window.crypto.randomUUID();
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ items, idempotencyKey: key }),
      );
      setIdempotencyKey(key);
      setStorageError(null);
      return key;
    } catch {
      setStorageError(
        "Allow browser storage to safely retry this order if the connection is interrupted.",
      );
      return null;
    }
  }, [idempotencyKey, items]);

  const addItem = useCallback((restaurantId: number, menuItemId: number) => {
    if (checkoutPending) return;
    const existing = items.find((item) => item.menuItemId === menuItemId);
    if (existing?.quantity === 50 || (!existing && items.length >= 100)) return;
    setIdempotencyKey(null);
    setItems((current) => {
      const currentItem = current.find((item) => item.menuItemId === menuItemId);
      if (currentItem) {
        return current.map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: Math.min(item.quantity + 1, 50) }
            : item,
        );
      }
      return [...current, { restaurantId, menuItemId, quantity: 1 }];
    });
  }, [checkoutPending, items]);

  const setQuantity = useCallback((menuItemId: number, quantity: number) => {
    if (checkoutPending || !Number.isInteger(quantity) || quantity < 1) return;
    const existing = items.find((item) => item.menuItemId === menuItemId);
    if (!existing || existing.quantity === Math.min(quantity, 50)) return;
    setIdempotencyKey(null);
    setItems((current) =>
      current.map((item) =>
        item.menuItemId === menuItemId
          ? { ...item, quantity: Math.min(quantity, 50) }
          : item,
      ),
    );
  }, [checkoutPending, items]);

  const removeItem = useCallback((menuItemId: number) => {
    if (checkoutPending) return;
    if (!items.some((item) => item.menuItemId === menuItemId)) return;
    setIdempotencyKey(null);
    setItems((current) =>
      current.filter((item) => item.menuItemId !== menuItemId),
    );
  }, [checkoutPending, items]);

  const clearCart = useCallback(() => {
    setItems([]);
    setIdempotencyKey(null);
  }, []);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isReady,
        storageError,
        itemCount,
        checkoutPending,
        idempotencyKey,
        ensureIdempotencyKey,
        setCheckoutPending,
        addItem,
        setQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
