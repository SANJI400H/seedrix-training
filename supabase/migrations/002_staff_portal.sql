-- Seedrix Training — staff portal (CRM + finance ledger)
-- Apply AFTER 001_init.sql, in the Supabase SQL editor. Safe to re-run.
--
-- Security model
--   * Staff sign in with Supabase Auth. public.staff maps auth users to a role
--     (owner | admin | sales). public.staff_role() returns the caller's role.
--   * Every portal table has RLS. Nothing is hard-deleted: there are no DELETE
--     policies. Money rows are voided with a reason instead.
--   * public.audit_log is written ONLY by triggers. Nobody (not even the
--     service role) may UPDATE, DELETE or INSERT it directly.
--   * The public website keeps using the service role for inquiries/invoices.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerations (as check constraints so re-running is easy)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text,
  full_name text not null,
  role text not null default 'sales' check (role in ('owner', 'admin', 'sales')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists staff_email_key on public.staff (lower(email)) where email is not null;

-- Role of the signed-in user, or null when they are not active staff.
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.role from public.staff s
  where s.user_id = auth.uid() and s.active
  limit 1;
$$;

create or replace function public.staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.staff s
  where s.user_id = auth.uid() and s.active
  limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.staff_role() is not null; $$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.staff_role() in ('owner', 'admin'), false); $$;

revoke all on function public.staff_role() from public, anon;
revoke all on function public.staff_id() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.staff_role() to authenticated, service_role;
grant execute on function public.staff_id() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_manager() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id boolean primary key default true check (id),
  sales_pct numeric(5, 2) not null default 80 check (sales_pct >= 0 and sales_pct <= 100),
  company_name text not null default 'Seedrix LLC',
  trade_name text not null default 'Seedrix Learning',
  address text not null default 'Shams Free Zone, Sharjah, UAE',
  license_no text not null default '2648158.01',
  bank_name text not null default 'Wio Bank',
  iban text not null default '',
  trn text not null default '',
  invoice_footer text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- teachers
-- ---------------------------------------------------------------------------
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  nationality text,
  emirate text,
  subjects text,
  rate_aed numeric(12, 2),
  rate_note text,
  notes text,
  active boolean not null default true,
  import_ref text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists teachers_name_idx on public.teachers (lower(name));
-- full (non-partial) unique index so PostgREST upserts can use on_conflict=import_ref; NULLs stay distinct
create unique index if not exists teachers_import_ref_key on public.teachers (import_ref);

-- ---------------------------------------------------------------------------
-- leads + notes
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  source text not null default 'other'
    check (source in ('website', 'social', 'iEnglish', 'referral', 'walk-in', 'other')),
  emirate text,
  interest text,
  child_grades text,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'trial_booked', 'trial_done', 'enrolled', 'lost')),
  assigned_rep_id uuid references public.staff (id),
  next_follow_up date,
  lost_reason text,
  inquiry_id uuid references public.inquiries (id),
  first_contact_on date,
  import_ref text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists leads_inquiry_id_key on public.leads (inquiry_id) where inquiry_id is not null;
create unique index if not exists leads_import_ref_key on public.leads (import_ref);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_follow_up_idx on public.leads (next_follow_up);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  body text not null check (length(trim(body)) > 0),
  kind text not null default 'note' check (kind in ('note', 'stage', 'import', 'system')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists lead_notes_lead_idx on public.lead_notes (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id),
  name text not null,
  phone text,
  payer_name text,
  rep_id uuid references public.staff (id),
  teacher_id uuid references public.teachers (id),
  course text,
  agreed_fee numeric(12, 2) not null default 0 check (agreed_fee >= 0),
  schedule text,
  start_date date,
  next_payment_amount numeric(12, 2),
  next_payment_date date,
  status text not null default 'active'
    check (status in ('active', 'paused', 'finished', 'cancelled', 'archived')),
  notes text,
  import_ref text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists students_import_ref_key on public.students (import_ref);
create index if not exists students_name_idx on public.students (lower(name));

-- ---------------------------------------------------------------------------
-- client payments (money in)
-- ---------------------------------------------------------------------------
create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  paid_on date not null,
  student_id uuid not null references public.students (id),
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'card', 'cash', 'staff')),
  received_by_staff_id uuid references public.staff (id),
  payer_name text,
  bank_ref text,
  rep_id uuid references public.staff (id),
  teacher_share numeric(12, 2) not null default 0 check (teacher_share >= 0),
  sales_pct numeric(5, 2) not null default 80,
  commission numeric(12, 2) not null default 0,
  academy numeric(12, 2) not null default 0,
  invoice_id uuid references public.invoices (id),
  note text,
  duplicate_confirmed boolean not null default false,
  overpay_confirmed boolean not null default false,
  void boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint client_payments_teacher_le_amount check (teacher_share <= amount),
  constraint client_payments_void_reason check (not void or length(trim(coalesce(void_reason, ''))) > 0)
);
create index if not exists client_payments_student_idx on public.client_payments (student_id);
create index if not exists client_payments_paid_on_idx on public.client_payments (paid_on desc);

