-- Finance rules R-FIX-3 (step 9): write-off. Admin only (permission loans.write_off), with a reason, only for an approved loan
-- with an overdue installment. A written-off loan stays in the portfolio and the risk figures (owner's decision); money
-- received afterwards must be recorded as a 'Recovery' (the payment note), and the loan cannot be refinanced or paid off
-- early. An admin can reverse the write-off. Both write a snapshot (write_off, write_off_reversed).
alter table public.loans add column written_off_at timestamptz, add column written_off_by uuid references public.profiles (id),
  add column write_off_reason text;

create function private.loans_write_off_freeze() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- the write-off columns change only through write_off_loan / reverse_write_off
  if coalesce(current_setting('komjei.write_off', true), '') <> new.id::text then
    new.written_off_at := old.written_off_at;
    new.written_off_by := old.written_off_by;
    new.write_off_reason := old.write_off_reason;
  end if;
  return new;
end $$;
create trigger loans_write_off_freeze before update on public.loans
  for each row execute function private.loans_write_off_freeze();

create function private.payments_writeoff_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_off timestamptz;
begin
  select written_off_at into v_off from public.loans where id = new.loan_id;
  if v_off is null then return new; end if;
  if new.note like 'Refinanced into%' then raise exception 'A written-off loan cannot be refinanced'; end if;
  if new.note like 'Early payoff%' then raise exception 'A written-off loan cannot be paid off early; record the money as a recovery'; end if;
  if new.note not like 'Recovery%' then
    raise exception 'This loan is written off: money received is a recovery, not a normal payment';
  end if;
  return new;
end $$;
create trigger payments_writeoff_guard before insert on public.payments
  for each row execute function private.payments_writeoff_guard();

create function public.write_off_loan(p_loan bigint, p_reason text) returns void
  language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
begin
  if not private.has_perm('loans.write_off') then raise exception 'Not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason for the write-off'; end if;
  if not exists (select 1 from public.loans where id = p_loan and status = 'approved' and voided_at is null and written_off_at is null) then
    raise exception 'Only an approved loan that is not voided or already written off can be written off';
  end if;
  if not exists (select 1 from public.loan_installments where loan_id = p_loan and status in ('open', 'partial') and due_date < v_today) then
    raise exception 'Only a loan with an overdue installment can be written off';
  end if;
  perform set_config('komjei.write_off', p_loan::text, true);
  update public.loans set written_off_at = now(), written_off_by = auth.uid(), write_off_reason = btrim(p_reason) where id = p_loan;
  perform set_config('komjei.write_off', '', true);
  perform private.write_snapshot(p_loan, 'write_off', p_loan);
end $$;

create function public.reverse_write_off(p_loan bigint, p_reason text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not private.has_perm('loans.write_off') then raise exception 'Not allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason for reversing the write-off'; end if;
  if not exists (select 1 from public.loans where id = p_loan and written_off_at is not null and voided_at is null) then
    raise exception 'This loan is not written off';
  end if;
  perform set_config('komjei.write_off', p_loan::text, true);
  update public.loans set written_off_at = null, written_off_by = null, write_off_reason = null where id = p_loan;
  perform set_config('komjei.write_off', '', true);
  perform private.write_snapshot(p_loan, 'write_off_reversed', p_loan);
end $$;
revoke execute on function public.write_off_loan(bigint, text) from public, anon;
revoke execute on function public.reverse_write_off(bigint, text) from public, anon;
grant execute on function public.write_off_loan(bigint, text) to authenticated;
grant execute on function public.reverse_write_off(bigint, text) to authenticated;
