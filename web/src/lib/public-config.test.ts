import { afterEach, describe, expect, it, vi } from "vitest";

const publicEnvironmentKeys = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_OIDC_AUTHORITY",
  "NEXT_PUBLIC_OIDC_CLIENT_ID",
  "NEXT_PUBLIC_OIDC_RESOURCE",
  "NEXT_PUBLIC_CURRENCY",
] as const;

function setPublicEnvironment(values: Partial<Record<(typeof publicEnvironmentKeys)[number], string>>) {
  for (const key of publicEnvironmentKeys) {
    vi.stubEnv(key, values[key] ?? "");
  }
}

async function loadPublicConfig() {
  vi.resetModules();
  return import("./public-config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("public build configuration", () => {
  it("accepts an HTTPS API origin without a path", async () => {
    setPublicEnvironment({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
    });

    const { publicConfig } = await loadPublicConfig();

    expect(publicConfig.apiBaseUrl).toBe("https://api.example.test");
  });

  it("rejects credentials embedded in public service URLs", async () => {
    setPublicEnvironment({
      NEXT_PUBLIC_API_BASE_URL: "https://user:password@api.example.test",
    });

    await expect(loadPublicConfig()).rejects.toThrow(
      /API base URL cannot include credentials/,
    );
  });

  it("rejects API base URLs with a path", async () => {
    setPublicEnvironment({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test/v1",
    });

    await expect(loadPublicConfig()).rejects.toThrow(
      /API base URL must be an origin without a path/,
    );
  });

  it("rejects OIDC URLs with a query or fragment", async () => {
    setPublicEnvironment({
      NEXT_PUBLIC_OIDC_AUTHORITY: "https://identity.example.test?tenant=1",
      NEXT_PUBLIC_OIDC_CLIENT_ID: "snapfood-web",
    });

    await expect(loadPublicConfig()).rejects.toThrow(
      /OIDC authority cannot include credentials, a query, or a fragment/,
    );
  });
});
