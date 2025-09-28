# Environment Variable Setup Guide

Lab Cafe Hub relies on a small set of environment variables to connect to Postgres, drive Auth.js, and customise currency/locale behaviour. This guide walks you through creating and maintaining the `.env` file.

## 1. `.env` fundamentals

- `.env.example` ships with safe defaults for local Docker work.
- Create your copy once per environment:
  ```bash
  cp .env.example .env
  ```
- Everything is key=value. Avoid surrounding quotes unless the value truly contains spaces (only `EMAIL_FROM` does by default).

## 2. Core variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT` | Canonical Postgres connection pieces. | Compose uses these for both the web and `db` services. Keep them unquoted. |
| `DATABASE_URL` | Prisma connection string. | Already templated to expand the `POSTGRES_*` values. Leave as-is unless you connect to an external database. |
| `NEXTAUTH_URL` | Base URL for the deployed app. | `http://localhost:3000` in dev. |
| `NEXTAUTH_SECRET` | 32+ char random secret for Auth.js. | Generate with `openssl rand -base64 32`. Required in production. |
| `GITHUB_ID`, `GITHUB_SECRET` | GitHub OAuth app credentials. | Same values across dev/prod if you use the same OAuth app. |
| `ALLOWLIST_DOMAINS` | Comma-separated list of emails or domains. | e.g., `example.edu,cloudlab.org`. `AllowlistEntry` rows override/augment these. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Outgoing email configuration for notifications. | Optional today; hook up when notification agent ships. |
| `APP_CURRENCY`, `APP_LOCALE` | Display + formatting defaults. | Values like `KRW` / `ko-KR`. |
| `LOW_STOCK_THRESHOLD_DEFAULT` | Initial threshold when creating new items. | Integer string (minor units). |

## 3. Generating secrets

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
```

Store real secrets in a secure vault and share with the team through encrypted channels only.

## 4. Local Docker quick start

1. Copy the template to `.env` and leave the defaults in place.
2. Add your GitHub OAuth credentials and a random `NEXTAUTH_SECRET`.
3. Optionally add your email domain to `ALLOWLIST_DOMAINS` so everyone can sign in immediately.
4. Start the stack (`docker compose up -d db`) and run migrations (`docker compose run --rm web npx prisma db push`).

## 5. Verifying values

- `cat .env` to inspect the file.
- `docker compose config` shows what Compose will inject.
- `node -e 'console.log(process.env.DATABASE_URL)'` after running `dotenv`/`npm run dev` confirms interpolation worked.

If you see `Authentication failed` errors from Prisma inside Docker, double-check that you removed any surrounding quotes and restart the database volume (`docker compose down --volumes`).

## 6. Multiple environments

- `.env` – default for development/local Docker.
- `.env.local` – personal overrides ignored by git.
- `.env.production` – production-only values for self-hosting (load with `dotenv-flow` or Compose overrides).
- Hosting providers (Vercel, Fly.io, etc.) usually want you to configure secrets through their dashboard instead of checking in files.

## 7. Client-safe variables

Prefix any value that must reach the browser with `NEXT_PUBLIC_`. The current app keeps everything server-side, so you should not expose new secrets without reviewing the security model.

## 8. Keeping the template accurate

Whenever you add or remove an env var in code:
1. Update `.env.example`.
2. Document the change in this file and the README “Configuration” section.
3. Add or adjust validation in `src/lib/env.ts` so missing values are caught at boot.

A consistent `.env` workflow saves hours of debugging—treat it as part of your codebase.
