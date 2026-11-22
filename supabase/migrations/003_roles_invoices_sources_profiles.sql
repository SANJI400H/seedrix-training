-- Seedrix Training — staff portal round 2
-- Role-based visibility, client invoices, ad lead sources, clients (families),
-- teacher profiles. Apply AFTER 002_staff_portal.sql. Safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.staff_role() = 'owner', false); $$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings: VAT, contact details, lead routing
-- ---------------------------------------------------------------------------
alter table public.settings add column if not exists vat_enabled boolean not null default false;
alter table public.settings add column if not exists vat_rate numeric(5, 2) not null default 5;
alter table public.settings add column if not exists company_phone text not null default '';
alter table public.settings add column if not exists company_email text not null default '';
alter table public.settings add column if not exists round_robin_enabled boolean not null default false;
alter table public.settings add column if not exists round_robin_staff_ids uuid[] not null default '{}';
alter table public.settings add column if not exists round_robin_cursor integer not null default 0;
alter table public.settings add column if not exists notify_new_leads boolean not null default true;
do $$ begin
  alter table public.settings add constraint settings_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Leads: ad / UTM attribution
-- ---------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_source_check;
update public.leads set source = 'walk_in' where source = 'walk-in';
alter table public.leads add constraint leads_source_check check (source in (
  'website', 'meta_facebook', 'meta_instagram', 'snapchat', 'tiktok', 'google', 'whatsapp',
  'referral', 'walk_in', 'iEnglish', 'social', 'other'));
-- 'social' is kept for imported rows whose network is unknown.

alter table public.leads add column if not exists campaign text;
alter table public.leads add column if not exists ad_set text;
alter table public.leads add column if not exists ad_name text;
alter table public.leads add column if not exists form_name text;
alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists utm_content text;
alter table public.leads add column if not exists utm_term text;
alter table public.leads add column if not exists landing_page text;
alter table public.leads add column if not exists referrer text;
alter table public.leads add column if not exists raw_payload jsonb;
alter table public.leads add column if not exists external_id text;
alter table public.leads add column if not exists received_at timestamptz not null default now();
alter table public.leads add column if not exists last_inbound_at timestamptz not null default now();
alter table public.leads add column if not exists viewed_at timestamptz;
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_last_inbound_idx on public.leads (last_inbound_at desc);
create index if not exists leads_rep_idx on public.leads (assigned_rep_id);
create unique index if not exists leads_external_id_key on public.leads (source, external_id);
-- imported / older leads: keep their original timing
update public.leads set received_at = created_at, last_inbound_at = created_at
where received_at > created_at + interval '1 minute' and import_ref is not null;

alter table public.inquiries add column if not exists utm_source text;
alter table public.inquiries add column if not exists utm_medium text;
alter table public.inquiries add column if not exists utm_campaign text;
alter table public.inquiries add column if not exists utm_content text;
alter table public.inquiries add column if not exists utm_term text;
alter table public.inquiries add column if not exists referrer text;
alter table public.inquiries add column if not exists landing_page text;
alter table public.inquiries add column if not exists gclid text;
alter table public.inquiries add column if not exists fbclid text;
alter table public.inquiries add column if not exists ttclid text;
alter table public.inquiries add column if not exists sccid text;

-- Same rules as lib/leads/source.ts (keep them in sync).
create or replace function public.lead_source_from(
  p_utm_source text, p_utm_medium text, p_referrer text,
  p_gclid text, p_fbclid text, p_ttclid text, p_sccid text, p_fallback text default 'website')
returns text language plpgsql immutable as $$
declare
  s text := lower(coalesce(p_utm_source, ''));
  r text := lower(coalesce(p_referrer, ''));
begin
  if s in ('facebook', 'fb', 'meta', 'facebook_ads', 'fb_ads') or s like 'facebook%' then return 'meta_facebook'; end if;
  if s in ('instagram', 'ig', 'insta') or s like 'instagram%' then return 'meta_instagram'; end if;
  if s like 'tiktok%' or s = 'tt' then return 'tiktok'; end if;
  if s like 'snap%' or s = 'sc' then return 'snapchat'; end if;
  if s in ('google', 'adwords', 'gads', 'google_ads', 'googleads') or s like 'google%' then return 'google'; end if;
  if s in ('whatsapp', 'wa') then return 'whatsapp'; end if;
  if coalesce(p_gclid, '') <> '' then return 'google'; end if;
  if coalesce(p_ttclid, '') <> '' then return 'tiktok'; end if;
  if coalesce(p_sccid, '') <> '' then return 'snapchat'; end if;
  if coalesce(p_fbclid, '') <> '' then
    return case when r like '%instagram%' then 'meta_instagram' else 'meta_facebook' end;
  end if;
  if r like '%instagram.%' then return 'meta_instagram'; end if;
  if r like '%facebook.%' or r like '%fb.%' then return 'meta_facebook'; end if;
  if r like '%tiktok.%' then return 'tiktok'; end if;
  if r like '%snapchat.%' then return 'snapchat'; end if;
  return coalesce(p_fallback, 'website');
