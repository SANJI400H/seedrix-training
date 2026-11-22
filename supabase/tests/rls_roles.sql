-- RLS role tests for the staff portal (002 + 003).
-- Run against a database with the migrations applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_roles.sql
-- Everything happens inside one transaction that is rolled back.
-- Each check raises an exception on failure, so a clean run means all passed.

\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------- fixtures
create temp table t_ids (k text primary key, id uuid);
grant all on t_ids to authenticated;

do $$
declare
  u_owner uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid();
  u_s1 uuid := gen_random_uuid(); u_s2 uuid := gen_random_uuid();
  s_owner uuid; s_admin uuid; s_s1 uuid; s_s2 uuid;
  st1 uuid; st2 uuid; t1 uuid; p1 uuid; p2 uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (u_owner, 'rls-owner@test.local', 'authenticated', 'authenticated'),
    (u_admin, 'rls-admin@test.local', 'authenticated', 'authenticated'),
    (u_s1, 'rls-s1@test.local', 'authenticated', 'authenticated'),
    (u_s2, 'rls-s2@test.local', 'authenticated', 'authenticated');
  insert into public.staff (user_id, full_name, role) values (u_owner, 'RLS Owner', 'owner') returning id into s_owner;
  insert into public.staff (user_id, full_name, role) values (u_admin, 'RLS Admin', 'admin') returning id into s_admin;
  insert into public.staff (user_id, full_name, role) values (u_s1, 'RLS Sales One', 'sales') returning id into s_s1;
  insert into public.staff (user_id, full_name, role) values (u_s2, 'RLS Sales Two', 'sales') returning id into s_s2;

  insert into public.leads (name, source, assigned_rep_id) values ('RLS-TEST lead S1', 'other', s_s1);
  insert into public.leads (name, source, assigned_rep_id) values ('RLS-TEST lead S2', 'other', s_s2);
  insert into public.leads (name, source) values ('RLS-TEST lead unassigned', 'other');

  insert into public.students (name, agreed_fee, rep_id) values ('RLS-TEST student S1', 1700, s_s1) returning id into st1;
  insert into public.students (name, agreed_fee, rep_id) values ('RLS-TEST student S2', 1500, s_s2) returning id into st2;
  insert into public.teachers (name, rate_aed, phone, iban, notes) values ('RLS-TEST teacher', 120, '+971500000001', 'AE00TEST', 'private') returning id into t1;
  insert into public.client_payments (paid_on, student_id, amount, teacher_share, rep_id) values ('2026-10-01', st1, 850, 350, s_s1) returning id into p1;
  insert into public.client_payments (paid_on, student_id, amount, teacher_share, rep_id) values ('2026-10-01', st2, 600, 200, s_s2) returning id into p2;
  insert into public.payouts (paid_on, type, payee, staff_id, amount, client_payment_id) values ('2026-10-02', 'commission', 'RLS Sales One', s_s1, 100, p1);
  insert into public.payouts (paid_on, type, payee, staff_id, amount, client_payment_id) values ('2026-10-02', 'commission', 'RLS Sales Two', s_s2, 100, p2);
  insert into public.payouts (paid_on, type, payee, teacher_id, amount, client_payment_id) values ('2026-10-02', 'teacher', 'RLS-TEST teacher', t1, 350, p1);
  insert into public.bank_lines (booked_on, ref, description, amount) values ('2026-10-01', 'RLS-TEST-REF-1', 'From RLS', 850);

  insert into t_ids values ('u_owner', u_owner), ('u_admin', u_admin), ('u_s1', u_s1), ('u_s2', u_s2),
    ('s_s1', s_s1), ('s_s2', s_s2), ('st1', st1), ('st2', st2), ('t1', t1), ('p1', p1), ('p2', p2);
end $$;

create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from t_ids where t_ids.k = act_as.k;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'RLS TEST FAILED: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

-- ---------------------------------------------------------------- sales 1
select pg_temp.act_as('u_s1');
select pg_temp.check((select count(*) from public.leads where name like 'RLS-TEST%') = 1, 'sales sees only their own leads');
select pg_temp.check(not exists (select 1 from public.leads where name in ('RLS-TEST lead S2', 'RLS-TEST lead unassigned')), 'sales cannot see another rep''s or unassigned leads');
select pg_temp.check((select count(*) from public.students where name like 'RLS-TEST%') = 1, 'sales sees only their own students');
select pg_temp.check(not exists (select 1 from public.client_payments where id = (select id from t_ids where k = 'p2')), 'sales cannot read another rep''s payments');
select pg_temp.check(exists (select 1 from public.client_payments where id = (select id from t_ids where k = 'p1')), 'sales reads payments for their students');
select pg_temp.check((select count(*) from public.teachers) = 0, 'sales cannot read the teachers base table (rates, bank, phone)');
select pg_temp.check(exists (select 1 from public.teachers_public where name = 'RLS-TEST teacher'), 'sales can read the safe teacher directory');
select pg_temp.check(not exists (select 1 from information_schema.columns where table_name = 'teachers_public' and column_name in ('rate_aed', 'iban', 'phone', 'email', 'notes', 'bank_name')), 'teachers_public has no pay/bank/contact/private columns');
select pg_temp.check((select count(*) from public.bank_lines) = 0, 'sales cannot read bank_lines');
select pg_temp.check((select count(*) from public.payouts where payee like 'RLS%') = 1
  and (select payee from public.payouts where payee like 'RLS%') = 'RLS Sales One', 'sales sees only commission paid to themselves');

