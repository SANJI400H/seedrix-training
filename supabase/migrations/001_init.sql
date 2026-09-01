-- Seedrix Training — inquiries, invoices, payments
-- Apply in the Supabase SQL editor (service role used by Next.js API routes).
-- RLS is on; anon/authenticated have no policies. All access is via service_role.

create extension if not exists "pgcrypto";

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  locale text not null check (locale in ('en', 'ar')),
  full_name text not null,
  mobile text not null,
  email text not null,
  service text not null,
  emirate text not null,
  delivery_mode text not null,
  status text not null default 'new'
);

create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  created_at timestamptz not null default now(),
  locale text not null check (locale in ('en', 'ar')),
  path text not null check (path in ('self_serve', 'quoted')),
  status text not null default 'issued' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  service text not null,
  description text,
  amount_aed numeric(12, 2) not null,
  vat_aed numeric(12, 2) not null default 0,
  total_aed numeric(12, 2) not null,
  client_name text not null,
  client_mobile text not null,
  client_email text,
  recruit_name text,
  recruit_email text,
  package_code text,
  hours integer,
  paid_at timestamptz,
  payment_method text
);

create sequence if not exists public.invoice_number_seq start 1;

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.invoice_number_seq');
  return 'SRX-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY') || '-' || lpad(n::text, 6, '0');
end;
$$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  created_at timestamptz not null default now(),
  provider text not null,
  provider_ref text,
  method text not null,
  amount_aed numeric(12, 2) not null,
  status text not null check (status in ('pending', 'paid', 'failed')),
  raw jsonb
);

create index if not exists payments_invoice_id_idx on public.payments (invoice_id);

alter table public.inquiries enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
