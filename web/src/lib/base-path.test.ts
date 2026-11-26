import { afterEach, describe, expect, it, vi } from "vitest";

async function loadBasePath(rawBasePath: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", rawBasePath);
  return import("./base-path");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("site base path", () => {
  it("serves from the domain root when no base path is configured", async () => {
    const { basePath, withBasePath } = await loadBasePath("");

    expect(basePath).toBe("");
    expect(withBasePath("/auth/callback/")).toBe("/auth/callback/");
  });

  it("prefixes application paths with the configured base path", async () => {
    const { basePath, withBasePath } = await loadBasePath("/snap-food");

    expect(basePath).toBe("/snap-food");
    expect(withBasePath("/auth/callback/")).toBe("/snap-food/auth/callback/");
  });

  it("treats '/' as the domain root", async () => {
    const { basePath } = await loadBasePath("/");

    expect(basePath).toBe("");
  });

  it("rejects base paths that would break the static export", async () => {
    for (const rawBasePath of ["snap-food", "/snap-food/", "/snap//food"]) {
      await expect(loadBasePath(rawBasePath)).rejects.toThrow(/base path/);
    }
  });

  it("rejects paths without the leading slash", async () => {
    const { withBasePath } = await loadBasePath("");

    expect(() => withBasePath("account")).toThrow(/starting with/);
  });
});