do $$ begin
  insert into public.payouts (paid_on, type, payee, amount) values ('2026-10-03', 'other', 'x', 1);
  raise exception 'RLS TEST FAILED: sales inserted a payout';
exception when insufficient_privilege then raise notice 'ok: sales cannot insert payouts';
end $$;

do $$ begin
  insert into public.client_payments (paid_on, student_id, amount, teacher_share) values ('2026-10-03', (select id from t_ids where k = 'st2'), 10, 0);
  raise exception 'RLS TEST FAILED: sales recorded a payment for another rep''s student';
exception when insufficient_privilege then raise notice 'ok: sales cannot record payments for other reps'' students';
end $$;

insert into public.client_payments (paid_on, student_id, amount, teacher_share, rep_id)
  values ('2026-10-03', (select id from t_ids where k = 'st1'), 100, 0, (select id from t_ids where k = 's_s2'));
select pg_temp.check((select rep_id from public.client_payments where student_id = (select id from t_ids where k = 'st1') and amount = 100)
  = (select id from t_ids where k = 's_s1'), 'commission on a sales-recorded payment always goes to that rep');

insert into public.leads (name, source) values ('RLS-TEST created by S1', 'referral');
select pg_temp.check((select assigned_rep_id from public.leads where name = 'RLS-TEST created by S1') = (select id from t_ids where k = 's_s1'), 'leads created by sales are auto-assigned to them');

do $$
declare n int;
begin
  update public.leads set stage = 'contacted' where name = 'RLS-TEST lead S2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS TEST FAILED: sales updated another rep''s lead'; end if;
  raise notice 'ok: sales cannot update another rep''s lead';
end $$;

do $$ begin
  update public.leads set assigned_rep_id = (select id from t_ids where k = 's_s2') where name = 'RLS-TEST lead S1';
  raise exception 'RLS TEST FAILED: sales re-assigned a lead to someone else';
exception when insufficient_privilege then raise notice 'ok: sales cannot hand a lead to another rep';
end $$;

select pg_temp.check((select count(*) from public.audit_log where actor is distinct from (select id from t_ids where k = 'u_s1')) = 0, 'sales only see their own activity');
select pg_temp.check((select count(*) from public.inquiries) = 0, 'sales cannot read raw website enquiries');

do $$ begin
  perform public.create_bill_invoice((select id from t_ids where k = 'st2'), 100, 'x', null);
  raise exception 'RLS TEST FAILED: sales invoiced another rep''s student';
exception when raise_exception then
  if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
  raise notice 'ok: sales cannot invoice another rep''s student';
end $$;
select pg_temp.check(public.create_bill_invoice((select id from t_ids where k = 'st1'), 900, 'Balance', null) is not null, 'sales can invoice their own student');

reset role;

-- ---------------------------------------------------------------- admin
select pg_temp.act_as('u_admin');
select pg_temp.check((select count(*) from public.leads where name like 'RLS-TEST%') = 4, 'admin sees all leads incl. unassigned');
select pg_temp.check((select rate_aed from public.teachers where name = 'RLS-TEST teacher') = 120, 'admin sees teacher rates');
select pg_temp.check((select count(*) from public.bank_lines where ref = 'RLS-TEST-REF-1') = 1, 'admin sees bank lines');
update public.leads set assigned_rep_id = (select id from t_ids where k = 's_s2') where name = 'RLS-TEST lead unassigned';
select pg_temp.check((select assigned_rep_id from public.leads where name = 'RLS-TEST lead unassigned') = (select id from t_ids where k = 's_s2'), 'admin can assign leads to reps');
insert into public.payouts (paid_on, type, payee, amount) values ('2026-10-03', 'other', 'RLS admin payout', 5);
select pg_temp.check(exists (select 1 from public.payouts where payee = 'RLS admin payout'), 'admin can record payouts');
do $$
declare n int;
begin
  update public.settings set sales_pct = 10;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS TEST FAILED: admin changed company settings'; end if;
  raise notice 'ok: admin cannot change company/split settings';
end $$;
do $$
declare n int;
begin
  update public.staff set role = 'owner' where full_name = 'RLS Sales One';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS TEST FAILED: admin changed a staff role'; end if;
  raise notice 'ok: admin cannot change staff roles';
end $$;
reset role;

-- ---------------------------------------------------------------- sales 2 after assignment
select pg_temp.act_as('u_s2');
select pg_temp.check((select count(*) from public.leads where name like 'RLS-TEST%') = 2, 'a lead assigned by the admin appears for the rep');
reset role;

-- ---------------------------------------------------------------- owner
select pg_temp.act_as('u_owner');
select pg_temp.check((select count(*) from public.leads where name like 'RLS-TEST%') = 4, 'owner sees everything');
do $$
declare n int;
begin
  update public.settings set vat_enabled = vat_enabled;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 1, 'owner can update settings');
end $$;
reset role;

-- ---------------------------------------------------------------- anon
set local role anon;
do $$ begin
  perform 1 from public.leads limit 1;
  raise exception 'RLS TEST FAILED: anon read leads';
exception when insufficient_privilege then raise notice 'ok: anon has no access';
end $$;
reset role;

rollback;
\echo 'RLS role tests: all passed'
