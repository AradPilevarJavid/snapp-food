"use client";

import {
  InMemoryWebStorage,
  UserManager,
  WebStorageStateStore,
} from "oidc-client-ts";
import { withBasePath } from "@/lib/base-path";
import { publicConfig } from "@/lib/public-config";

let userManager: UserManager | null = null;

export function getUserManager(): UserManager | null {
  if (!publicConfig.oidcAuthority || !publicConfig.oidcClientId) return null;
  if (typeof window === "undefined") return null;
  if (userManager) return userManager;

  userManager = new UserManager({
    authority: publicConfig.oidcAuthority,
    client_id: publicConfig.oidcClientId,
    redirect_uri: new URL(
      withBasePath("/auth/callback/"),
      window.location.origin,
    ).href,
    post_logout_redirect_uri: new URL(
      withBasePath("/"),
      window.location.origin,
    ).href,
    response_type: "code",
    scope: "openid profile email",
    automaticSilentRenew: false,
    monitorSession: false,
    userStore: new WebStorageStateStore({
      store: new InMemoryWebStorage(),
    }),
    stateStore: new WebStorageStateStore({
      store: window.sessionStorage,
    }),
    ...(publicConfig.oidcResource
      ? { resource: publicConfig.oidcResource }
      : {}),
  });

  return userManager;
}
