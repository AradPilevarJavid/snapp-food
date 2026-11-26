"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "oidc-client-ts";
import { getUserManager } from "@/lib/auth/oidc-client";
import { publicConfig } from "@/lib/public-config";

type AuthStatus =
  | "loading"
  | "unconfigured"
  | "signed-out"
  | "signed-in"
  | "error";

type AuthContextValue = {
  status: AuthStatus;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isActiveUser(user: User | null): user is User {
  return user !== null && user.expired !== true && user.access_token.length > 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const configured = Boolean(
    publicConfig.oidcAuthority && publicConfig.oidcClientId,
  );
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "unconfigured",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let removeUserLoaded: (() => void) | undefined;
    let removeUserUnloaded: (() => void) | undefined;
    let removeAccessTokenExpired: (() => void) | undefined;

    try {
      const manager = getUserManager();
      if (!manager) return;

      removeUserLoaded = manager.events.addUserLoaded((user) => {
        if (active) setStatus(isActiveUser(user) ? "signed-in" : "signed-out");
      });
      removeUserUnloaded = manager.events.addUserUnloaded(() => {
        queryClient.clear();
        if (active) setStatus("signed-out");
      });
      removeAccessTokenExpired = manager.events.addAccessTokenExpired(() => {
        queryClient.clear();
        if (!active) return;
        setStatus("signed-out");
        setError("Your sign-in has expired. Sign in again to continue.");
      });

      void manager
        .getUser()
        .then((user) => {
          if (active) setStatus(isActiveUser(user) ? "signed-in" : "signed-out");
        })
        .catch(() => {
          if (!active) return;
          setStatus("error");
          setError("Sign-in status could not be checked. Try signing in again.");
        });
    } catch {
      void Promise.resolve().then(() => {
        if (!active) return;
        setStatus("error");
        setError("Sign-in could not be initialized. Check the browser settings and try again.");
      });
    }

    return () => {
      active = false;
      removeUserLoaded?.();
      removeUserUnloaded?.();
      removeAccessTokenExpired?.();
    };
  }, [queryClient]);

  const signIn = useCallback(async () => {
    const manager = getUserManager();
    if (!manager) {
      setError("Sign-in is not configured for this site yet.");
      return;
    }
    await manager.signinRedirect();
  }, []);

  const signOut = useCallback(async () => {
    queryClient.clear();
    const manager = getUserManager();
    if (!manager) {
      setStatus("unconfigured");
      return;
    }
    await manager.signoutRedirect();
  }, [queryClient]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ status, error, signIn, signOut, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
