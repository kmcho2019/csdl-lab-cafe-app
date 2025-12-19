# Admin Onboarding Guide

Use this checklist when spinning up Lab Cafe Hub for the first time or handing the system to a new treasurer.

## 1. Prepare the environment

1. Clone the repository and move into the project directory.
2. Copy the environment template: `cp .env.example .env`.
3. Fill in:
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`).
   - `GITHUB_ID` / `GITHUB_SECRET` from your GitHub OAuth app.
   - Optional: add your lab domain to `ALLOWLIST_DOMAINS`.
4. Start Postgres:
   - Docker Compose: `docker compose up -d db`
   - VS Code Dev Container: Postgres starts automatically; see `docs/DEVCONTAINER.md`
5. Apply the schema: `npx prisma db push` (or `docker compose run --rm web npx prisma db push`).
6. Optional seed data:
   - Minimal: `npx prisma db seed` (sample items, allowlist domains, opening ledger balance).
   - Full demo dataset: `DEMO_SEED=1 npx prisma db seed` (adds more members/items plus multi-month transactions for testing kiosk, analytics, and settlements).
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
4. Submit—the email is added to the allowlist and a `User` row is created.
5. On their first GitHub sign-in, the OAuth account is automatically linked to that existing user (no manual `Account` SQL needed).

### 3.2 Add inventory

Visit `/app/inventory` and use **Add new item** to create menu entries (name, price in minor units, unit, category, initial stock, low-stock threshold). The system records price history and a matching stock movement.

Need to adjust prices or categories later? Use the **Edit** drawer on each item to change name, price, category (including adding new categories), unit, or low-stock threshold without dropping to SQL.

Phasing out an item? Lab Cafe Hub uses **archiving** instead of deletion:
- Write off any remaining stock until the item reaches **0** on-hand.
- Use the **Archive** action on the item card (requires typing the exact item name).
- Archived items are hidden from members/kiosk, and can be restored with **Reactivate** from the collapsed Archived items section.

### 3.3 Configure ledger opening balance

If the cafe already has funds on hand, record them from the UI:
1. Visit `/app/ledger` as an admin.
2. In **Adjust balance**, select **Credit (money in)**.
3. Enter the amount in minor units (e.g., KRW).
4. Pick an appropriate category (often `RECEIPT` or `ADJUSTMENT`) and a short description (Unicode ok, max 200 chars; control characters blocked), e.g. `Opening float`.
5. Submit – the account balance and trend graph update immediately.

## 4. Verify the end-to-end flow

1. From your member view (`/app`), click **Take one** to simulate grabbing a snack.
2. Confirm the toast appears and the stock count decrements.
3. (Optional) Use **Undo** on the success toast or **Recent transactions** on `/app/account` to reverse an accidental click (works until bills are finalized).
4. Visit `/app/inventory` to verify the stock movement and `/app/ledger` to verify the ledger balance.
5. (Optional) Add another admin via the **People** page and confirm they can access admin sections.
6. (Optional) Visit `/app/kiosk`, select a member, add a couple of items, and record the purchase to ensure the kiosk experience works on shared devices.

## 5. Prepare for settlements

You can run settlements entirely from the UI:
1. Visit `/app/settlements`.
2. Create a **draft** for the month.
3. Use **Preview bills** and **Corrections** to validate and fix mistakes.
4. Click **Finalize bills** to lock the period (status becomes **BILLED**).
5. Use **Payment tracking** to mark each member paid.
6. When everyone is paid, click **Finalize settlement** to credit the ledger and close the month.

## 6. Hand-off checklist for new admins

- Share the `.env` (without production secrets) and GitHub OAuth instructions.
- Confirm the new admin’s email/domain is allowlisted and their role is `ADMIN` (via **People** or SQL).
- Review the inventory list and reconcile physical stock before transferring responsibility.
- Point successors to this guide plus [ADMIN_GUIDE.md](./ADMIN_GUIDE.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

Following these steps guarantees a smooth start for every new caretaker of the lab cafe.
