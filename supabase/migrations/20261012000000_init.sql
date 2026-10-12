-- Family Loan Ledger: initial schema, row level security and storage.
-- Roles: pending (no access), verifier (staff), admin (everything).

create schema if not exists private;
grant usage on schema private to authenticated;

create type public.app_role as enum ('pending', 'verifier', 'admin');
create type public.borrower_tier as enum ('normal', 'silver', 'gold');
create type public.borrower_status as enum ('active', 'banned');
create type public.loan_status as enum ('requested', 'verified', 'approved', 'rejected');
create type public.currency_code as enum ('KHR', 'USD');
create type public.rate_basis as enum ('month', 'occurrence', 'contract');
create type public.pay_mode as enum ('equal', 'interest');
create type public.pay_method as enum ('cash', 'bank', 'other');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role public.app_role not null default 'pending',
  phone text,
  telegram text,
  facebook text,
  id_no text,
  dob date,
  gender text check (gender in ('F', 'M')),
  address text,
  lat numeric,
  lng numeric,
  photo_path text,
  created_at timestamptz not null default now()
);

create function private.app_role() returns public.app_role
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending'::public.app_role)
$$;
create function private.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select private.app_role() in ('verifier', 'admin')
$$;
create function private.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select private.app_role() = 'admin'
$$;
revoke all on function private.app_role(), private.is_staff(), private.is_admin() from public;
grant execute on function private.app_role(), private.is_staff(), private.is_admin() to authenticated;

