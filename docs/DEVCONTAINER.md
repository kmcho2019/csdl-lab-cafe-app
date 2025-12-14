# Devcontainer Development Guide

This repo ships with a VS Code Dev Container config (`.devcontainer/`) that runs:

- `web`: the Next.js app container you work in
- `db`: a Postgres container for local development

The key mental model:

- **Docker Compose is run by VS Code / Dev Containers on your host machine.**
- **Inside the devcontainer you usually *won’t* have the `docker` CLI**, so you manage the app and DB using `npm`/`npx prisma` commands.

If you prefer to manage everything from your host terminal, use the Compose workflow in `README.md` and `docs/LOCAL_DOCKER_GUIDE.md`.

---

## 1) Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- VS Code + the **Dev Containers** extension

---

## 2) Open the repo in the devcontainer

1. Open the repository in VS Code.
2. Run **Dev Containers: Reopen in Container**.
3. Wait for the container to finish building.
   - The devcontainer runs `npm install` and `npm run prisma:generate` automatically (see `.devcontainer/devcontainer.json`).

Ports:
- `3000` (Next.js dev server)
- `5432` (PostgreSQL)

If you don’t see them forwarded, open VS Code’s **Ports** panel and forward them manually.

---

## 3) Configure environment variables

1. Create a local env file (if you don’t already have one):
   ```bash
   cp .env.example .env
   ```
2. For devcontainer usage, keep `POSTGRES_HOST=db` (default in `.env.example`).
3. Set:
   - `NEXTAUTH_SECRET` (32+ chars)
   - `GITHUB_ID` / `GITHUB_SECRET` (GitHub OAuth app)
   - Optional: `ALLOWLIST_DOMAINS` (comma-separated)

Notes:
- `.env` is injected into the container when it starts. If you change `.env`, **restart the devcontainer** (or at least restart `npm run dev`) so changes take effect.
- Next.js reads env vars at process start, so env edits require a restart.

---

## 4) Start Postgres (devcontainer)

In the devcontainer setup, the `db` service is started automatically (see `runServices` in `.devcontainer/devcontainer.json`).

If you need to confirm it’s up from *inside* the `web` container:

```bash
node -e "require('net').connect(5432,'db').on('connect',()=>{console.log('db ok');process.exit(0)}).on('error',(e)=>{console.error(e.message);process.exit(1)})"
```

---

## 5) Apply the schema (Prisma)

From inside the devcontainer:

```bash
npx prisma db push
```

If you prefer migrations (creates `prisma/migrations`):

```bash
npx prisma migrate dev
```

---

## 6) Load seed data (minimal or demo)

Minimal seed (a few items + allowlist defaults):

```bash
npx prisma db seed
```

Full demo dataset (members, menu, multi-month activity for kiosk/settlements/analytics):

```bash
DEMO_SEED=1 npx prisma db seed
```

Demo seed guard:
- The demo seed **skips** if the DB already has `Consumption` records. If you want to re-run it, reset the DB first (next section).

---

## 7) Reset the dev database

### Option A: Prisma reset (works entirely inside the devcontainer)

This drops and recreates the schema in the existing Postgres instance:

```bash
npx prisma db push --force-reset
DEMO_SEED=1 npx prisma db seed
```

### Option B: Drop Docker volumes (run on the host, not inside the devcontainer)

Use this when you want a completely fresh Postgres data directory (and to clear the `web_node_modules` volume too).

From a host terminal in the repo root:

```bash
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml -p csdl-lab-cafe-app down --volumes
```

Then reopen the devcontainer and run:

```bash
npx prisma db push
DEMO_SEED=1 npx prisma db seed
```

---

## 8) Run the website on localhost

Inside the devcontainer:

```bash
npm run dev -- --hostname 0.0.0.0
```

Open:
- `http://localhost:3000` (if VS Code forwarded port 3000 to localhost)
- Or use the forwarded URL shown in VS Code’s **Ports** view

---

## 9) Extras (recommended devcontainer workflows)

### 9.1 Prisma Studio (GUI)

```bash
npx prisma studio --hostname 0.0.0.0 --port 5555
```

Forward port `5555`, then open the URL shown by VS Code.

### 9.2 Tests, lint, typecheck

```bash
npm test
npm run lint
npm run typecheck
```

### 9.3 Logs

If the site fails at runtime, start by watching the Next.js dev server output in the terminal running `npm run dev`.

---

## 10) Common devcontainer gotchas

- **“docker: command not found”**: expected inside the devcontainer; run Compose commands on your host.
- **Auth login fails**: ensure `NEXTAUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, and `NEXTAUTH_URL=http://localhost:3000` are set; restart the dev server after changing env vars.
- **Allowlist blocks sign-in**: add your email or domain to `ALLOWLIST_DOMAINS` or add an `AllowlistEntry` row (see `docs/DB_OPERATIONS.md`).

