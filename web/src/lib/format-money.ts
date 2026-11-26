import { z } from "zod";
import { publicConfig } from "@/lib/public-config";

const DecimalAmountSchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/);

export function formatMoney(amount: string): string {
  const parsed = DecimalAmountSchema.safeParse(amount);
  if (!parsed.success) return "Amount unavailable";

  const locale = new Intl.NumberFormat().resolvedOptions().locale;
  const options = publicConfig.currency
    ? {
        style: "currency" as const,
        currency: publicConfig.currency,
      }
    : {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      };
  return new Intl.NumberFormat(locale, options).format(Number(parsed.data));
}
