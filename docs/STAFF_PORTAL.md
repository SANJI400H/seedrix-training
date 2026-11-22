# Seedrix staff portal (CRM + finance ledger)

The staff portal lives at **`/admin`** on the same Next.js site as the public pages. It replaces the sales manager's Excel workbook with one place where every lead, student, client payment and payout is recorded by the person who handled it, at the time it happened.

It exists because a bank reconciliation of the old workbook found client payments marked "paid" that never reached the bank, a renewal entered twice, a receipt not recorded against any client, payouts above what the sheet justified, unallocated amounts and dates a week off. The portal makes those mistakes either impossible or immediately visible:

| Problem in the old sheet | What the portal does |
| --- | --- |
| "Paid" but never reached the bank | Every payment shows **Bank ✓ / Not matched**. The dashboard lists unmatched payments; the Bank page lists ledger entries that are not on the statement. |
| Renewal entered twice | Saving a payment with the same student and amount within 7 days needs an explicit "save anyway" confirmation, and is marked on the entry. |
| Receipt not recorded against a client | Imported Wio lines with no matching entry appear under "On the statement, not in the ledger" and on the dashboard. |
| Payouts above what was due | Each payout is linked to the client payment it belongs to. The form shows due vs already paid and needs a confirmation to overpay; the dashboard lists overpaid payments. |
| Unallocated amounts | The split (teacher / commission / academy) is calculated by the database from the teacher's share. Nobody types commission or academy amounts by hand. |
| Dates a week off | Entries are recorded on the day, the date can't be in the future, and bank matching suggests only lines within ±3 days. |
| Edits after the fact | Each change is written to an append-only **activity log** by the database itself. If a bank-confirmed amount is edited later, the entry shows **Changed after confirm** in red. |

## Roles

| | Owner (Sanji) | Admin (e.g. Karim as manager) | Sales (Nana, Mohammed, Ahmed…) |
| --- | --- | --- | --- |
| Leads, students, notes | ✓ | ✓ | ✓ (whole team sees all) |
| Record / edit payments and payouts | ✓ | ✓ | ✓ |
| Void an entry (with a reason) | ✓ | ✓ | ✓ |
| Edit or restore a **voided** entry | ✓ | ✓ | ✗ |
| Bank page: import statement, match / unmatch | ✓ | ✓ | ✗ (sees the Bank ✓ status only) |
| Teachers list | ✓ | ✓ | read only |
| Split %, company and invoice details | ✓ | read only | read only |
| Invite staff, change roles, deactivate | ✓ | ✗ | ✗ |
| Activity log | read | read | read |

The rules are enforced in the database with Postgres row level security (RLS), not just hidden in the screens. Nothing can be deleted from the app. The activity log (`audit_log`) is written only by database triggers, and even the service role cannot update or delete it.

## One-time setup (no Supabase project yet)

You need: a Supabase account, the Vercel project for this site, and about 20 minutes.

### 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in, and click **New project**.
2. Name it (e.g. `seedrix-training`), choose a strong database password (save it in your password manager), and pick a region close to the UAE (e.g. *Frankfurt* or *Mumbai*).
3. Wait until the project is ready.

### 2. Create the tables

1. In the project, open **SQL Editor → New query**.
2. Open `supabase/migrations/001_init.sql` from this repo, copy everything, paste it, and click **Run**.
   (Skip this if the public site already has a Supabase project with these tables — use that project.)
3. New query again: copy all of `supabase/migrations/002_staff_portal.sql`, paste, **Run**.
   It is safe to run again later; it will not delete data.

### 3. Turn on email sign-in

1. **Authentication → Sign In / Providers**: make sure **Email** is enabled.
2. Turn **off** "Allow new users to sign up". Staff are invited by the owner; nobody should be able to create an account on their own.
3. **Authentication → URL Configuration**:
   - **Site URL**: your live site, e.g. `https://seedrixtraining.com`
   - **Redirect URLs**: add `https://seedrixtraining.com/admin/**` and `http://localhost:3000/admin/**`
