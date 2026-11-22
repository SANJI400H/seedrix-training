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

## Roles: who sees and does what

Everything below is enforced by Postgres row level security (RLS) in the database, not just hidden in the screens. Tested by `npm run test:rls` (see "For developers").

| Area | Owner (Sanji) | Admin (Karim, manager) | Sales (Nana, Mohammed, Ahmed…) |
| --- | --- | --- | --- |
| Leads | all, assign / re-assign, bulk assign | all, assign / re-assign, bulk assign | **only leads assigned to them**; leads they add are auto-assigned to them; update stage / notes / follow-ups; convert to student; cannot see unassigned or other reps' leads, cannot re-assign |
| Unassigned queue | ✓ | ✓ | ✗ |
| Clients (families) and students | all | all | **only their own** (rep = them) |
| Record payments | any student | any student | **only for their own students**; commission always goes to them |
| See payments | all, with teacher / commission / academy split | all, with split | their students' payments; only **their own commission** shown |
| Invoices: issue, download, send | all | all | only for their own students |
| Payouts (teacher pay, commission, refunds) | create / edit / void | create / edit / void | **cannot create**; see commission paid to themselves ("My commission") |
| Void an entry | ✓ | ✓ | their own students' payments (with a reason) |
| Edit or restore a voided entry | ✓ | ✓ | ✗ |
| Teachers | full profile incl. phone, email, pay rate, bank / IBAN, private notes, payout history, amount owed | same | **safe profile only** (subjects, curricula, grades, areas, delivery, languages, availability, bio) via the `teachers_public` view; no pay, bank, phone, email or notes |
| Bank page (statement import, matching) | ✓ | ✓ | ✗ (sees the Bank ✓ status on their own payments) |
| Reports (company-wide, per rep / teacher / source / campaign, CSV) | ✓ | ✓ | ✗ — "My performance" instead (own leads, conversions, revenue, commission) |
| Activity log | everything | everything | only their own actions |
| Settings: company & invoice details, split % & VAT, lead routing | edit | read only | ✗ (only their own account / password) |
| Staff: invite, roles, deactivate | ✓ | ✗ | ✗ |
| Raw website enquiries table | ✓ | ✓ | ✗ (they see the lead once it's assigned to them) |

Nothing can be deleted from the app. The activity log (`audit_log`) is written only by database triggers; even the service role cannot update or delete it.

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
4. New query again: `supabase/migrations/003_roles_invoices_sources_profiles.sql`, **Run**. (Role-based access, clients, invoices, ad lead sources, teacher profiles. It also creates one client record per existing student.)
   All migrations are safe to run again later; they do not delete data.
5. Storage (for teacher photos): **Storage → New bucket** named `teacher-photos`, **private** (not public). Migration 003 creates it automatically if Storage was already set up.

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
6. For more than a handful of emails a day, set up custom SMTP under **Project Settings → Authentication → SMTP** (you can use the same Resend account as the website).

### 4. Copy the keys

**Project Settings → API Keys** (older projects: **Settings → API**):

| Supabase shows | Put it in |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) or legacy **anon** key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key (`sb_secret_…`) or legacy **service_role** key | `SUPABASE_SERVICE_ROLE_KEY` (server only, never share) |

### 5. Set the environment variables

**Locally:** `cp .env.example .env.local`, fill in the three values above plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, then `npm install && npm run dev` and open <http://localhost:3000/admin>.

**Lead sources (optional, see "Leads from the website and ads"):** `LEAD_INGEST_SECRET` for n8n / Make / Zapier, and `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN` for Meta Lead Ads. `RESEND_API_KEY` and `SEEDRIX_TEAM_EMAIL` (already used by the website) also send new-lead and invoice emails.

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

## Leads from the website and ads

Every lead has a **source** (website, Facebook (Meta), Instagram (Meta), Snapchat, TikTok, Google, WhatsApp, referral, walk-in, iEnglish, other) and, when known, the campaign, ad set, ad, form and UTM tags. Leads → filter by source / campaign; Reports → "By lead source" and "By campaign" show leads, trials, enrolments, conversion and revenue.

New website and ad leads land in the **Unassigned queue** (owner/admin). Assign them from the lead page, or tick several in **Leads → Table view** and "Assign ticked leads to…". To hand them out automatically, turn on **round-robin** in Settings → Lead sources & integrations and tick the reps in the rotation (off by default). With round-robin on, the chosen rep also gets an email.

If someone with a phone number we already have comes in again (any channel), no duplicate is created: the existing lead gets a note "Came in again via …" and jumps to the top of the list.

New leads email `SEEDRIX_TEAM_EMAIL` (via Resend) and show a blue **New** badge until the assigned rep (or a manager, for unassigned ones) opens them.

### 1. Website (no setup)

