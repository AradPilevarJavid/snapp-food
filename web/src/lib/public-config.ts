import { z } from "zod";

const optionalValue = (schema: z.ZodType<string>) =>
  z.preprocess(
    (value: unknown) =>
      typeof value === "string" && value.trim() !== "" ? value : undefined,
    schema.optional(),
  );

const PublicConfigSchema = z
  .object({
    apiBaseUrl: optionalValue(z.url()),
    oidcAuthority: optionalValue(z.url()),
    oidcClientId: optionalValue(z.string().min(1)),
    oidcResource: optionalValue(z.string().min(1)),
    currency: optionalValue(z.string().regex(/^[A-Z]{3}$/)),
  })
  .superRefine((config, context) => {
    if (Boolean(config.oidcAuthority) !== Boolean(config.oidcClientId)) {
      context.addIssue({
        code: "custom",
        message: "OIDC authority and client ID must be configured together",
      });
    }

    if (config.currency) {
      try {
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: config.currency,
        });
      } catch {
        context.addIssue({
          code: "custom",
          message: "Currency must be a supported three-letter currency code",
          path: ["currency"],
        });
      }
    }

    for (const [name, value] of [
      ["API base URL", config.apiBaseUrl],
      ["OIDC authority", config.oidcAuthority],
    ] as const) {
      if (!value) continue;

      const parsed = new URL(value);
      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        context.addIssue({
          code: "custom",
          message: `${name} cannot include credentials, a query, or a fragment`,
        });
      }
      if (name === "API base URL" && parsed.pathname !== "/") {
        context.addIssue({
          code: "custom",
          message: "API base URL must be an origin without a path",
          path: ["apiBaseUrl"],
        });
      }
      if (
        parsed.protocol !== "https:" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1"
      ) {
        context.addIssue({
          code: "custom",
          message: `${name} must use HTTPS outside localhost`,
        });
      }
    }
  });

export const publicConfig = PublicConfigSchema.parse({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  oidcAuthority: process.env.NEXT_PUBLIC_OIDC_AUTHORITY,
  oidcClientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID,
  oidcResource: process.env.NEXT_PUBLIC_OIDC_RESOURCE,
  currency: process.env.NEXT_PUBLIC_CURRENCY,
});
