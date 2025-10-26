# Hosting & Deployment Playbook

Lab Cafe Hub is a Next.js 15 application backed by PostgreSQL. Deploy it wherever you can run Node.js 22 and reach a Postgres instance. This playbook covers the most common options.

## 1. Requirements

- Node.js 22+ (Vercel provides this automatically)
- PostgreSQL 14 or newer
- GitHub OAuth app (client id + secret)
- Optional SMTP account if you plan to send settlement emails later

## 2. Required Environment Variables

| Variable | Description |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT` | Connection pieces for Postgres. In managed services, set `POSTGRES_HOST` to the external host and keep `DATABASE_URL` in sync. |
| `DATABASE_URL` | Prisma connection string. Leave templated locally; override with the managed database URL in production. |
| `NEXTAUTH_URL` | Public origin of the deployed site (`https://cafe.example.com`). |
| `NEXTAUTH_SECRET` | 32+ char random secret for Auth.js. |
| `GITHUB_ID`, `GITHUB_SECRET` | GitHub OAuth credentials. Ensure the callback URL matches `${NEXTAUTH_URL}/api/auth/callback/github`. |
| `ALLOWLIST_DOMAINS` | Comma-separated initial allowlist (emails or domains). Optional but recommended for bootstrap. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Needed once you enable settlement reminder emails. |
| `APP_CURRENCY`, `APP_LOCALE` | Presentation defaults (e.g., `KRW`, `ko-KR`). |

## 3. Deploying on Vercel

1. Push the repo to GitHub.
2. Create a new Vercel project and select the repository.
3. Configure Environment Variables in Vercel → Settings → Environment Variables (Production + Preview).
4. Provision a Postgres database (Vercel Postgres, Neon, Supabase, etc.) and set `DATABASE_URL` accordingly.
5. Add a [Vercel Postgres migration step](https://vercel.com/docs/storage/sql/prisma#step-4:-configure-prisma) by setting the Install Command to `npm install` and the Build Command to `npm run prisma:generate && npm run build` (Prisma migrations run via cron or manually—see below).
6. Set the GitHub OAuth callback to `${NEXTAUTH_URL}/api/auth/callback/github`.

Migrations: run `npx prisma migrate deploy` via Vercel Deploy Hooks, a GitHub Action, or manually from your machine (using the managed `DATABASE_URL`).

## 4. Self-hosting with Docker Compose

1. Populate `.env` with production credentials (unquoted `POSTGRES_*` values).
2. Build and start:
   ```bash
   docker compose build web
   docker compose up -d
   ```
3. Apply schema inside the container:
   ```bash
   docker compose exec web npx prisma migrate deploy
   ```
4. Optionally seed demo data: `docker compose exec web npm run db:seed`.
5. Expose port 3000 behind a reverse proxy (Caddy/Nginx) with HTTPS.

## 5. Fly.io (or other container platforms)

1. Run `fly launch` (or equivalent) to create the app.
2. Provision a managed Postgres instance (`fly pg create`).
3. Set secrets:
   ```bash
   fly secrets set \
     DATABASE_URL=... \
     NEXTAUTH_URL=https://cafe.your-domain \
     NEXTAUTH_SECRET=... \
     GITHUB_ID=... GITHUB_SECRET=...
   ```
4. Deploy: `fly deploy`.
5. Apply migrations: `fly ssh console -C "cd /app && npx prisma migrate deploy"`.

## 6. Production Checklist

- [ ] `NEXTAUTH_URL` matches your HTTPS domain.
- [ ] All OAuth callback URLs updated to the production domain.
- [ ] Prisma migrations applied (`npx prisma migrate status`).
- [ ] At least one admin account confirmed.
- [ ] Allowlist populated with the right domains/emails.
- [ ] Backups scheduled for the Postgres database.
- [ ] Environment secrets stored in a password manager or secret vault.

## 7. Operational Tips

- **Monitoring**: Tail logs with `docker compose logs -f web` or your platform’s log explorer. Watch for Prisma connection errors or NextAuth JWT issues.
- **Backups**: Use `pg_dump` (see [DB_OPERATIONS.md](./DB_OPERATIONS.md)). Managed databases often include automated snapshots—verify the retention policy.
- **Cron jobs**: If you plan to send low-stock or settlement reminders, schedule a cron (Vercel Cron, GitHub Actions, Fly Machines, etc.) that calls the relevant endpoint or server action once implemented.
- **Zero downtime**: Apply migrations before swapping containers. Prisma’s `migrate deploy` is idempotent and safe to run in CI/CD.

Pick the deployment path that best fits your team. Vercel is the quickest to get running; Docker Compose keeps everything in-house when you need full control.