-- the very first person to sign up becomes the admin; everyone else waits for approval
create function private.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'pending'::public.app_role else 'admin'::public.app_role end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- borrowers
create table public.borrowers (
  id bigint generated always as identity primary key,
  name text not null,
  name_km text not null default '',
  gender text check (gender in ('F', 'M')),
  dob date,
  id_no text not null default '',
  address text not null default '',
  lat numeric,
  lng numeric,
  phone text not null default '',
  facebook text not null default '',
  telegram text not null default '',
  tier public.borrower_tier not null default 'normal',
  status public.borrower_status not null default 'active',
  note text not null default '',
  photo_path text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.borrower_documents (
  id bigint generated always as identity primary key,
  borrower_id bigint not null references public.borrowers (id) on delete cascade,
  title text not null,
  note text not null default '',
  file_path text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.borrower_documents (borrower_id);

-- ------------------------------------------------------------ bank accounts
create table public.bank_accounts (
  id bigint generated always as identity primary key,
  bank text not null,
  account_name text not null,
  account_no text not null,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- loans
create table public.loans (
  id bigint generated always as identity primary key,
  borrower_id bigint not null references public.borrowers (id),
  currency public.currency_code not null,
  amount numeric(14, 2) not null check (amount > 0),
  fee_pct numeric(5, 2) not null default 3 check (fee_pct >= 0 and fee_pct < 100),
  rate_pct numeric(6, 2) not null check (rate_pct >= 0),
  rate_basis public.rate_basis not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'custom')),
  interval_days int not null check (interval_days >= 1),
  occurrences int not null check (occurrences >= 1),
  mode public.pay_mode not null,
  release_date date not null,
  status public.loan_status not null default 'requested',
  pay_method public.pay_method not null default 'cash',
  bank_account_id bigint references public.bank_accounts (id),
  pay_remarks text not null default '',
  requested_by uuid default auth.uid() references public.profiles (id),
  verified_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  verified_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.loans (borrower_id);
create index on public.loans (status);

create table public.loan_collaterals (
  id bigint generated always as identity primary key,
  loan_id bigint not null references public.loans (id) on delete cascade,
  description text not null
);
create index on public.loan_collaterals (loan_id);

create table public.loan_attachments (
  id bigint generated always as identity primary key,
  loan_id bigint not null references public.loans (id) on delete cascade,
  collateral_id bigint references public.loan_collaterals (id) on delete cascade,
  file_path text not null,
  file_name text not null default ''
);
create index on public.loan_attachments (loan_id);

-- ----------------------------------------------------------------- payments
create table public.payments (
  id bigint generated always as identity primary key,
  loan_id bigint not null references public.loans (id),
  bank_account_id bigint references public.bank_accounts (id),
  amount numeric(14, 2) not null check (amount > 0),
  late_fee numeric(14, 2) not null default 0,
  paid_on date not null default current_date,
  photo_path text,
  note text not null default '',
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (late_fee >= 0 and late_fee <= amount)
);
create index on public.payments (loan_id);

-- -------------------------------------------------------------------- funds
create table public.fund_transactions (
  id bigint generated always as identity primary key,
  currency public.currency_code not null,
  amount numeric(14, 2) not null check (amount > 0),
  txn_date date not null default current_date,
  note text not null default '',
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  service_fee_pct numeric(5, 2) not null default 3,
  late_fee_khr numeric(14, 2) not null default 2000,
  late_fee_usd numeric(14, 2) not null default 0.5,
  khr_per_usd int not null default 4000
);
insert into public.app_settings (id) values (1);

-- ----------------------------------------------------------------- messages
create table public.messages (
  id bigint generated always as identity primary key,
  kind text not null,
  loan_id bigint references public.loans (id) on delete cascade,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.message_reads (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  primary key (message_id, user_id)
);

-- ----------------------------------------------------------------- guards
create function private.loans_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare r public.app_role := private.app_role();
begin
  if tg_op = 'INSERT' then
    if r not in ('verifier', 'admin') then raise exception 'Not allowed'; end if;
    if (select status from public.borrowers where id = new.borrower_id) = 'banned' then
      raise exception 'This borrower is banned';
    end if;
    new.status := 'requested';
    new.requested_by := auth.uid();
    new.verified_by := null; new.approved_by := null; new.verified_at := null; new.approved_at := null;
    return new;
  end if;

  new.requested_by := old.requested_by;
  new.verified_by := old.verified_by; new.verified_at := old.verified_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;

  if new.status is distinct from old.status then
    if old.status = 'requested' and new.status = 'verified' and r in ('verifier', 'admin') then
      new.verified_by := auth.uid(); new.verified_at := now();
    elsif old.status = 'verified' and new.status = 'approved' and r = 'admin' then
      new.approved_by := auth.uid(); new.approved_at := now();
    elsif old.status = 'requested' and new.status = 'rejected' and r in ('verifier', 'admin') then
      null;
    elsif old.status = 'verified' and new.status = 'rejected' and r = 'admin' then
      null;
    else
      raise exception 'This status change is not allowed';
    end if;
    -- terms cannot change in the same step as a status change
    new.borrower_id := old.borrower_id; new.currency := old.currency; new.amount := old.amount;
    new.fee_pct := old.fee_pct; new.rate_pct := old.rate_pct; new.rate_basis := old.rate_basis;
    new.frequency := old.frequency; new.interval_days := old.interval_days;
    new.occurrences := old.occurrences; new.mode := old.mode; new.release_date := old.release_date;
    new.pay_method := old.pay_method; new.bank_account_id := old.bank_account_id; new.pay_remarks := old.pay_remarks;
  elsif old.status <> 'requested' or r not in ('verifier', 'admin') then
    raise exception 'This loan can no longer be edited';
  end if;
  return new;
end $$;
create trigger loans_guard before insert or update on public.loans
  for each row execute function private.loans_guard();

create function private.payments_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not private.is_staff() then raise exception 'Not allowed'; end if;
  if (select status from public.loans where id = new.loan_id) <> 'approved' then
    raise exception 'Payments can only be recorded on approved loans';
  end if;
  new.created_by := auth.uid();
  return new;
end $$;
create trigger payments_guard before insert on public.payments
  for each row execute function private.payments_guard();

create function private.log_loan_event() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.messages (kind, loan_id, actor) values ('requested', new.id, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.messages (kind, loan_id, actor) values (new.status::text, new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger loans_log after insert or update on public.loans
  for each row execute function private.log_loan_event();

create function private.log_payment() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (kind, loan_id, actor) values ('payment', new.loan_id, auth.uid());
  return new;
end $$;
create trigger payments_log after insert on public.payments
  for each row execute function private.log_payment();

-- profile edits: people change their own details, only admins change roles
create function private.profiles_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not private.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  if new.role is distinct from old.role and old.id = auth.uid() and new.role <> 'admin' then
    raise exception 'You cannot remove your own admin role';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- ---------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.borrowers enable row level security;
alter table public.borrower_documents enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.loans enable row level security;
alter table public.loan_collaterals enable row level security;
alter table public.loan_attachments enable row level security;
alter table public.payments enable row level security;
alter table public.fund_transactions enable row level security;
alter table public.app_settings enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy borrowers_select on public.borrowers for select to authenticated using (private.is_staff());
create policy borrowers_insert on public.borrowers for insert to authenticated with check (private.is_staff());
create policy borrowers_update on public.borrowers for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy borrowers_delete on public.borrowers for delete to authenticated using (private.is_admin());

create policy docs_all on public.borrower_documents for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy banks_select on public.bank_accounts for select to authenticated using (private.is_staff());
create policy banks_write on public.bank_accounts for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy loans_select on public.loans for select to authenticated using (private.is_staff());
create policy loans_insert on public.loans for insert to authenticated with check (private.is_staff());
create policy loans_update on public.loans for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy loans_delete on public.loans for delete to authenticated
  using (private.is_admin() and status in ('requested', 'rejected'));

create policy collaterals_all on public.loan_collaterals for all to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy attachments_all on public.loan_attachments for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy payments_select on public.payments for select to authenticated using (private.is_staff());
create policy payments_insert on public.payments for insert to authenticated with check (private.is_staff());
create policy payments_delete on public.payments for delete to authenticated using (private.is_admin());

create policy funds_select on public.fund_transactions for select to authenticated using (private.is_staff());
create policy funds_insert on public.fund_transactions for insert to authenticated with check (private.is_admin());
create policy funds_delete on public.fund_transactions for delete to authenticated using (private.is_admin());

create policy settings_select on public.app_settings for select to authenticated using (private.is_staff());
create policy settings_update on public.app_settings for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy messages_select on public.messages for select to authenticated using (private.is_staff());
create policy reads_select on public.message_reads for select to authenticated using (user_id = (select auth.uid()));
create policy reads_insert on public.message_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_staff());

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and private.is_staff());
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and private.is_staff());
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and private.is_staff());
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and private.is_staff());
