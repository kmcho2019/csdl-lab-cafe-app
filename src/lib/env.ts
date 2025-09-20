import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/lab_cafe"),
    NEXTAUTH_SECRET: z.string().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    GITHUB_ID: z.string().optional(),
    GITHUB_SECRET: z.string().optional(),
    ALLOWLIST_DOMAINS: z.string().optional(),
    APP_CURRENCY: z
      .string()
      .default("USD")
      .transform((currency) => currency.toUpperCase()),
    APP_LOCALE: z.string().default("en-US"),
  })
  .superRefine((env, ctx) => {
    if (!env.NEXTAUTH_SECRET && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        message: "NEXTAUTH_SECRET is required in production",
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV === "development" ? "insecure-development-secret" : undefined),
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  GITHUB_ID: process.env.GITHUB_ID,
  GITHUB_SECRET: process.env.GITHUB_SECRET,
  ALLOWLIST_DOMAINS: process.env.ALLOWLIST_DOMAINS,
  APP_CURRENCY: process.env.APP_CURRENCY,
  APP_LOCALE: process.env.APP_LOCALE ?? "en-US",
});

export const allowlistedDomains = env.ALLOWLIST_DOMAINS
  ? env.ALLOWLIST_DOMAINS.split(",").map((domain) => domain.trim()).filter(Boolean)
  : [];