Tag your ad links with UTM parameters, e.g.
`https://seedrixtraining.com/en?utm_source=instagram&utm_medium=paid&utm_campaign=nov-sharjah&utm_content=video-1`.
The site stores UTM tags, click ids (`gclid`, `fbclid`, `ttclid`, `ScCid`) and the referrer in a first-party cookie for 30 days, so they survive navigation until the visitor sends the enquiry form. The lead's source is worked out like this: `utm_source` facebook/fb → Facebook (Meta); instagram/ig → Instagram (Meta); tiktok; snapchat; google → Google; a `gclid` → Google; `fbclid` → Meta; `ttclid` → TikTok; `ScCid` → Snapchat; otherwise the referrer (instagram.com, facebook.com, tiktok.com, snapchat.com); otherwise "Website".

### 2. Meta Lead Ads (Facebook / Instagram instant forms) — native webhook

1. In <https://developers.facebook.com> create an app (type **Business**), add the **Webhooks** product.
2. Pick a long random **verify token** (any string) and put it in `META_VERIFY_TOKEN`. Copy the app's **App secret** (App settings → Basic) into `META_APP_SECRET`. Redeploy.
3. Webhooks → **Page** → Subscribe: callback URL `https://seedrixtraining.com/api/leads/meta`, verify token = the same string. Meta calls the URL once to verify it.
4. Subscribe the field **leadgen**.
5. Get a **Page access token** with `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` (Graph API Explorer → your Page → generate, then exchange for a long-lived token, or use a System User token in Business Manager). Put it in `META_PAGE_ACCESS_TOKEN`. Redeploy.
6. Subscribe the Page to the app: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with the page token (Graph API Explorer).
7. Test with Meta's **Lead Ads Testing Tool** (<https://developers.facebook.com/tools/lead-ads-testing>). The lead appears in the Unassigned queue with source Facebook or Instagram (from the lead's `platform`), plus campaign, ad set, ad name and form.

The endpoint checks the `X-Hub-Signature-256` signature with the app secret, then fetches each lead from the Graph API (`created_time, field_data, ad_name, adset_name, campaign_name, form_id, platform`). Without the env vars it answers 503 with a message saying which are missing.

### 3. TikTok, Snapchat and Google lead forms — via n8n (or Make / Zapier)

All three post to one endpoint:

```
POST https://seedrixtraining.com/api/leads/ingest
Header: x-lead-secret: <LEAD_INGEST_SECRET>
Content-Type: application/json
{
  "name": "Umm Saif", "phone": "050 123 4567", "email": "x@example.com",
  "source": "tiktok",              // tiktok | snapchat | google | meta_facebook | whatsapp | referral | …
  "campaign": "Back to school", "ad_set": "Sharjah mums", "ad": "Video 1", "form": "Tutor form",
  "emirate": "Sharjah", "interest": "Maths grade 5", "notes": "any extra answers",
  "utm_source": "", "utm_medium": "", "utm_campaign": "", "utm_content": "", "utm_term": "",
  "external_id": "platform lead id (stops duplicates on retries)",
  "raw": { "…": "the whole original payload, optional" }
}
```

Phone numbers are normalised to `+971…` (UAE default). Answers: `201 {"status":"created"}` or `200 {"status":"merged"}` (already known phone), `401` wrong secret, `400` invalid body. **Settings → Lead sources & integrations → Send test lead** posts a sample through the same endpoint.

In n8n, each flow is *trigger → Set (map fields) → HTTP Request*:

**HTTP Request node (same for all three):** Method `POST`, URL `https://seedrixtraining.com/api/leads/ingest`, Send Headers → `x-lead-secret` = your secret, Body Content Type JSON, "Specify Body: Using Fields Below" with the fields from the Set node.

