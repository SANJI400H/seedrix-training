# Seedrix Training

Bilingual (English / Arabic) marketing and lead-generation site for Seedrix Training, operated by Seedrix LLC (Shams Free Zone, Sharjah — License No. 2648158.01).

Primary conversion is the inquiry form. Payment is a separate flow and never blocks the 10-minute callback promise.

## Stack

Next.js 15 App Router, TypeScript, Tailwind CSS, next-intl, Supabase, Resend, Network International N-Genius (Tabby + Tamara on one outlet).

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Arabic-locale browsers are sent to `/ar`; everyone else to `/en`.

### Required for a live inquiry

1. Create a Supabase project and run `supabase/migrations/001_init.sql` in the SQL editor.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Create a Resend API key and set `RESEND_API_KEY`, `RESEND_FROM`, and `SEEDRIX_TEAM_EMAIL`.

Without those keys the form still validates and redirects, but the lead is only logged on the server.

### Payments

- `PAYMENT_PROVIDER=mock` (default): checkout creates an invoice, then marks it paid and emails a PDF.
- `PAYMENT_PROVIDER=ngenius`: Network International N-Genius Online. Enable Tabby and Tamara on the merchant outlet so both BNPL options share this integration.
- Set `ONLINE_10H_AED` and `ONLINE_20H_AED` before self-serve packs can be purchased. Until then the UI shows `[X]` placeholders.
- Recruits create quoted invoices with `POST /api/invoices` and header `x-admin-secret: $INVOICE_ADMIN_SECRET`.

## Staff portal (CRM + finance ledger)

Staff sign in at `/admin` to manage leads (website enquiries arrive automatically), students, client payments, payouts, invoices and bank reconciliation against the Wio statement, with roles enforced by Supabase row level security and a tamper-proof activity log.

Setup, roles, importing the old workbook and the daily workflow: **[docs/STAFF_PORTAL.md](docs/STAFF_PORTAL.md)**.

```bash
npm test                                             # ledger maths + importer tests
npm run import:workbook -- path/to/workbook.xlsx --dry-run
```

## Brand

Logos in `/public/brand/`. Fonts: self-hosted Sansation (Latin) + Noto Sans Arabic (Google Fonts).