end;
$$;

-- Website enquiries -> leads, now with attribution
create or replace function public.lead_from_inquiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.leads (name, phone, email, source, emirate, interest, stage, inquiry_id, first_contact_on,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign, landing_page, referrer, received_at, last_inbound_at)
  values (
    new.full_name, new.mobile, new.email,
    public.lead_source_from(new.utm_source, new.utm_medium, new.referrer, new.gclid, new.fbclid, new.ttclid, new.sccid, 'website'),
    new.emirate, new.service || coalesce(' (' || new.delivery_mode || ')', ''), 'new', new.id,
    (new.created_at at time zone 'Asia/Dubai')::date,
    new.utm_source, new.utm_medium, new.utm_campaign, new.utm_content, new.utm_term, new.utm_campaign,
    new.landing_page, new.referrer, new.created_at, new.created_at
  )
  on conflict (inquiry_id) where inquiry_id is not null do nothing;
  return null;
end;
$$;

-- Lead assignment on insert: sales always own what they create; optional
-- round-robin for new website / ad leads (off by default).
create or replace function public.lead_assign()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st public.settings;
  n int;
  pick uuid;
begin
  if auth.uid() is not null and public.staff_role() = 'sales' then
    new.assigned_rep_id := public.staff_id();
    return new;
  end if;
  if new.assigned_rep_id is null and new.import_ref is null and auth.uid() is null
     and new.source in ('website', 'meta_facebook', 'meta_instagram', 'snapchat', 'tiktok', 'google', 'whatsapp') then
    select * into st from public.settings where id for update;
    if found and st.round_robin_enabled then
      select array_length(array_agg(x), 1) into n
      from unnest(st.round_robin_staff_ids) x
      where exists (select 1 from public.staff s where s.id = x and s.active);
      if coalesce(n, 0) > 0 then
        select x into pick from (
          select x, row_number() over () - 1 as i
          from unnest(st.round_robin_staff_ids) x
          where exists (select 1 from public.staff s where s.id = x and s.active)
        ) q where q.i = st.round_robin_cursor % n;
        new.assigned_rep_id := pick;
        update public.settings set round_robin_cursor = (st.round_robin_cursor + 1) % n where id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_assign on public.leads;
create trigger leads_assign before insert on public.leads
  for each row execute function public.lead_assign();

