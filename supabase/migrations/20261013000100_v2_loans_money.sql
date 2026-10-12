-- Family Loan Ledger v2 (part 2): borrowers, loans (with supervisor and per-contract late fee),
-- payments, funds, messages, guards and row level security.

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
create index on public.borrower_documents (created_by);

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
  supervisor_id uuid references public.profiles (id),
  currency public.currency_code not null,
  amount numeric(14, 2) not null check (amount > 0),
  fee_pct numeric(5, 2) not null default 3 check (fee_pct >= 0 and fee_pct < 100),
  late_fee_per_day numeric(14, 2) not null default 0 check (late_fee_per_day >= 0),
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
create index on public.loans (supervisor_id);
create index on public.loans (requested_by);
create index on public.loans (verified_by);
create index on public.loans (approved_by);
create index on public.loans (bank_account_id);

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
create index on public.loan_attachments (collateral_id);

-- true when the signed-in user may see this loan (scoped roles: only their own)
create function private.can_see_loan(lid bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select private.has_perm('loans.view') and exists (
    select 1 from public.loans l
    where l.id = lid and (not private.is_scoped() or l.supervisor_id = auth.uid()))
$$;
revoke all on function private.can_see_loan(bigint) from public;
grant execute on function private.can_see_loan(bigint) to authenticated;

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
create index on public.payments (bank_account_id);
create index on public.payments (created_by);

create table public.fund_transactions (
  id bigint generated always as identity primary key,
  kind text not null default 'add' check (kind in ('add', 'withdraw')),
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

-- ------------------------------------------------------------------ guards
-- loans: terms are editable only while "requested"; status moves
-- requested -> verified -> approved, each step needs its own permission
create function private.loans_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not private.has_perm('loans.create') then raise exception 'Not allowed'; end if;
    if (select status from public.borrowers where id = new.borrower_id) = 'banned' then
      raise exception 'This borrower is banned';
    end if;
    new.status := 'requested';
    new.requested_by := auth.uid();
    new.verified_by := null; new.approved_by := null; new.verified_at := null; new.approved_at := null;
    if private.is_scoped() then new.supervisor_id := auth.uid(); end if;
    return new;
  end if;

  new.requested_by := old.requested_by;
  new.verified_by := old.verified_by; new.verified_at := old.verified_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  if private.is_scoped() or not private.has_perm('loans.verify') then
    new.supervisor_id := old.supervisor_id;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'requested' and new.status = 'verified' and private.has_perm('loans.verify') then
      new.verified_by := auth.uid(); new.verified_at := now();
    elsif old.status = 'verified' and new.status = 'approved' and private.has_perm('loans.approve') then
      new.approved_by := auth.uid(); new.approved_at := now();
    elsif old.status = 'requested' and new.status = 'rejected' and private.has_perm('loans.verify') then
      null;
    elsif old.status = 'verified' and new.status = 'rejected' and private.has_perm('loans.approve') then
      null;
    else
      raise exception 'This status change is not allowed';
    end if;
    new.borrower_id := old.borrower_id; new.currency := old.currency; new.amount := old.amount;
    new.fee_pct := old.fee_pct; new.late_fee_per_day := old.late_fee_per_day;
    new.rate_pct := old.rate_pct; new.rate_basis := old.rate_basis;
    new.frequency := old.frequency; new.interval_days := old.interval_days;
    new.occurrences := old.occurrences; new.mode := old.mode; new.release_date := old.release_date;
    new.pay_method := old.pay_method; new.bank_account_id := old.bank_account_id;
    new.pay_remarks := old.pay_remarks;
  elsif old.status <> 'requested' then
    -- approved / rejected contracts are frozen, except for the supervisor assignment
    new.borrower_id := old.borrower_id; new.currency := old.currency; new.amount := old.amount;
    new.fee_pct := old.fee_pct; new.late_fee_per_day := old.late_fee_per_day;
    new.rate_pct := old.rate_pct; new.rate_basis := old.rate_basis;
    new.frequency := old.frequency; new.interval_days := old.interval_days;
    new.occurrences := old.occurrences; new.mode := old.mode; new.release_date := old.release_date;
    new.pay_method := old.pay_method; new.bank_account_id := old.bank_account_id;
    new.pay_remarks := old.pay_remarks; new.status := old.status;
  elsif not private.has_perm('loans.create') and not private.has_perm('loans.verify') then
    raise exception 'Not allowed';
  end if;
  return new;
end $$;
create trigger loans_guard before insert or update on public.loans
  for each row execute function private.loans_guard();

create function private.payments_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not private.has_perm('payments.record') then raise exception 'Not allowed'; end if;
  if not private.can_see_loan(new.loan_id) then raise exception 'Not allowed'; end if;
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

create policy borrowers_select on public.borrowers for select to authenticated using (private.has_perm('borrowers.view'));
create policy borrowers_insert on public.borrowers for insert to authenticated with check (private.has_perm('borrowers.edit'));
create policy borrowers_update on public.borrowers for update to authenticated
  using (private.has_perm('borrowers.edit') or private.has_perm('borrowers.ban'))
  with check (private.has_perm('borrowers.edit') or private.has_perm('borrowers.ban'));
create policy borrowers_delete on public.borrowers for delete to authenticated using (private.has_perm('borrowers.delete'));

create policy docs_select on public.borrower_documents for select to authenticated using (private.has_perm('borrowers.view'));
create policy docs_write on public.borrower_documents for all to authenticated
  using (private.has_perm('borrowers.edit')) with check (private.has_perm('borrowers.edit'));

create policy banks_select on public.bank_accounts for select to authenticated using (private.is_active());
create policy banks_write on public.bank_accounts for all to authenticated
  using (private.has_perm('banks.manage')) with check (private.has_perm('banks.manage'));

create policy loans_select on public.loans for select to authenticated
  using (private.has_perm('loans.view') and (not private.is_scoped() or supervisor_id = (select auth.uid())));
create policy loans_insert on public.loans for insert to authenticated with check (private.has_perm('loans.create'));
create policy loans_update on public.loans for update to authenticated
  using (private.can_see_loan(id) and (private.has_perm('loans.create') or private.has_perm('loans.verify') or private.has_perm('loans.approve')))
  with check (private.can_see_loan(id) or private.has_perm('loans.verify'));
create policy loans_delete on public.loans for delete to authenticated
  using (private.has_perm('loans.approve') and status in ('requested', 'rejected'));

create policy collaterals_select on public.loan_collaterals for select to authenticated using (private.can_see_loan(loan_id));
create policy collaterals_write on public.loan_collaterals for all to authenticated
  using (private.can_see_loan(loan_id) and private.has_perm('loans.create'))
  with check (private.has_perm('loans.create') and private.can_see_loan(loan_id));
create policy attachments_select on public.loan_attachments for select to authenticated using (private.can_see_loan(loan_id));
create policy attachments_write on public.loan_attachments for all to authenticated
  using (private.can_see_loan(loan_id) and private.has_perm('loans.create'))
  with check (private.has_perm('loans.create') and private.can_see_loan(loan_id));

create policy payments_select on public.payments for select to authenticated
  using (private.has_perm('payments.view') and private.can_see_loan(loan_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (private.has_perm('payments.record') and private.can_see_loan(loan_id));

create policy funds_select on public.fund_transactions for select to authenticated using (private.has_perm('funds.view'));
create policy funds_insert on public.fund_transactions for insert to authenticated with check (private.has_perm('funds.add'));

create policy settings_select on public.app_settings for select to authenticated using (private.is_active());
create policy settings_update on public.app_settings for update to authenticated
  using (private.has_perm('settings.edit')) with check (private.has_perm('settings.edit'));

create policy messages_select on public.messages for select to authenticated
  using (loan_id is null and private.is_active() or private.can_see_loan(loan_id));
create policy reads_select on public.message_reads for select to authenticated using (user_id = (select auth.uid()));
create policy reads_insert on public.message_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_active());

