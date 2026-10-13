-- Finance rules R-SCHED-1/2: the schedule is calculated once, at approval, and stored. Step 1 of the roadmap:
-- the table, the generator (a port of buildSchedule in src/lib/calc.ts, checked against it on 150 random loans:
-- identical md5 over every installment), the approval trigger and a backfill. Payments are not linked yet (step 2).
create table public.loan_installments (
  loan_id bigint not null references public.loans (id),
  no int not null check (no > 0),
  due_date date not null,
  principal numeric(14,2) not null check (principal >= 0),
  interest numeric(14,2) not null check (interest >= 0),
  total numeric(14,2) not null,
  paid_principal numeric(14,2) not null default 0,
  paid_interest numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','partial','paid','locked','cancelled')),
  paid_on date,
  locked_by_loan bigint references public.loans (id),
  schedule_version int not null default 1,
  created_at timestamptz not null default now(),
  primary key (loan_id, no)
);
alter table public.loan_installments enable row level security;
create policy installments_select on public.loan_installments for select to authenticated
  using (private.has_perm('payments.view') and private.can_see_loan(loan_id));
revoke all on public.loan_installments from anon;
revoke insert, update, delete, truncate on public.loan_installments from authenticated;

create function private.round_money(v numeric, cur public.currency_code) returns numeric
  language sql immutable as $$ select case when cur = 'USD' then round(v, 2) else round(v / 100) * 100 end $$;

create function private.build_schedule(p_amount numeric, p_cur public.currency_code, p_rate numeric, p_basis public.rate_basis, p_n int, p_freq text, p_interval int, p_mode public.pay_mode, p_release date)
returns table (no int, due_date date, principal numeric, interest numeric, total numeric)
language plpgsql immutable as $$
declare
  r numeric := p_rate / 100;
  raw numeric;
  i_total numeric; i_each numeric; p_each numeric;
begin
  raw := case p_basis
    when 'contract' then p_amount * r
    when 'occurrence' then p_amount * r * p_n
    else p_amount * r * (case when p_freq = 'monthly' then p_n::numeric else (p_n * p_interval)::numeric / 30 end)
  end;
  i_total := private.round_money(raw, p_cur);
  i_each := private.round_money(i_total / p_n, p_cur);
  p_each := case when p_mode = 'equal' then private.round_money(p_amount / p_n, p_cur) else 0 end;
  return query
  select g, (case when p_freq = 'monthly' then p_release + make_interval(months => g) else p_release + p_interval * g end)::date,
    case when g = p_n then private.round_money(p_amount - p_each * (p_n - 1), p_cur) else p_each end,
    case when g = p_n then private.round_money(i_total - i_each * (p_n - 1), p_cur) else i_each end,
    (case when g = p_n then private.round_money(p_amount - p_each * (p_n - 1), p_cur) else p_each end)
      + (case when g = p_n then private.round_money(i_total - i_each * (p_n - 1), p_cur) else i_each end)
  from generate_series(1, p_n) g;
end $$;

create function private.store_schedule(p_loan bigint) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.loan_installments where loan_id = p_loan) then return; end if;
  insert into public.loan_installments (loan_id, no, due_date, principal, interest, total)
  select l.id, b.no, b.due_date, b.principal, b.interest, b.total
  from public.loans l, private.build_schedule(l.amount, l.currency, l.rate_pct, l.rate_basis, l.occurrences, l.frequency, l.interval_days, l.mode, l.release_date) b
  where l.id = p_loan;
end $$;

-- the stored amounts and dates never change; only the payment functions (later steps) move paid_* and status
create function private.installments_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('komjei.schedule_reset', true) is distinct from old.loan_id::text then raise exception 'A stored schedule cannot be deleted'; end if;
    return old;
  end if;
  if new.loan_id <> old.loan_id or new.no <> old.no or new.due_date <> old.due_date or new.principal <> old.principal
     or new.interest <> old.interest or new.total <> old.total or new.schedule_version <> old.schedule_version then
    raise exception 'A stored schedule cannot be changed';
  end if;
  return new;
end $$;
create trigger loan_installments_guard before update or delete on public.loan_installments
  for each row execute function private.installments_guard();

-- approval stores the schedule; resetting an approval (only possible without payments) removes it
create function private.loans_schedule() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform private.store_schedule(new.id);
  elsif old.status = 'approved' and new.status = 'requested' then
    delete from public.loan_installments where loan_id = new.id;
  end if;
  return new;
end $$;
create trigger loans_schedule after update of status on public.loans
  for each row execute function private.loans_schedule();

create function private.loans_schedule_prep() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved' and new.status = 'requested' then
    perform set_config('komjei.schedule_reset', new.id::text, true);
  end if;
  return new;
end $$;
create trigger loans_schedule_prep before update of status on public.loans
  for each row execute function private.loans_schedule_prep();

-- backfill: every loan that was approved (including refinanced and voided ones)
select private.store_schedule(id) from public.loans where status in ('approved', 'refinanced');