4. Optional but recommended (**Authentication → Emails → Templates**): in the *Invite user* template, change the link to
   `{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   and in *Magic link* to
   `{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`.
   The default templates also work (they go through `/admin/auth/callback`), the custom ones are just more robust when links are opened on another device.
5. For more than a handful of emails a day, set up custom SMTP under **Project Settings → Authentication → SMTP** (you can use the same Resend account as the website).

### 4. Copy the keys

**Project Settings → API Keys** (older projects: **Settings → API**):

| Supabase shows | Put it in |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) or legacy **anon** key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key (`sb_secret_…`) or legacy **service_role** key | `SUPABASE_SERVICE_ROLE_KEY` (server only, never share) |

### 5. Set the environment variables

**Locally:** `cp .env.example .env.local`, fill in the three values above plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, then `npm install && npm run dev` and open <http://localhost:3000/admin>.

**On Vercel:** Project → **Settings → Environment Variables**, add the same three variables (and `NEXT_PUBLIC_SITE_URL` set to the live URL) for *Production* and *Preview*, then **redeploy**. Variables starting with `NEXT_PUBLIC_` are baked in at build time, so a redeploy is required after changing them.

### 6. Create the first owner (you)

1. Supabase → **Authentication → Users → Add user → Create new user**. Enter your email and a password, and tick **Auto confirm user**.
2. SQL Editor → New query, replace the email and run:

   ```sql
   insert into public.staff (user_id, email, full_name, role)
   select id, email, 'Sanji', 'owner' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = 'owner', active = true;
   ```

3. Sign in at `/admin/login`. You are the owner.

## Inviting staff

1. **Settings → Staff → Invite by email**: name, email, role (*Sales* for reps, *Admin* for the manager).
2. They get an email from Supabase, open the link, and land on **Your account** to set a password.
3. To remove access, open their row in **Settings → Staff → Edit** and set **Access: Deactivated**. Their past entries stay, with their name on them.

People who appear in the rep lists but don't sign in yet (e.g. from the imported workbook) can be added with **Add a rep without a login**, then invited later from their row.

## Importing the old workbook

The importer reads the manager's Excel file and creates leads, students, teachers and the sales reps (without logins). It never imports the **Payments** and **Sheet2** tabs as payments — those were found to be unreliable — it only prints a summary of them for reconciliation. The "Paid" column in *Our Students* is kept as a note on each student, not as a payment: record verified payments in the portal and match them to the bank.

```bash
# 1. check what would be imported — nothing is written
npm run import:workbook -- "/path/to/Seedrix_Learning_Manager_Sheet_EN_exact.xlsx" --dry-run

# 2. import (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local)
npm run import:workbook -- "/path/to/Seedrix_Learning_Manager_Sheet_EN_exact.xlsx"
```

(`npx tsx scripts/import-workbook.ts <file> --dry-run` does the same.) Add `--details` to the dry run to see every inferred date row by row.

What it does with messy cells:

- **Dates.** The sheet is written day/month, but Excel turned some of those into month/day dates (e.g. `2026-01-09` meaning 1 September). For a real date cell the importer tries both readings and keeps the one that falls inside the plausible range (`--window`, default 1 Jun – 30 Nov 2026). If both are plausible it picks the one closest to the row above. Text like `22/6` is read as day/month; a bare day number (`4`) continues the month of the rows above. Impossible dates (`31/9`) are left empty. Whenever a date was inferred, the original value is kept in the lead's or student's notes.
- **Phones** are normalised to `+971…` (or the foreign prefix already present); numbers that look incomplete are kept as typed with a note.
- **Duplicates:** the same phone number on several lead tabs becomes one lead with the extra rows added as notes; teachers listed in two emirates become one teacher.
- **Re-running is safe:** every imported row has a reference (`wb:<tab>:<row>`), and rows already imported are skipped.

Never commit the workbook, bank statements or exports to git (`.gitignore` blocks `*.xlsx` and `*statement*.csv`).

## Importing the Wio bank statement (owner / admin)

1. In Wio Business, export the account statement for the period as **CSV**.
2. Portal → **Bank → Import Wio statement**, choose the file, **Import**.
   Lines already imported (same *Ref. number*) are skipped, so overlapping exports are fine.
3. **Suggested matches** shows statement lines with the same amount as a recorded payment (money in) or payout (money out), dated within 3 days, best name match first. Check each one and click **Confirm**.
4. For anything else, open the payment or payout and use **Bank statement → Confirm match**, choosing the line (or entering it by hand).
5. Mark bank fees, card spending and personal transfers as **Not ledger** so they stop showing as unrecorded.
6. What's left on the two lists is what needs a conversation: money in the bank nobody recorded, and entries recorded that never reached the bank.

If a matched entry is edited afterwards so the amount no longer matches, it shows **Changed after confirm** everywhere until someone re-checks it. Removing a match needs a reason and is kept in the log.

## Daily workflow for sales reps (phone-friendly)

1. **Morning:** open the **Dashboard** → *Follow-ups due today*. Tap a lead, use **WhatsApp** or **Call**, then **Add a note** and set the next follow-up date.
2. **New enquiry from social / a referral:** **Leads → Add lead**. Website enquiries appear automatically.
3. **Move leads along** the pipeline (New → Contacted → Trial booked → Trial done → Enrolled / Lost) with the *Move* control on each card. "Lost" asks for a reason.
4. **Client agrees:** on the lead, **Convert to student** with the agreed total fee, teacher and schedule.
5. **Client pays:** **Record payment** straight away — date, amount, how they paid, the teacher's share. The split appears as you type. If it was cash or paid to you personally, choose that honestly: it will show in red until the money is in the account.
6. **Invoice:** open the payment → **Invoice PDF** (shows agreed fee, paid to date and balance) and send it to the parent.
7. **Teacher paid / commission sent:** **Record payout**, choose the client payment it belongs to. If the amount is more than what's due, the portal will ask you to confirm.
8. **Mistake?** Don't fix it by entering a correction elsewhere: **void** the wrong entry with a reason and record the right one. Voided entries stay visible, crossed out.

## How the money is calculated

- For each client payment: `commission = round((amount − teacher share) × sales % / 100, 2)` and `academy = amount − teacher share − commission`. The sales % (default 80) is copied onto the payment when it is saved, so changing it in Settings never rewrites history.
- **Client balance** = agreed fee − all payments that are not void.
- **Should be in the account** = all non-void payments in − all non-void payouts.
- **Teachers / commission still owed** = total shares due on payments − payouts of that type.

The same formulas live in `lib/ledger/*.ts` (with tests: `npm test`) and in the database trigger `client_payment_split()`.

## For developers

- Code: `app/admin/**` (pages, server actions in `app/admin/actions`), `components/portal/**`, `lib/portal/**`, pure money maths in `lib/ledger/**`.
- The portal uses `@supabase/ssr` with the anon key and the user's cookie session (RLS applies). The public site keeps using `getSupabaseAdmin()` (service role) in its API routes; the portal only uses the service role for sending staff invites.
- `middleware.ts` sends `/admin/**` to the portal session middleware instead of next-intl; everything else is unchanged.
- Tests: `npm test` (vitest) covers the split, balances, overpay/due checks, duplicate detection, bank CSV parsing and match suggestions, and the workbook date logic.
- The audit log can only be bypassed by a database superuser disabling triggers (e.g. from the Supabase SQL editor). Keep dashboard access to the owner.
