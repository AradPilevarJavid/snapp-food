import type { NextConfig } from "next";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBasePath === "/" ? "" : rawBasePath;

if (
  basePath !== "" &&
  (!basePath.startsWith("/") || basePath.endsWith("/") || basePath.includes("//"))
) {
  throw new Error(
    'NEXT_PUBLIC_BASE_PATH must be empty, "/" or a path that starts with "/" and has no trailing slash, for example "/snap-food"',
  );
}

const nextConfig: NextConfig = {
  basePath,
  output: "export",
  trailingSlash: true,
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