-- ---------------------------------------------------------------------------
-- Clients (the payer / family) and richer students
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone2 text,
  whatsapp text,
  email text,
  emirate text,
  area text,
  address text,
  preferred_language text,
  source text,
  lead_id uuid references public.leads (id),
  rep_id uuid references public.staff (id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists clients_rep_idx on public.clients (rep_id);
create index if not exists clients_phone_idx on public.clients (phone);

alter table public.students add column if not exists client_id uuid references public.clients (id);
alter table public.students add column if not exists grade text;
alter table public.students add column if not exists school text;
alter table public.students add column if not exists curriculum text;
alter table public.students add column if not exists subjects text;
alter table public.students add column if not exists delivery_mode text;
do $$ begin
  alter table public.students add constraint students_curriculum_check
    check (curriculum is null or curriculum in ('american', 'british', 'ministry', 'ib', 'indian', 'other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.students add constraint students_delivery_check
    check (delivery_mode is null or delivery_mode in ('home', 'online', 'centre'));
exception when duplicate_object then null; end $$;
create index if not exists students_client_idx on public.students (client_id);
create index if not exists students_rep_idx on public.students (rep_id);

-- Give every existing student a client (one family per student; merge later in the UI)
do $$
declare
  s record;
  cid uuid;
begin
  for s in
    select st.*, l.source as lead_source, l.emirate as lead_emirate, l.email as lead_email
    from public.students st left join public.leads l on l.id = st.lead_id
    where st.client_id is null
  loop
    insert into public.clients (name, phone, email, emirate, source, lead_id, rep_id, notes)
    values (coalesce(nullif(s.payer_name, ''), s.name), s.phone, s.lead_email, s.lead_emirate, s.lead_source,
            s.lead_id, s.rep_id, 'Created automatically from the student record')
    returning id into cid;
    update public.students set client_id = cid where id = s.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teachers: profile fields, private section, safe directory view
-- ---------------------------------------------------------------------------
alter table public.teachers add column if not exists email text;
alter table public.teachers add column if not exists languages text;
alter table public.teachers add column if not exists curricula text;
alter table public.teachers add column if not exists grade_range text;
alter table public.teachers add column if not exists areas text;
alter table public.teachers add column if not exists delivery_modes text;
alter table public.teachers add column if not exists availability text;
alter table public.teachers add column if not exists bio text;
alter table public.teachers add column if not exists rating numeric(2, 1);
alter table public.teachers add column if not exists status text not null default 'active';
alter table public.teachers add column if not exists photo_path text;
alter table public.teachers add column if not exists pay_unit text;
alter table public.teachers add column if not exists bank_name text;
alter table public.teachers add column if not exists iban text;
do $$ begin
  alter table public.teachers add constraint teachers_status_check check (status in ('active', 'onboarding', 'inactive'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.teachers add constraint teachers_pay_unit_check check (pay_unit is null or pay_unit in ('hour', 'class', 'course'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.teachers add constraint teachers_rating_check check (rating is null or (rating >= 0 and rating <= 5));
exception when duplicate_object then null; end $$;
update public.teachers set status = 'inactive' where not active and status = 'active';

create or replace function public.teacher_status_sync()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.active is distinct from old.active and new.status is not distinct from old.status then
    new.status := case when new.active then 'active' else 'inactive' end;
  end if;
  new.active := new.status <> 'inactive';
  return new;
end;
$$;
drop trigger if exists teachers_status_sync on public.teachers;
create trigger teachers_status_sync before insert or update on public.teachers
  for each row execute function public.teacher_status_sync();

-- Safe directory for every staff member: no phone, email, pay, bank or private notes.
drop view if exists public.teachers_public;
create view public.teachers_public as
  select id, name, nationality, languages, subjects, curricula, grade_range, emirate, areas,
         delivery_modes, availability, bio, status, active, photo_path
  from public.teachers
  where public.is_staff();
revoke all on public.teachers_public from public, anon;
grant select on public.teachers_public to authenticated, service_role;

-- Private photos bucket (only where Supabase Storage exists)
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public) values ('teacher-photos', 'teacher-photos', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Invoices: receipts and bills linked to students, partial payments, sends
-- ---------------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'issued', 'partial', 'paid', 'cancelled'));
alter table public.invoices add column if not exists kind text;
alter table public.invoices add column if not exists student_id uuid references public.students (id);
alter table public.invoices add column if not exists client_id uuid references public.clients (id);
alter table public.invoices add column if not exists amount_paid numeric(12, 2) not null default 0;
alter table public.invoices add column if not exists vat_rate numeric(5, 2) not null default 0;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists issued_by uuid;
do $$ begin
  alter table public.invoices add constraint invoices_kind_check check (kind is null or kind in ('receipt', 'bill'));
exception when duplicate_object then null; end $$;
create index if not exists invoices_student_idx on public.invoices (student_id);
-- invoices created by 002's create_payment_invoice are receipts
update public.invoices i set kind = 'receipt', student_id = p.student_id, client_id = s.client_id
from public.client_payments p join public.students s on s.id = p.student_id
where p.invoice_id = i.id and i.kind is null;

create or replace function public.can_see_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or exists (select 1 from public.students s where s.id = p_student and s.rep_id = public.staff_id() and public.is_staff());
$$;
create or replace function public.can_see_payment(p_payment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or exists (select 1 from public.client_payments p where p.id = p_payment and public.can_see_student(p.student_id));
$$;
create or replace function public.can_see_invoice(p_invoice uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or exists (select 1 from public.invoices i where i.id = p_invoice and i.student_id is not null and public.can_see_student(i.student_id));
$$;
revoke all on function public.can_see_student(uuid) from public, anon;
revoke all on function public.can_see_payment(uuid) from public, anon;
revoke all on function public.can_see_invoice(uuid) from public, anon;
grant execute on function public.can_see_student(uuid) to authenticated, service_role;
grant execute on function public.can_see_payment(uuid) to authenticated, service_role;
grant execute on function public.can_see_invoice(uuid) to authenticated, service_role;

-- VAT-inclusive split of a gross amount (same as lib/ledger/invoice.ts)
create or replace function public.vat_parts(p_gross numeric, p_rate numeric)
returns table (net numeric, vat numeric) language sql immutable as $$
  select round(p_gross / (1 + p_rate / 100), 2), p_gross - round(p_gross / (1 + p_rate / 100), 2);
$$;

create or replace function public.recompute_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  paid numeric;
  last_paid date;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found or inv.kind is null then return; end if;
  select coalesce(sum(amount), 0), max(paid_on) into paid, last_paid
  from public.client_payments where invoice_id = p_invoice and not void;
  update public.invoices set
    amount_paid = paid,
    status = case
      when inv.status = 'cancelled' and inv.kind = 'bill' then 'cancelled'
      when inv.kind = 'receipt' and paid > 0 then 'paid'
      when paid >= inv.total_aed then 'paid'
      when paid > 0 then 'partial'
      when inv.kind = 'receipt' then 'cancelled'
      else 'issued' end,
    paid_at = case when paid >= inv.total_aed or (inv.kind = 'receipt' and paid > 0) then (last_paid::timestamp at time zone 'Asia/Dubai') else null end
  where id = p_invoice;
end;
$$;
revoke all on function public.recompute_invoice(uuid) from public, anon, authenticated;

create or replace function public.client_payment_invoice_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
    perform public.recompute_invoice(old.invoice_id);
  end if;
  if new.invoice_id is not null then perform public.recompute_invoice(new.invoice_id); end if;
  return null;
end;
$$;
drop trigger if exists client_payments_invoice_sync on public.client_payments;
create trigger client_payments_invoice_sync after insert or update on public.client_payments
  for each row execute function public.client_payment_invoice_sync();

-- 002's split trigger froze invoice_id once set; now a payment may be moved to
-- another invoice (but never unlinked). Split maths unchanged.
create or replace function public.client_payment_split()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select s.sales_pct into new.sales_pct from public.settings s where s.id;
    new.sales_pct := coalesce(new.sales_pct, 80);
    -- sales always earn the commission on payments they record for their students
    if auth.uid() is not null and public.staff_role() = 'sales' then
      new.rep_id := public.staff_id();
    end if;
  else
    new.sales_pct := old.sales_pct;
    new.invoice_id := coalesce(new.invoice_id, old.invoice_id);
    if auth.uid() is not null and public.staff_role() = 'sales' then
      new.rep_id := old.rep_id;
    end if;
  end if;
  if new.teacher_share > new.amount then
    raise exception 'Teacher share (%) cannot exceed the payment amount (%)', new.teacher_share, new.amount;
  end if;
  new.commission := round((new.amount - new.teacher_share) * new.sales_pct / 100, 2);
  new.academy := new.amount - new.teacher_share - new.commission;
  return new;
end;
$$;

-- Receipt invoice for a payment that isn't against a bill
create or replace function public.create_payment_invoice(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.client_payments;
  st public.students;
  cl public.clients;
  cfg public.settings;
  rep_name text;
  inv_id uuid;
  rate numeric := 0;
  parts record;
begin
  if auth.role() is distinct from 'service_role' and not public.can_see_payment(p_payment_id) then
    raise exception 'Not allowed';
  end if;
  select * into p from public.client_payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if p.invoice_id is not null then return p.invoice_id; end if;
  if p.void then raise exception 'Cannot invoice a voided payment'; end if;
  select * into st from public.students where id = p.student_id;
  select * into cl from public.clients where id = st.client_id;
  select * into cfg from public.settings where id;
  select full_name into rep_name from public.staff where id = p.rep_id;
  if cfg.vat_enabled and coalesce(cfg.trn, '') <> '' then rate := cfg.vat_rate; end if;
  select * into parts from public.vat_parts(p.amount, rate);

  insert into public.invoices (
    invoice_number, locale, path, status, kind, service, description,
    amount_aed, vat_aed, total_aed, vat_rate, client_name, client_mobile, client_email,
    recruit_name, payment_method, student_id, client_id, issued_by
  ) values (
    public.next_invoice_number(), 'en', 'quoted', 'issued', 'receipt',
    coalesce(nullif(st.course, ''), 'Tuition'), nullif(p.note, ''),
    parts.net, parts.vat, p.amount, rate,
    coalesce(nullif(p.payer_name, ''), cl.name, st.name),
    coalesce(nullif(cl.phone, ''), nullif(st.phone, ''), '-'), cl.email,
    rep_name, p.method, st.id, st.client_id, auth.uid()
  ) returning id into inv_id;

  update public.client_payments set invoice_id = inv_id where id = p_payment_id;
  perform public.recompute_invoice(inv_id);
  return inv_id;
end;
$$;
revoke all on function public.create_payment_invoice(uuid) from public, anon;
grant execute on function public.create_payment_invoice(uuid) to authenticated, service_role;

-- Unpaid invoice ("bill") for a balance due or a new course fee
create or replace function public.create_bill_invoice(p_student uuid, p_amount numeric, p_description text, p_due_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  st public.students;
  cl public.clients;
  cfg public.settings;
  rep_name text;
  inv_id uuid;
  rate numeric := 0;
  parts record;
begin
  if auth.role() is distinct from 'service_role' and not public.can_see_student(p_student) then
    raise exception 'Not allowed';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  select * into st from public.students where id = p_student;
  if not found then raise exception 'Student not found'; end if;
  select * into cl from public.clients where id = st.client_id;
  select * into cfg from public.settings where id;
  select full_name into rep_name from public.staff where id = st.rep_id;
  if cfg.vat_enabled and coalesce(cfg.trn, '') <> '' then rate := cfg.vat_rate; end if;
  select * into parts from public.vat_parts(round(p_amount, 2), rate);

  insert into public.invoices (
    invoice_number, locale, path, status, kind, service, description,
    amount_aed, vat_aed, total_aed, vat_rate, client_name, client_mobile, client_email,
    recruit_name, student_id, client_id, issued_by, due_date
  ) values (
    public.next_invoice_number(), 'en', 'quoted', 'issued', 'bill',
    coalesce(nullif(st.course, ''), 'Tuition'), nullif(p_description, ''),
    parts.net, parts.vat, round(p_amount, 2), rate,
    coalesce(nullif(st.payer_name, ''), cl.name, st.name),
    coalesce(nullif(cl.phone, ''), nullif(st.phone, ''), '-'), cl.email,
    rep_name, st.id, st.client_id, auth.uid(), p_due_date
  ) returning id into inv_id;
  return inv_id;
end;
$$;
revoke all on function public.create_bill_invoice(uuid, numeric, text, date) from public, anon;
grant execute on function public.create_bill_invoice(uuid, numeric, text, date) to authenticated, service_role;

create or replace function public.cancel_bill_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_invoice(p_invoice) then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.client_payments where invoice_id = p_invoice and not void) then
    raise exception 'This invoice has payments recorded against it';
  end if;
  update public.invoices set status = 'cancelled' where id = p_invoice and kind = 'bill';
end;
$$;
revoke all on function public.cancel_bill_invoice(uuid) from public, anon;
grant execute on function public.cancel_bill_invoice(uuid) to authenticated, service_role;

create table if not exists public.invoice_sends (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  channel text not null check (channel in ('email', 'whatsapp', 'link')),
  recipient text,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists invoice_sends_invoice_idx on public.invoice_sends (invoice_id);

-- ---------------------------------------------------------------------------
-- Triggers for new tables (meta + audit)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients', 'invoice_sends'] loop
    execute format('drop trigger if exists %I_meta on public.%I', t, t);
    execute format('create trigger %I_meta before insert or update on public.%I for each row execute function public.set_row_meta()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- Sales own the students / clients they create
create or replace function public.owned_by_sales()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.staff_role() = 'sales' then
    if tg_op = 'INSERT' then
      new.rep_id := public.staff_id();
    else
      new.rep_id := old.rep_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists students_owned on public.students;
create trigger students_owned before insert or update on public.students
  for each row execute function public.owned_by_sales();
drop trigger if exists clients_owned on public.clients;
create trigger clients_owned before insert or update on public.clients
  for each row execute function public.owned_by_sales();

-- ---------------------------------------------------------------------------
-- Row level security, round 2
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.invoice_sends enable row level security;
grant select, insert, update on public.clients, public.invoice_sends to authenticated;
revoke delete, truncate on public.clients, public.invoice_sends from authenticated;
revoke all on public.clients, public.invoice_sends from anon;

create or replace function pg_temp.policy(p_name text, p_table text, p_cmd text, p_using text, p_check text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  if p_cmd = 'insert' then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p_name, p_table, p_check);
  elsif p_cmd = 'update' then
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', p_name, p_table, p_using, p_check);
  else
    execute format('create policy %I on public.%I for %s to authenticated using (%s)', p_name, p_table, p_cmd, p_using);
  end if;
end;
$$;

-- leads: managers see all; sales only leads assigned to them
select pg_temp.policy('leads_select', 'leads', 'select',
  'public.is_manager() or (public.is_staff() and assigned_rep_id = public.staff_id())', null);
select pg_temp.policy('leads_insert', 'leads', 'insert', null,
  'public.is_manager() or (public.is_staff() and assigned_rep_id = public.staff_id())');
select pg_temp.policy('leads_update', 'leads', 'update',
  'public.is_manager() or (public.is_staff() and assigned_rep_id = public.staff_id())',
  'public.is_manager() or (public.is_staff() and assigned_rep_id = public.staff_id())');
select pg_temp.policy('lead_notes_select', 'lead_notes', 'select',
  'exists (select 1 from public.leads l where l.id = lead_id)', null);
select pg_temp.policy('lead_notes_insert', 'lead_notes', 'insert', null,
  'public.is_staff() and exists (select 1 from public.leads l where l.id = lead_id)');

-- clients / students: sales only their own
select pg_temp.policy('clients_select', 'clients', 'select',
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())', null);
select pg_temp.policy('clients_insert', 'clients', 'insert', null,
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())');
select pg_temp.policy('clients_update', 'clients', 'update',
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())',
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())');
select pg_temp.policy('students_select', 'students', 'select',
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())', null);
select pg_temp.policy('students_insert', 'students', 'insert', null,
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())');
select pg_temp.policy('students_update', 'students', 'update',
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())',
  'public.is_manager() or (public.is_staff() and rep_id = public.staff_id())');

-- payments: only for students you can see
select pg_temp.policy('client_payments_select', 'client_payments', 'select',
  'public.can_see_student(student_id)', null);
select pg_temp.policy('client_payments_insert', 'client_payments', 'insert', null,
  'public.is_staff() and not void and public.can_see_student(student_id)');
select pg_temp.policy('client_payments_update', 'client_payments', 'update',
  'public.is_manager() or (public.can_see_student(student_id) and (not void or created_by = auth.uid()))',
  'public.can_see_student(student_id)');

-- payouts: only owner/admin pay people; sales see commission paid to themselves
select pg_temp.policy('payouts_select', 'payouts', 'select',
  'public.is_manager() or (public.is_staff() and type = ''commission'' and staff_id = public.staff_id())', null);
select pg_temp.policy('payouts_insert', 'payouts', 'insert', null, 'public.is_manager() and not void');
select pg_temp.policy('payouts_update', 'payouts', 'update', 'public.is_manager()', 'public.is_manager()');

-- bank matches: status visible for entries you can see
select pg_temp.policy('bank_matches_select', 'bank_matches', 'select',
  'public.is_manager() or (client_payment_id is not null and public.can_see_payment(client_payment_id)) or (payout_id is not null and exists (select 1 from public.payouts o where o.id = payout_id))',
  null);

-- teachers: base table (pay, bank, phone, private notes) for owner/admin only;
-- everyone else uses public.teachers_public
select pg_temp.policy('teachers_select', 'teachers', 'select', 'public.is_manager()', null);

-- enquiries and invoices
select pg_temp.policy('inquiries_staff_select', 'inquiries', 'select', 'public.is_manager()', null);
select pg_temp.policy('invoices_staff_select', 'invoices', 'select',
  'public.is_manager() or (student_id is not null and public.can_see_student(student_id))', null);
select pg_temp.policy('invoice_sends_select', 'invoice_sends', 'select', 'public.can_see_invoice(invoice_id)', null);
select pg_temp.policy('invoice_sends_insert', 'invoice_sends', 'insert', null,
  'public.is_staff() and public.can_see_invoice(invoice_id)');

-- activity log: managers see everything, sales only their own actions
select pg_temp.policy('audit_log_select', 'audit_log', 'select',
  'public.is_manager() or (public.is_staff() and actor = auth.uid())', null);

-- PostgREST: pick up new tables/columns
notify pgrst, 'reload schema';
