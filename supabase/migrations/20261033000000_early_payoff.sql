-- Finance rules R-PAY-5 (step 6): early payoff = unpaid principal + prepayment fee, no future interest.
-- Recorded as one payment with note 'Early payoff': amount = principal + fee collected, prepay_fee = fee collected,
-- prepay_fee_waived = fee waived (admin permission + reason), interest_waived = interest not yet due (closes the
-- installments like cash would, but is not money). The database checks every figure; the app only asks.
-- (Late fee outstanding is checked by the app only: the late fee is not calculated in the database yet.)
alter table public.payments add column prepay_fee numeric(14,2), add column prepay_fee_waived numeric(14,2),
  add column interest_waived numeric(14,2), add column waive_reason text;
alter table public.payments alter column prepay_fee set default 0, alter column prepay_fee_waived set default 0,
  alter column interest_waived set default 0;
alter table public.loans add column prepay_fee_pct numeric(5,2);
alter table public.app_settings add column prepay_fee_pct numeric(5,2);
update public.app_settings set prepay_fee_pct = 0 where id = 1;
alter table public.app_settings alter column prepay_fee_pct set default 0, alter column prepay_fee_pct set not null;
alter table public.loans alter column prepay_fee_pct set default 0;

create function private.loans_prepay_terms_freeze() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'drafted' then new.prepay_fee_pct := old.prepay_fee_pct; end if;
  return new;
end $$;
create trigger loans_prepay_terms_freeze before update on public.loans
  for each row execute function private.loans_prepay_terms_freeze();

-- allocation: cash for installments plus the interest waived by an early payoff (replaces the step 2 version)
create or replace function private.reallocate_loan(p_loan bigint) returns void
  language plpgsql security definer set search_path = public as $$
declare
  p record; i record; v_left numeric; ti numeric; tp numeric; v_payoff boolean; v_new bigint; v_pay_date date;
begin
  if not exists (select 1 from public.loan_installments where loan_id = p_loan) then return; end if;
  update public.payment_allocations set principal = 0, interest = 0 where loan_id = p_loan;
  update public.loan_installments
    set paid_principal = 0, paid_interest = 0, status = 'open', paid_on = null, locked_by_loan = null
    where loan_id = p_loan;
  for p in select id, amount, late_fee, coalesce(prepay_fee, 0) prepay_fee, coalesce(interest_waived, 0) interest_waived, paid_on, note
           from public.payments where loan_id = p_loan and voided_at is null order by paid_on, id loop
    v_left := p.amount - p.late_fee - p.prepay_fee + p.interest_waived;
    v_payoff := p.note like 'Refinanced into%';
    for i in select no, due_date, principal, interest, paid_principal, paid_interest, total
             from public.loan_installments where loan_id = p_loan and paid_principal + paid_interest < total order by no loop
      exit when v_left <= 0;
      ti := case when v_payoff and i.due_date > p.paid_on then 0 else least(v_left, i.interest - i.paid_interest) end;
      v_left := v_left - ti;
      tp := least(v_left, i.principal - i.paid_principal);
      v_left := v_left - tp;
      if ti + tp > 0 then
        insert into public.payment_allocations (payment_id, loan_id, installment_no, principal, interest)
          values (p.id, p_loan, i.no, tp, ti)
          on conflict (payment_id, installment_no) do update set principal = excluded.principal, interest = excluded.interest;
        update public.loan_installments
          set paid_principal = paid_principal + tp, paid_interest = paid_interest + ti,
              paid_on = case when paid_principal + tp + paid_interest + ti >= total then p.paid_on else paid_on end
          where loan_id = p_loan and no = i.no;
      end if;
    end loop;
  end loop;
  update public.loan_installments
    set status = case when paid_principal + paid_interest >= total then 'paid' when paid_principal + paid_interest > 0 then 'partial' else 'open' end
    where loan_id = p_loan;
  select paid_on, substring(note from 'L-(\d+)')::bigint into v_pay_date, v_new from public.payments
    where loan_id = p_loan and voided_at is null and note like 'Refinanced into%' order by id desc limit 1;
  if v_new is not null then
    update public.loan_installments set status = 'locked', locked_by_loan = v_new
      where loan_id = p_loan and status in ('open', 'partial') and due_date > v_pay_date;
  end if;
end $$;

create or replace function private.payments_cap() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_out numeric;
begin
  select sum(total - paid_principal - paid_interest) filter (where status <> 'locked') into v_out
    from public.loan_installments where loan_id = new.loan_id;
  if v_out is null then return new; end if;
  if new.amount - new.late_fee - coalesce(new.prepay_fee, 0) + coalesce(new.interest_waived, 0) > v_out + 0.005 then
    raise exception 'The payment is more than the loan still owes (%). Hand the extra back to the borrower.', v_out;
  end if;
  return new;
end $$;

create or replace function private.payments_snapshot() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_event text;
begin
  if not exists (select 1 from public.loan_installments where loan_id = new.loan_id) then return new; end if;
  if tg_op = 'INSERT' then
    v_event := case when new.note like 'Refinanced into%' then 'refinance_payoff'
                    when new.note like 'Early payoff%' then 'prepayment'
                    when new.late_fee > 0 and new.late_fee = new.amount then 'late_fee'
                    when new.amount = 0 then 'late_fee_waiver'
                    else 'payment' end;
  else
    v_event := case when new.voided_at is not null then 'void' else 'restore' end;
  end if;
  perform private.write_snapshot(new.loan_id, v_event, new.id);
  return new;
end $$;

create function private.prepayments_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_pct numeric; v_prin numeric; v_int numeric; v_fee numeric; v_cur public.currency_code;
begin
  if new.note not like 'Early payoff%' then return new; end if;
  if new.late_fee <> 0 then raise exception 'Late fee is settled before an early payoff, not with it'; end if;
  if exists (select 1 from public.loan_installments where loan_id = new.loan_id and status <> 'locked'
             and due_date <= new.paid_on and paid_principal + paid_interest < total) then
    raise exception 'An early payoff needs every installment that is already due to be paid first';
  end if;
  select coalesce(sum(principal - paid_principal), 0), coalesce(sum(interest - paid_interest), 0) into v_prin, v_int
    from public.loan_installments where loan_id = new.loan_id and status <> 'locked';
  select currency, coalesce(prepay_fee_pct, 0) into v_cur, v_pct from public.loans where id = new.loan_id;
  v_fee := private.round_money(v_prin * v_pct / 100, v_cur);
  if abs(new.amount - coalesce(new.prepay_fee, 0) - v_prin) > 0.005 then
    raise exception 'An early payoff pays exactly the unpaid principal (%) plus the prepayment fee', v_prin;
  end if;
  if abs(coalesce(new.interest_waived, 0) - v_int) > 0.005 then
    raise exception 'An early payoff drops exactly the interest not yet due (%)', v_int;
  end if;
  if abs(coalesce(new.prepay_fee, 0) + coalesce(new.prepay_fee_waived, 0) - v_fee) > 0.005 then
    raise exception 'The prepayment fee (%) must be collected or waived in full', v_fee;
  end if;
  if coalesce(new.prepay_fee_waived, 0) > 0 then
    if not private.has_perm('payments.waive_fee') then raise exception 'Waiving the prepayment fee needs an admin'; end if;
    if coalesce(btrim(new.waive_reason), '') = '' then raise exception 'Give a reason for waiving the prepayment fee'; end if;
  end if;
  return new;
end $$;
create trigger payments_prepayment_guard before insert on public.payments
  for each row execute function private.prepayments_guard();
