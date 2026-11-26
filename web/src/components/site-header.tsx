// reason: navigation labels reflect the current in-memory sign-in state.
"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { useCart } from "@/components/cart/cart-provider";

export function SiteHeader() {
  const { status } = useAuth();
  const { itemCount } = useCart();
  const accountLabel = status === "signed-in" ? "Your account" : "Sign in";
  const cartLabel = itemCount === 1 ? "item" : "items";

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Snapfood home">
        <span className="brand-mark" aria-hidden="true">
          s
        </span>
        <span>snapfood</span>
      </Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/restaurants">Restaurants</Link>
        <Link href="/orders">Your orders</Link>
      </nav>
      <div className="header-actions">
        <Link
          className="cart-link"
          href="/cart"
          aria-label={`Cart, ${itemCount} ${cartLabel}`}
        >
          <span aria-hidden="true">▱</span>
          <span>Cart</span>
          <span className="cart-count" aria-hidden="true">
            {itemCount}
          </span>
        </Link>
        <Link className="sign-in-link" href="/account">
          {accountLabel}
        </Link>
      </div>
    </header>
  );
}
