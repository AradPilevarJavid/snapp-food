"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInButton } from "@/components/auth/sign-in-button";

export function AccountPanel() {
  const { status, error, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setActionError(null);
    queryClient.clear();

    try {
      await signOut();
    } catch {
      setPending(false);
      setActionError("Sign-out could not be completed. Please try again.");
    }
  }

  if (status === "signed-in") {
    return (
      <div className="account-panel">
        <p className="notice-text" role="status">
          You are signed in. Your order history is available from your account.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/orders">
            View your orders
          </Link>
          <button
            className="button button-outline"
            type="button"
            disabled={pending}
            onClick={() => {
              void handleSignOut();
            }}
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {(error || actionError) && (
          <p className="error-text" role="alert">
            {error ?? actionError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="account-panel">
      {status === "loading" ? (
        <p className="notice-text" role="status">
          Checking sign-in status…
        </p>
      ) : (
        <>
          <p>
            Sign in with the secure account provider to place orders and review
            your order history.
          </p>
          <SignInButton label="Continue to sign in" />
        </>
      )}
    </div>
  );
}
