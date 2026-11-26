export function resolveBasePath(raw: string): string {
  if (raw === "" || raw === "/") return "";
  if (!raw.startsWith("/") || raw.endsWith("/") || raw.includes("//")) {
    throw new Error(
      'The base path must be empty, "/" or a path that starts with "/" and has no trailing slash, for example "/snap-food"',
    );
  }
  return raw;
}

export const basePath = resolveBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? "");

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`Expected a path starting with "/", received "${path}"`);
  }
  return `${basePath}${path}`;
}
