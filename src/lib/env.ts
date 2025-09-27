import { z } from "zod";

export const DEV_SECRET_FALLBACK = "dev-secret-32-character-placeholder!!";

const DEFAULT_POSTGRES = {
  USER: "postgres",
  PASSWORD: "postgres",
  DB: "lab_cafe",
  HOST: "db",
  PORT: "5432",
} as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string(),
    POSTGRES_USER: z.string().default(DEFAULT_POSTGRES.USER),
    POSTGRES_PASSWORD: z.string().default(DEFAULT_POSTGRES.PASSWORD),
    POSTGRES_DB: z.string().default(DEFAULT_POSTGRES.DB),
    POSTGRES_HOST: z.string().default(DEFAULT_POSTGRES.HOST),
    POSTGRES_PORT: z.string().default(DEFAULT_POSTGRES.PORT),
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

const interpolateEnv = (value: string | undefined, replacements: Record<string, string>) => {
  if (!value) {
    return value;
  }

  return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
    if (key in replacements) {
      return replacements[key];
    }

    const fallback = process.env[key];
    return fallback ?? "";
  });
};

const resolvedPostgres = {
  POSTGRES_USER: process.env.POSTGRES_USER ?? DEFAULT_POSTGRES.USER,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? DEFAULT_POSTGRES.PASSWORD,
  POSTGRES_DB: process.env.POSTGRES_DB ?? DEFAULT_POSTGRES.DB,
  POSTGRES_HOST: process.env.POSTGRES_HOST ?? DEFAULT_POSTGRES.HOST,
  POSTGRES_PORT: process.env.POSTGRES_PORT ?? DEFAULT_POSTGRES.PORT,
};

const resolvedDatabaseUrl =
  interpolateEnv(process.env.DATABASE_URL, resolvedPostgres) ??
  `postgresql://${resolvedPostgres.POSTGRES_USER}:${resolvedPostgres.POSTGRES_PASSWORD}@${resolvedPostgres.POSTGRES_HOST}:${resolvedPostgres.POSTGRES_PORT}/${resolvedPostgres.POSTGRES_DB}`;

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: resolvedDatabaseUrl,
  POSTGRES_USER: resolvedPostgres.POSTGRES_USER,
  POSTGRES_PASSWORD: resolvedPostgres.POSTGRES_PASSWORD,
  POSTGRES_DB: resolvedPostgres.POSTGRES_DB,
  POSTGRES_HOST: resolvedPostgres.POSTGRES_HOST,
  POSTGRES_PORT: resolvedPostgres.POSTGRES_PORT,
  NEXTAUTH_SECRET:
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
      ? DEV_SECRET_FALLBACK
      : undefined),
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