-- ---------------------------------------------------------------------------
-- payouts (money out)
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  paid_on date not null,
  type text not null check (type in ('teacher', 'commission', 'refund', 'other')),
  payee text not null,
  teacher_id uuid references public.teachers (id),
  staff_id uuid references public.staff (id),
  amount numeric(12, 2) not null check (amount > 0),
  client_payment_id uuid references public.client_payments (id),
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'card', 'cash', 'staff')),
  note text,
  overpay_confirmed boolean not null default false,
  void boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint payouts_void_reason check (not void or length(trim(coalesce(void_reason, ''))) > 0)
);
create index if not exists payouts_payment_idx on public.payouts (client_payment_id);
create index if not exists payouts_paid_on_idx on public.payouts (paid_on desc);

-- ---------------------------------------------------------------------------
-- bank statement lines + matches
-- ---------------------------------------------------------------------------
create table if not exists public.bank_lines (
  id uuid primary key default gen_random_uuid(),
  booked_on date not null,
  ref text not null unique,
  txn_type text,
  description text,
  amount numeric(12, 2) not null,
  balance numeric(12, 2),
  original_ref text,
  notes text,
  raw jsonb,
  ignored boolean not null default false,
  ignored_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists bank_lines_booked_on_idx on public.bank_lines (booked_on desc);

create table if not exists public.bank_matches (
  id uuid primary key default gen_random_uuid(),
  bank_line_id uuid references public.bank_lines (id),
  manual_date date,
  manual_amount numeric(12, 2),
  manual_ref text,
  client_payment_id uuid references public.client_payments (id),
  payout_id uuid references public.payouts (id),
  matched_amount numeric(12, 2) not null,
  matched_by uuid,
  matched_at timestamptz not null default now(),
  unmatched_at timestamptz,
  unmatched_by uuid,
  unmatch_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint bank_matches_one_entry check (num_nonnulls(client_payment_id, payout_id) = 1),
  constraint bank_matches_has_evidence check (bank_line_id is not null or (manual_date is not null and manual_amount is not null))
);
create unique index if not exists bank_matches_active_payment_key
  on public.bank_matches (client_payment_id) where unmatched_at is null and client_payment_id is not null;
create unique index if not exists bank_matches_active_payout_key
  on public.bank_matches (payout_id) where unmatched_at is null and payout_id is not null;
create index if not exists bank_matches_line_idx on public.bank_matches (bank_line_id);

-- ---------------------------------------------------------------------------
-- audit log (tamper-proof: triggers only)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_role text,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid text;
begin
  if tg_op = 'DELETE' then
    rid := (to_jsonb(old) ->> 'id');
  else
    rid := (to_jsonb(new) ->> 'id');
  end if;
  insert into public.audit_log (actor, actor_role, action, table_name, row_id, before, after)
  values (
    auth.uid(),
    coalesce(nullif(auth.role(), ''), current_user),
    lower(tg_op),
    tg_table_name,
    rid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- row metadata: who created / last changed a row (cannot be forged)
-- ---------------------------------------------------------------------------
create or replace function public.set_row_meta()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Money split. Computed in the database so it can't be typed in by hand.
-- commission = round((amount - teacher_share) * sales_pct / 100, 2)
-- academy    = amount - teacher_share - commission
-- sales_pct is copied from settings on insert and kept on update, so later
-- setting changes never rewrite history.
create or replace function public.client_payment_split()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select s.sales_pct into new.sales_pct from public.settings s where s.id;
    new.sales_pct := coalesce(new.sales_pct, 80);
  else
    new.sales_pct := old.sales_pct;
    new.invoice_id := coalesce(old.invoice_id, new.invoice_id);
  end if;
  if new.teacher_share > new.amount then
    raise exception 'Teacher share (%) cannot exceed the payment amount (%)', new.teacher_share, new.amount;
  end if;
  new.commission := round((new.amount - new.teacher_share) * new.sales_pct / 100, 2);
  new.academy := new.amount - new.teacher_share - new.commission;
  return new;
end;
$$;

-- Voiding: stamp who/when; un-voiding is managers only.
create or replace function public.stamp_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.void and auth.uid() is not null and not public.is_manager() then
      raise exception 'Voided entries can only be changed by the owner or an admin';
    end if;
    if new.void and not old.void then
      new.voided_at := now();
      new.voided_by := auth.uid();
    elsif not new.void and old.void then
      if auth.uid() is not null and not public.is_manager() then
        raise exception 'Only the owner or an admin can restore a voided entry';
      end if;
      new.voided_at := null;
      new.voided_by := null;
      new.void_reason := null;
    else
      new.voided_at := old.voided_at;
      new.voided_by := old.voided_by;
    end if;
  elsif new.void then
    raise exception 'New entries cannot be created as void';
  end if;
  return new;
end;
$$;

create or replace function public.bank_match_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.matched_at := now();
    new.matched_by := coalesce(auth.uid(), new.matched_by);
    new.unmatched_at := null;
    new.unmatched_by := null;
  else
    -- only the unmatch fields may change after a match is made
    new.bank_line_id := old.bank_line_id;
    new.manual_date := old.manual_date;
    new.manual_amount := old.manual_amount;
    new.manual_ref := old.manual_ref;
    new.client_payment_id := old.client_payment_id;
    new.payout_id := old.payout_id;
    new.matched_amount := old.matched_amount;
    new.matched_by := old.matched_by;
    new.matched_at := old.matched_at;
    if old.unmatched_at is not null then
      raise exception 'This match was already removed';
    end if;
    if new.unmatched_at is not null then
      new.unmatched_at := now();
      new.unmatched_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

-- Staff: only the owner may change roles; nobody can demote the last owner.
create or replace function public.staff_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(public.staff_role(), '') <> 'owner' then
    if tg_op = 'INSERT' or new.role is distinct from old.role or new.active is distinct from old.active
       or new.user_id is distinct from old.user_id then
      raise exception 'Only the owner can manage staff';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and (new.role <> 'owner' or not new.active) then
    if (select count(*) from public.staff where role = 'owner' and active and id <> old.id) = 0 then
      raise exception 'There must always be at least one active owner';
    end if;
  end if;
  return new;
end;
$$;

-- Attach triggers ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['staff', 'settings', 'teachers', 'leads', 'lead_notes', 'students',
                           'client_payments', 'payouts', 'bank_lines', 'bank_matches'] loop
    execute format('drop trigger if exists %I_meta on public.%I', t, t);
    execute format('create trigger %I_meta before insert or update on public.%I for each row execute function public.set_row_meta()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
  -- existing tables from 001: audit them too (no meta columns there)
  foreach t in array array['inquiries', 'invoices'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end;
$$;

drop trigger if exists client_payments_split on public.client_payments;
create trigger client_payments_split
  before insert or update on public.client_payments
  for each row execute function public.client_payment_split();

drop trigger if exists client_payments_void on public.client_payments;
create trigger client_payments_void
  before insert or update on public.client_payments
  for each row execute function public.stamp_void();

drop trigger if exists payouts_void on public.payouts;
create trigger payouts_void
  before insert or update on public.payouts
  for each row execute function public.stamp_void();

drop trigger if exists bank_matches_meta2 on public.bank_matches;
create trigger bank_matches_meta2
  before insert or update on public.bank_matches
  for each row execute function public.bank_match_meta();

drop trigger if exists staff_guard on public.staff;
create trigger staff_guard
  before insert or update on public.staff
  for each row execute function public.staff_guard();

-- ---------------------------------------------------------------------------
-- Website enquiries -> leads (automatic + one-off backfill)
-- ---------------------------------------------------------------------------
create or replace function public.lead_from_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leads (name, phone, email, source, emirate, interest, stage, inquiry_id, first_contact_on)
  values (
    new.full_name, new.mobile, new.email, 'website', new.emirate,
    new.service || coalesce(' (' || new.delivery_mode || ')', ''),
    'new', new.id, (new.created_at at time zone 'Asia/Dubai')::date
  )
  on conflict (inquiry_id) where inquiry_id is not null do nothing;
  return null;
end;
$$;

drop trigger if exists inquiries_to_leads on public.inquiries;
create trigger inquiries_to_leads
  after insert on public.inquiries
  for each row execute function public.lead_from_inquiry();

insert into public.leads (name, phone, email, source, emirate, interest, stage, inquiry_id, first_contact_on, created_at)
select i.full_name, i.mobile, i.email, 'website', i.emirate,
       i.service || coalesce(' (' || i.delivery_mode || ')', ''),
       'new', i.id, (i.created_at at time zone 'Asia/Dubai')::date, i.created_at
from public.inquiries i
where not exists (select 1 from public.leads l where l.inquiry_id = i.id);

-- ---------------------------------------------------------------------------
-- Invoice for a client payment (uses the existing invoices table + sequence)
-- ---------------------------------------------------------------------------
create or replace function public.create_payment_invoice(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.client_payments;
  st public.students;
  rep_name text;
  inv_id uuid;
begin
  if not public.is_staff() and auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  select * into p from public.client_payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if p.invoice_id is not null then return p.invoice_id; end if;
  if p.void then raise exception 'Cannot invoice a voided payment'; end if;
  select * into st from public.students where id = p.student_id;
  select full_name into rep_name from public.staff where id = p.rep_id;

  insert into public.invoices (
    invoice_number, locale, path, status, service, description,
    amount_aed, vat_aed, total_aed, client_name, client_mobile,
    recruit_name, paid_at, payment_method
  ) values (
    public.next_invoice_number(), 'en', 'quoted', 'paid',
    coalesce(nullif(st.course, ''), 'Tuition'),
    nullif(p.note, ''),
    p.amount, 0, p.amount,
    coalesce(nullif(p.payer_name, ''), st.name),
    coalesce(nullif(st.phone, ''), '-'),
    rep_name,
    (p.paid_on::timestamp at time zone 'Asia/Dubai'),
    p.method
  ) returning id into inv_id;

  update public.client_payments set invoice_id = inv_id where id = p_payment_id;
  return inv_id;
end;
$$;
revoke all on function public.create_payment_invoice(uuid) from public, anon;
grant execute on function public.create_payment_invoice(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.staff enable row level security;
alter table public.settings enable row level security;
alter table public.teachers enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.students enable row level security;
alter table public.client_payments enable row level security;
alter table public.payouts enable row level security;
alter table public.bank_lines enable row level security;
alter table public.bank_matches enable row level security;
alter table public.audit_log enable row level security;

grant select, insert, update on public.staff, public.settings, public.teachers, public.leads,
  public.lead_notes, public.students, public.client_payments, public.payouts,
  public.bank_lines, public.bank_matches to authenticated;
revoke delete, truncate on public.staff, public.settings, public.teachers, public.leads,
  public.lead_notes, public.students, public.client_payments, public.payouts,
  public.bank_lines, public.bank_matches from authenticated, anon;
-- the portal is never used signed-out: no table privileges at all for anon
revoke all on public.staff, public.settings, public.teachers, public.leads,
  public.lead_notes, public.students, public.client_payments, public.payouts,
  public.bank_lines, public.bank_matches, public.audit_log from anon;

-- helper to (re)create a policy
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

-- staff: everyone on staff can see the team; only the owner can change it
select pg_temp.policy('staff_select', 'staff', 'select', 'public.is_staff()', null);
select pg_temp.policy('staff_insert', 'staff', 'insert', null, 'public.staff_role() = ''owner''');
select pg_temp.policy('staff_update', 'staff', 'update', 'public.staff_role() = ''owner''', 'public.staff_role() = ''owner''');

-- settings: staff read, owner writes
select pg_temp.policy('settings_select', 'settings', 'select', 'public.is_staff()', null);
select pg_temp.policy('settings_update', 'settings', 'update', 'public.staff_role() = ''owner''', 'public.staff_role() = ''owner''');

-- teachers: staff read, managers write
select pg_temp.policy('teachers_select', 'teachers', 'select', 'public.is_staff()', null);
select pg_temp.policy('teachers_insert', 'teachers', 'insert', null, 'public.is_manager()');
select pg_temp.policy('teachers_update', 'teachers', 'update', 'public.is_manager()', 'public.is_manager()');

-- leads, notes, students: the whole (small) team works on them
select pg_temp.policy('leads_select', 'leads', 'select', 'public.is_staff()', null);
select pg_temp.policy('leads_insert', 'leads', 'insert', null, 'public.is_staff()');
select pg_temp.policy('leads_update', 'leads', 'update', 'public.is_staff()', 'public.is_staff()');
select pg_temp.policy('lead_notes_select', 'lead_notes', 'select', 'public.is_staff()', null);
select pg_temp.policy('lead_notes_insert', 'lead_notes', 'insert', null, 'public.is_staff()');
select pg_temp.policy('students_select', 'students', 'select', 'public.is_staff()', null);
select pg_temp.policy('students_insert', 'students', 'insert', null, 'public.is_staff()');
select pg_temp.policy('students_update', 'students', 'update', 'public.is_staff()', 'public.is_staff()');

-- money: staff record; sales cannot touch someone else's voided entry
select pg_temp.policy('client_payments_select', 'client_payments', 'select', 'public.is_staff()', null);
select pg_temp.policy('client_payments_insert', 'client_payments', 'insert', null, 'public.is_staff() and not void');
select pg_temp.policy('client_payments_update', 'client_payments', 'update',
  'public.is_manager() or (public.is_staff() and (not void or created_by = auth.uid()))',
  'public.is_staff()');
select pg_temp.policy('payouts_select', 'payouts', 'select', 'public.is_staff()', null);
select pg_temp.policy('payouts_insert', 'payouts', 'insert', null, 'public.is_staff() and not void');
select pg_temp.policy('payouts_update', 'payouts', 'update',
  'public.is_manager() or (public.is_staff() and (not void or created_by = auth.uid()))',
  'public.is_staff()');

-- bank: owner/admin only (sales can see whether their entry is matched)
select pg_temp.policy('bank_lines_select', 'bank_lines', 'select', 'public.is_manager()', null);
select pg_temp.policy('bank_lines_insert', 'bank_lines', 'insert', null, 'public.is_manager()');
select pg_temp.policy('bank_lines_update', 'bank_lines', 'update', 'public.is_manager()', 'public.is_manager()');
select pg_temp.policy('bank_matches_select', 'bank_matches', 'select', 'public.is_staff()', null);
select pg_temp.policy('bank_matches_insert', 'bank_matches', 'insert', null, 'public.is_manager()');
select pg_temp.policy('bank_matches_update', 'bank_matches', 'update', 'public.is_manager()', 'public.is_manager()');

-- audit log: read-only for staff
select pg_temp.policy('audit_log_select', 'audit_log', 'select', 'public.is_staff()', null);

-- existing tables: staff may read enquiries and invoices (writes stay service-role / functions)
select pg_temp.policy('inquiries_staff_select', 'inquiries', 'select', 'public.is_staff()', null);
select pg_temp.policy('invoices_staff_select', 'invoices', 'select', 'public.is_staff()', null);
grant select on public.inquiries, public.invoices to authenticated;
