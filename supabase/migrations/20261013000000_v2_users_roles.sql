-- Family Loan Ledger v2 (part 1): username sign-in, configurable roles and permissions.
-- Replaces the fixed-role schema from the first migration (no production data existed).

-- Move the empty v1 objects out of the way (kept in schema legacy_v1, safe to drop later)
create schema if not exists legacy_v1;
alter table public.message_reads set schema legacy_v1;
alter table public.messages set schema legacy_v1;
alter table public.app_settings set schema legacy_v1;
alter table public.fund_transactions set schema legacy_v1;
alter table public.payments set schema legacy_v1;
alter table public.loan_attachments set schema legacy_v1;
alter table public.loan_collaterals set schema legacy_v1;
alter table public.loans set schema legacy_v1;
alter table public.bank_accounts set schema legacy_v1;
alter table public.borrower_documents set schema legacy_v1;
alter table public.borrowers set schema legacy_v1;
alter table public.profiles set schema legacy_v1;
alter type public.app_role set schema legacy_v1;
alter type public.borrower_tier set schema legacy_v1;
alter type public.borrower_status set schema legacy_v1;
alter type public.loan_status set schema legacy_v1;
alter type public.currency_code set schema legacy_v1;
alter type public.rate_basis set schema legacy_v1;
alter type public.pay_mode set schema legacy_v1;
alter type public.pay_method set schema legacy_v1;
alter function private.loans_guard() set schema legacy_v1;
alter function private.payments_guard() set schema legacy_v1;
alter function private.log_loan_event() set schema legacy_v1;
alter function private.log_payment() set schema legacy_v1;
alter function private.profiles_guard() set schema legacy_v1;
create or replace function private.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$ begin return new; end $$;

create type public.user_status as enum ('active', 'suspended', 'discharged');
create type public.borrower_tier as enum ('normal', 'silver', 'gold');
create type public.borrower_status as enum ('active', 'banned');
create type public.loan_status as enum ('requested', 'verified', 'approved', 'rejected');
create type public.currency_code as enum ('KHR', 'USD');
create type public.rate_basis as enum ('month', 'occurrence', 'contract');
create type public.pay_mode as enum ('equal', 'interest');
create type public.pay_method as enum ('cash', 'bank', 'other');

-- ------------------------------------------------------------ roles and users
create table public.roles (
  id text primary key,
  name text not null unique,
  description text not null default '',
  locked boolean not null default false,   -- locked roles (Admin) always hold every permission
  scoped boolean not null default false,   -- scoped roles only see loans they supervise
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id text not null references public.roles (id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name text not null,
  display_name text not null default '',
  gender text check (gender in ('F', 'M')),
  dob date,
  address text not null default '',
  photo_path text,
  role_id text not null references public.roles (id),
  status public.user_status not null default 'active',
  must_change_password boolean not null default true,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

-- every permission check goes through these helpers (security definer, so RLS
-- on profiles / roles does not recurse)
create function private.is_active() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create function private.has_perm(p text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.roles r on r.id = pr.role_id
    where pr.id = auth.uid() and pr.status = 'active'
      and (r.locked or exists (
        select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission = p))
  )
$$;

create function private.is_scoped() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select r.scoped and not r.locked
    from public.profiles pr join public.roles r on r.id = pr.role_id
    where pr.id = auth.uid()), false)
$$;

-- the storage policies from v1 still call is_staff(); it now means "active user"
create or replace function private.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$ select private.is_active() $$;

revoke all on function private.is_active(), private.has_perm(text), private.is_scoped() from public;
grant execute on function private.is_active(), private.has_perm(text), private.is_scoped() to authenticated;

insert into public.roles (id, name, description, locked, scoped) values
  ('admin', 'Admin', 'Full access to everything', true, false),
  ('verifier', 'Verifier', 'Checks borrowers and verifies loan requests', false, false),
  ('supervisor', 'Loan supervisor', 'Manages the loans assigned to them, and only those', false, true),
  ('collector', 'Collector', 'Records payments in the field', false, false);

insert into public.role_permissions (role_id, permission) values
  ('verifier', 'borrowers.view'), ('verifier', 'borrowers.edit'), ('verifier', 'loans.view'),
  ('verifier', 'loans.create'), ('verifier', 'loans.verify'), ('verifier', 'payments.view'),
  ('verifier', 'payments.record'), ('verifier', 'funds.view'), ('verifier', 'reports.view'),
  ('supervisor', 'borrowers.view'), ('supervisor', 'loans.view'), ('supervisor', 'loans.create'),
  ('supervisor', 'loans.verify'), ('supervisor', 'payments.view'), ('supervisor', 'payments.record'),
  ('supervisor', 'reports.view'),
  ('collector', 'borrowers.view'), ('collector', 'loans.view'), ('collector', 'payments.view'),
  ('collector', 'payments.record');

-- profile edits. Server-side calls (edge function, no auth.uid()) are unrestricted.
-- Everyone edits their own personal details; only user managers change names,
-- usernames, roles and status, and never their own role or status.
create function private.profiles_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare mgr boolean; me boolean;
begin
  if auth.uid() is null then return new; end if;
  mgr := private.has_perm('users.manage');
  me := old.id = auth.uid();
  if not mgr then
    if not me then raise exception 'Not allowed'; end if;
    new.username := old.username; new.full_name := old.full_name;
    new.role_id := old.role_id; new.status := old.status;
  else
    if me then new.role_id := old.role_id; new.status := old.status; end if;
  end if;
  new.must_change_password := case when me and old.must_change_password and not new.must_change_password
    then false else old.must_change_password end;   -- only the owner clears it; only the edge function sets it
  new.id := old.id; new.created_at := old.created_at;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- locked roles (Admin) cannot be edited or deleted; permission rows follow the same rule
create function private.roles_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.locked then raise exception 'The Admin role cannot be deleted'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.locked then
    new.id := old.id; new.locked := true; new.scoped := false; new.name := old.name;
  end if;
  if tg_op = 'INSERT' then new.locked := false; end if;
  return new;
end $$;
create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function private.roles_guard();

create function private.role_perms_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (select locked from public.roles where id = coalesce(new.role_id, old.role_id)) then
    raise exception 'The Admin role always has every permission';
  end if;
  return coalesce(new, old);
end $$;
create trigger role_perms_guard before insert or update or delete on public.role_permissions
  for each row execute function private.role_perms_guard();

-- ---------------------------------------------------------------------- RLS
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

create policy roles_select on public.roles for select to authenticated using (private.is_active());
create policy roles_write on public.roles for all to authenticated
  using (private.has_perm('users.manage')) with check (private.has_perm('users.manage'));
create policy role_perms_select on public.role_permissions for select to authenticated using (private.is_active());
create policy role_perms_write on public.role_permissions for all to authenticated
  using (private.has_perm('users.manage')) with check (private.has_perm('users.manage'));

-- a user always reads their own profile (even when suspended, so the app can say why)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_active());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.has_perm('users.manage'))
  with check (id = (select auth.uid()) or private.has_perm('users.manage'));

