-- 1. Trust level "bad" below normal.
alter type public.borrower_tier add value if not exists 'bad' before 'normal';

-- 2. Late fee: the collector may take less than the late fee due; the rest is forgiven and recorded here.
alter table public.payments add column if not exists late_fee_waived numeric(14,2) not null default 0 check (late_fee_waived >= 0);

-- 3. Refinance: a new loan pays off an ongoing one. The new loan carries the old balance (no service fee on it,
--    not paid out to the borrower). When the new loan is approved, a payoff payment is recorded on the old loan
--    and the old loan closes as "refinanced".
alter type public.loan_status add value if not exists 'refinanced';
alter table public.loans add column if not exists refinance_of bigint references public.loans (id);
-- nullable without a default first, so existing rows are not given a stored default (see 20261023000000)
alter table public.loans add column if not exists carried_amount numeric(14,2);
alter table public.loans add column if not exists carried_late_fee numeric(14,2);
alter table public.loans alter column carried_amount set default 0;
alter table public.loans alter column carried_late_fee set default 0;
create index if not exists loans_refinance_of_idx on public.loans (refinance_of);

create or replace function private.check_refinance(old_id bigint, borrower bigint, carried numeric, carried_fee numeric, amount numeric) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.loans o where o.id = old_id and o.borrower_id = borrower and o.status = 'approved' and o.voided_at is null) then
    raise exception 'Only an approved, ongoing loan of the same borrower can be refinanced';
  end if;
  if coalesce(carried, 0) <= 0 or carried > amount or coalesce(carried_fee, 0) < 0 or carried_fee > carried then
    raise exception 'The balance carried over is not valid';
  end if;
end $$;

-- (applied live) private.loans_guard: validates refinance_of / carried_* on insert and while drafted, freezes them
-- afterwards, refuses to approve when the old loan is no longer open, refuses to reset the approval of a refinancing
-- loan, and allows approved -> refinanced only from apply_refinance (setting komjei.refinancing).
-- (applied live) private.payments_guard: lets apply_refinance record the payoff without payments.record.

create or replace function private.apply_refinance() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.refinance_of is not null and new.status = 'approved' and old.status is distinct from 'approved' then
    perform set_config('komjei.refinancing', new.refinance_of::text, true);
    insert into public.payments (loan_id, bank_account_id, amount, late_fee, late_fee_waived, paid_on, note)
      values (new.refinance_of, null, new.carried_amount, new.carried_late_fee, 0, greatest(new.release_date, current_date),
              'Refinanced into L-' || lpad(new.id::text, 3, '0'));
    update public.loans set status = 'refinanced' where id = new.refinance_of;
    perform set_config('komjei.refinancing', '', true);
  end if;
  return null;
end $$;
create trigger loans_refinance after update of status on public.loans for each row execute function private.apply_refinance();
