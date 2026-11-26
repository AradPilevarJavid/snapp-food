// reason: the identity provider returns a browser authorization code here.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserManager } from "@/lib/auth/oidc-client";
import { withBasePath } from "@/lib/base-path";
import { publicConfig } from "@/lib/public-config";

export function AuthCallback() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const manager = getUserManager();
    if (!manager) return;

    const callbackUrl = window.location.href;
    window.history.replaceState(null, "", withBasePath("/auth/callback/"));
    void manager
      .signinCallback(callbackUrl)
      .then((user) => {
        if (!user || user.expired === true) {
          setError("The sign-in response could not be confirmed. Please try again.");
          return;
        }
        router.replace("/account");
      })
      .catch(() => {
        setError("Sign-in could not be completed. Please return and try again.");
      });
  }, [router]);

  const displayError =
    error ??
    (!publicConfig.oidcAuthority
      ? "Sign-in is not configured for this site."
      : null);

  return (
    <main className="content-page" id="main-content">
      <p className="eyebrow">Secure account access</p>
      <h1 className="page-title">Finishing sign-in</h1>
      {displayError ? (
        <div className="error-panel" role="alert">
          <p>{displayError}</p>
          <Link className="text-link" href="/account">
            Return to account
          </Link>
        </div>
      ) : (
        <p className="notice-text" role="status">
          Your sign-in is being verified. This may take a moment.
        </p>
      )}
    </main>
  );
}