| Platform | n8n trigger | Field mapping to the ingest body |
| --- | --- | --- |
| **TikTok Lead Generation** | *Webhook* node (POST). In TikTok Ads Manager → Tools → Instant forms → CRM integration → **Custom API / webhook**, paste the n8n production webhook URL. (Or the TikTok "Leads" app in Zapier.) | `name` ← `{{$json.body.name ?? $json.body.full_name}}`, `phone` ← `phone_number`, `email` ← `email`, `source` = `tiktok`, `campaign` ← `campaign_name`, `ad_set` ← `adgroup_name`, `ad` ← `ad_name`, `form` ← `form_name` or `page_name`, `external_id` ← `lead_id`, `notes` ← other question answers joined, `raw` ← `{{$json.body}}` |
| **Snapchat Lead Generation** | *Webhook* node. In Snapchat Ads Manager → Lead Generation form → **Webhook** (Snap's lead webhook integration) with the n8n URL; or poll the Snap Marketing API leads endpoint on a *Schedule* trigger. | `name` ← `full_name` (or `first_name` + `last_name`), `phone` ← `phone_number`, `email` ← `email`, `source` = `snapchat`, `campaign` ← `campaign_name`, `ad_set` ← `ad_squad_name`, `ad` ← `ad_name`, `form` ← `lead_form_name`, `external_id` ← `lead_id`, `raw` ← body |
| **Google Ads lead form extensions** | *Webhook* node. Google Ads → Assets → Lead form → **Lead delivery → Webhook integration**: webhook URL = n8n URL, key = any string (check it in n8n with an IF node on `{{$json.body.google_key}}`). Use **Send test data** in Google Ads. | Google sends `user_column_data: [{column_id, string_value}]`. In a Code node: `const f = Object.fromEntries($json.body.user_column_data.map(c => [c.column_id, c.string_value]));` then `name` ← `f.FULL_NAME`, `phone` ← `f.PHONE_NUMBER`, `email` ← `f.EMAIL`, `emirate` ← `f.CITY`, `source` = `google`, `campaign` ← `campaign_id` (or name via a lookup), `form` ← `form_id`, `external_id` ← `lead_id`, `notes` ← other columns, `raw` ← body |

Store the secret as an n8n credential (Header Auth) rather than in the node.

## Client invoices and sending them

- **Every payment gets a receipt invoice automatically** (existing SRX-YYYY-000001 numbering), marked **PAID**: invoice number, issue date, Seedrix LLC details (trading as Seedrix Learning, address, licence 2648158.01, TRN if set), bill-to (payer, phone, email), student, course / description, amount, VAT line only when VAT is on and a TRN is set, the payment received (date, method, bank reference), the agreed course fee, total paid to date, balance remaining, and the bank details for paying any balance.
- **Unpaid invoice for a balance or a new course fee:** student page → "Issue an invoice…". It is "Unpaid" until payments are recorded against it (Record payment → "Paying an invoice?"), then "Partly paid" (shows paid vs due) and "Paid".
- **Send to client** (invoice page): **Email PDF** (via Resend, PDF attached, link included) and **Send on WhatsApp** (opens wa.me with a message and the client link). The client link (`/en/payment/invoice/<random id>`) shows paid / partly paid / unpaid and lets them download the PDF; it uses the invoice's random UUID, not the sequential number. Each send is logged on the invoice and in the activity log.
- **VAT:** off by default. Settings → Split % & VAT. Amounts are treated as VAT-inclusive (the client pays what was agreed; the invoice shows the net + VAT breakdown). Applies to invoices issued after it is switched on.
- Sales can only invoice and send for their own students.

## Clients (families) and teacher profiles

- A **client** is the parent / payer. One client can have several children (students). Converting a lead creates the client and the first child; for a second child choose "Existing client". The client page shows contact details, how they found us, lead history and notes, every child (grade, school, curriculum, subjects, teacher, schedule, delivery, fee), payments, invoices and the balance. Migration 003 created one client per existing student; merge families by editing a student's "Client".
- **Teachers**: directory with filters (subject, curriculum, area, delivery) for picking a teacher for a lead. Profiles show subjects, curricula, grades, areas, delivery modes, languages, availability, bio and current students. Owner/admin also see phone, email, pay rate (per hour / class / course), bank / IBAN, rating, private notes, payout history and the amount owed, and can upload a photo (stored privately in the `teacher-photos` bucket, shown with short-lived signed links).

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
2. **Your leads:** "My leads" shows only the leads the owner/admin assigned to you (and the ones you add yourself). Website and ad leads are assigned to you by the owner or by round-robin; new ones have a blue "New" badge.
3. **Move leads along** the pipeline (New → Contacted → Trial booked → Trial done → Enrolled / Lost) with the *Move* control on each card. "Lost" asks for a reason.
4. **Client agrees:** on the lead, **Convert to student** with the agreed total fee, teacher and schedule.
5. **Client pays:** **Record payment** straight away — date, amount, how they paid, the teacher's share. The split appears as you type. If it was cash or paid to you personally, choose that honestly: it will show in red until the money is in the account.
6. **Invoice:** open the payment → **Invoice & send** → "Send on WhatsApp" or "Email PDF". For a balance still to pay, issue an invoice from the student page and send it the same way.
7. **Teacher pay and commission** are paid out by the owner or admin (Payouts). You can follow your commission under **My commission** and **My performance**.
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
- Tests: `npm test` (vitest) covers the split, balances, overpay/due checks, duplicate detection, bank CSV parsing and match suggestions, the workbook date and teacher-name logic, lead source mapping from UTMs, phone normalisation and de-duplication, the Meta signature check and field mapping, and invoice totals (partial payments, VAT on/off).
- RLS tests: `npm run test:rls` runs `supabase/tests/rls_roles.sql` against `$DATABASE_URL` (default `postgres://postgres@localhost:54322/postgres`) inside a transaction that is rolled back. It proves, as each role, that a sales user cannot read another rep's leads / students / payments, cannot read teacher pay or bank details, cannot create payouts, cannot read bank lines, and that admin cannot change settings or roles.
- The audit log can only be bypassed by a database superuser disabling triggers (e.g. from the Supabase SQL editor). Keep dashboard access to the owner.
