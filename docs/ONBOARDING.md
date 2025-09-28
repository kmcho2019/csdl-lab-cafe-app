# Admin Onboarding Guide

Use this checklist when spinning up Lab Cafe Hub for the first time or handing the system to a new treasurer.

## 1. Prepare the environment

1. Clone the repository and move into the project directory.
2. Copy the environment template: `cp .env.example .env`.
3. Fill in:
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`).
   - `GITHUB_ID` / `GITHUB_SECRET` from your GitHub OAuth app.
   - Optional: add your lab domain to `ALLOWLIST_DOMAINS`.
4. Start Postgres: `docker compose up -d db`.
5. Apply the schema: `npx prisma db push` (or `docker compose run --rm web npx prisma db push`).
6. Optional demo data: `npm run db:seed` to create sample items, allowlist domains, and an opening ledger balance.
7. Start the dev server: `npm run dev` or `docker compose up web`.

## 2. Create your admin account

1. Visit `http://localhost:3000/app` and sign in with GitHub. If your email is not allowlisted yet, temporarily add it to `ALLOWLIST_DOMAINS` or insert an `AllowlistEntry` row.
2. Promote your user (once) with:
   ```bash
   docker compose exec db psql \
     -U ${POSTGRES_USER:-postgres} \
     -d ${POSTGRES_DB:-lab_cafe} \
     -c "UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'you@example.com';"
   ```
3. Refresh `/app`; verify that the admin navigation (Inventory, People, Settlements, Ledger) appears.

> Future promotions can be done entirely from the **People** page—SQL is only needed for the very first admin.

## 3. Seed core data

### 3.1 Invite additional members

1. Open `/app/users`.
2. Use **Add lab member** to enter their name, email, and (optionally) GitHub numeric ID.
3. Tick **Start as admin** for co-treasurers.
4. Submit—the email is added to the allowlist and a `User` row is ready for OAuth sign-in.

### 3.2 Add inventory

Visit `/app/inventory` and use **Add new item** to create menu entries (name, price in minor units, unit, category, initial stock, low-stock threshold). The system records price history and a matching stock movement.

Need to adjust prices or categories later? Use the **Edit** drawer on each item to change name, price, category (including adding new categories), unit, or low-stock threshold without dropping to SQL.

### 3.3 Configure ledger opening balance

If the cafe already has funds on hand, record them:
```sql
INSERT INTO "LedgerEntry" (id, timestamp, description, "amountCents", category, "balanceAfterCents")
VALUES (gen_random_uuid(), NOW(), 'Opening float', 75000, 'RECEIPT', 75000);
```

## 4. Verify the end-to-end flow

1. From your member view (`/app`), click **Take one** to simulate grabbing a snack.
2. Confirm the toast appears and the stock count decrements.
3. Visit `/app/inventory` and `/app/ledger` to verify the stock movement and ledger entry.
4. (Optional) Add another admin via the **People** page and confirm they can access admin sections.
5. (Optional) Visit `/app/kiosk`, select a member, add a couple of items, and record the purchase to ensure the kiosk experience works on shared devices.

## 5. Prepare for settlements

The listing UI exists, but creating/finalising settlements still requires SQL or scripts:
1. Insert a `Settlement` covering the desired date range.
2. Update prior consumptions with the `settlementId`.
3. Insert `SettlementLine` rows with per-member totals (query `Consumption` grouped by `userId`).
4. Record `Payment` rows as members reimburse the cafe.

Keep any helper SQL you write; once the settlement workflow ships you can compare results.

## 6. Hand-off checklist for new admins

- Share the `.env` (without production secrets) and GitHub OAuth instructions.
- Confirm the new admin’s email/domain is allowlisted and their role is `ADMIN` (via **People** or SQL).
- Review the inventory list and reconcile physical stock before transferring responsibility.
- Point successors to this guide plus [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

Following these steps guarantees a smooth start for every new caretaker of the lab cafe.
