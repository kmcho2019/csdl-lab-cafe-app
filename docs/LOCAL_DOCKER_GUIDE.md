# Local Docker Guide (Windows 11 + WSL2)

This walkthrough shows how to run Lab Cafe Hub on Windows using WSL2 (Ubuntu) and Docker Desktop. By the end you will be able to record a snack purchase, restock an item, and inspect the ledger.

If you are developing inside a VS Code Dev Container instead, use `docs/DEVCONTAINER.md` (it covers the container-first workflow, DB resets, and demo seeding without requiring `docker` inside the container).

## 1. Prerequisites

- **Docker Desktop** with WSL2 integration enabled (Settings → Resources → WSL Integration → Ubuntu).
- **Ubuntu (WSL2)** installed (`wsl.exe` → `Ubuntu`).
- **Git** inside WSL.
- **Node.js 22** (optional but recommended for running seeds outside the container).

## 2. Clone the repository

```bash
cd ~/CSDLCafeWebDev
git clone https://github.com/your-org/lab-cafe-hub.git
cd lab-cafe-hub
```

## 3. Configure environment variables

```bash
cp .env.example .env
nano .env
```

Set at minimum:

- `NEXTAUTH_SECRET=$(openssl rand -base64 32)`
- `GITHUB_ID` and `GITHUB_SECRET` (from your GitHub OAuth app)
- Optional: add your email domain to `ALLOWLIST_DOMAINS`

Leave the `POSTGRES_*` values unquoted so Docker can reuse them directly.

## 4. Start Postgres

```bash
docker compose up -d db
```

Verify status:

```bash
docker compose ps
```

## 5. Install dependencies & prepare the schema

From WSL:

```bash
npm install
npx prisma db push
npm run db:seed   # optional demo items + ledger float
```

You can run the same commands inside the container if you prefer:

```bash
docker compose run --rm web npm install
docker compose run --rm web npx prisma db push
```

## 6. Run the web app in Docker

```bash
docker compose up web
```

Visit http://localhost:3000 and sign in with GitHub (make sure your email or domain is allowlisted).

## 7. Promote yourself to admin

After the first sign-in, either ask an existing admin to promote you from the **People** page or run:

```bash
docker compose exec db psql \
  -U ${POSTGRES_USER:-postgres} \
  -d ${POSTGRES_DB:-lab_cafe} \
  -c "UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'your.email@example.com';"
```

Refresh `/app` to confirm **Inventory**, **People**, **Settlements**, and **Ledger** appear in the nav.

## 8. Record a snack

1. Open `/app`.
2. Click **Take one** on an item.
3. A success toast appears and the stock counter decrements. The transaction is stored in `Consumption` and a `StockMovement` row is logged.

## 9. Add or restock an item

1. Navigate to `/app/inventory` (admin only).
2. Use **Add new item** to create menu entries with price, unit, initial stock, and low-stock threshold.
3. Expand **Edit** on an item to tweak the name, price, unit, or category (use the dropdown or add a new category).
4. Expand **Restock** under an existing item, enter the quantity and optional unit cost, and submit.
5. The UI updates immediately; check `/app/ledger` to see the purchase entry when a unit cost is provided.

## 10.5. Try kiosk mode

1. Open `/app/kiosk` (admin only).
2. Select a member, tap a few items, and hit **Record purchase**.
3. Verify that the cart clears and the member’s tab reflects the new charges.

## 10. Check the ledger

Visit `/app/ledger` to see the latest entries. The demo seed inserts an "Initial float" credit so you can observe debits and running balances.

## 11. Command-line helpers

- Enter an interactive `psql` shell:
  ```bash
  docker compose exec db psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-lab_cafe}
  ```
- Export data:
  ```bash
  docker compose exec db pg_dump \
    -U ${POSTGRES_USER:-postgres} \
    -d ${POSTGRES_DB:-lab_cafe} \
    --no-owner --no-privileges -c > cafe-backup.sql
  ```
- Tear down:
  ```bash
  docker compose down --volumes
  ```

## 12. Troubleshooting quick hits

| Symptom | Fix |
| --- | --- |
| Prisma “authentication failed for user” | Remove quotes from `POSTGRES_PASSWORD`, run `docker compose down --volumes`, start again. |
| GitHub login returns `Invalid Compact JWE` | Set `NEXTAUTH_SECRET` to a 32+ char value and restart the web container. |
| API calls returning 401 | Ensure you are signed in (session cookie present) and your `User.isActive` flag is true. |

That’s it—you now have a fully local cafe environment with persistent Postgres storage. When you are done experimenting, shut things down with `docker compose down` and restart whenever needed.
