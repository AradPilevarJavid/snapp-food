"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

export function SignInButton({ label = "Sign in" }: { label?: string }) {
  const { status, error, signIn, clearError } = useAuth();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSignIn() {
    clearError();
    setActionError(null);
    setPending(true);
    try {
      await signIn();
    } catch {
      setActionError("Could not open secure sign-in. Please try again.");
      setPending(false);
    }
  }

  if (status === "signed-in") {
    return <span className="auth-status">Signed in</span>;
  }

  return (
    <div className="auth-control">
      <button
        className="button button-primary"
        type="button"
        onClick={() => {
          void handleSignIn();
        }}
        disabled={
          pending || status === "loading" || status === "unconfigured"
        }
      >
        {pending ? "Opening secure sign-in…" : label}
      </button>
      {status === "unconfigured" && (
        <p className="notice-text" role="status">
          Sign-in is not configured for this deployment.
        </p>
      )}
      {(error || actionError) && (
        <p className="error-text" role="alert">
          {error ?? actionError}
        </p>
      )}
    </div>
  );
}
