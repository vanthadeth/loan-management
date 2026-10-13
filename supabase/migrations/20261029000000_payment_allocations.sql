-- Finance rules R-SCHED-2/3, R-PAY-2 (step 2): payments are linked to the stored installments. Whenever a payment is
-- recorded, voided or restored, the loan's allocations are replayed from the payments that count (date order, oldest
-- installment first, interest before principal; late fee is not taken from a payment). Installments move to
-- partial / paid by this function only, never from the app. A refinancing payoff pays only the principal of
-- installments not yet due and locks what is left of them (R-REFI-2/3). Overpayment is not blocked yet (step 3).
create table public.payment_allocations (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments (id),
  loan_id bigint not null,
  installment_no int not null,
  principal numeric(14,2) not null default 0 check (principal >= 0),
  interest numeric(14,2) not null default 0 check (interest >= 0),
  created_at timestamptz not null default now(),
  foreign key (loan_id, installment_no) references public.loan_installments (loan_id, no)
);
alter table public.payment_allocations enable row level security;
create policy allocations_select on public.payment_allocations for select to authenticated
  using (private.has_perm('payments.view') and private.can_see_loan(loan_id));
revoke all on public.payment_allocations from anon;
revoke insert, update, delete, truncate on public.payment_allocations from authenticated;
create index on public.payment_allocations (payment_id);
create index on public.payment_allocations (loan_id, installment_no);
create unique index payment_allocations_pair on public.payment_allocations (payment_id, installment_no);

create function private.reallocate_loan(p_loan bigint) returns void
  language plpgsql security definer set search_path = public as $$
declare
  p record; i record; v_left numeric; ti numeric; tp numeric; v_payoff boolean; v_new bigint; v_pay_date date;
begin
  if not exists (select 1 from public.loan_installments where loan_id = p_loan) then return; end if;
  -- allocations are derived from the payments that count: replay them, zeroing rows that no longer apply
  update public.payment_allocations set principal = 0, interest = 0 where loan_id = p_loan;
  update public.loan_installments
    set paid_principal = 0, paid_interest = 0, status = 'open', paid_on = null, locked_by_loan = null
    where loan_id = p_loan;
  for p in select id, amount, late_fee, paid_on, note from public.payments
           where loan_id = p_loan and voided_at is null order by paid_on, id loop
    v_left := p.amount - p.late_fee;
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

create function private.payments_allocate() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform private.reallocate_loan(new.loan_id);
  return new;
end $$;
create trigger payments_allocate after insert or update of voided_at on public.payments
  for each row execute function private.payments_allocate();

-- backfill every stored schedule from the payments already recorded
select private.reallocate_loan(loan_id) from (select distinct loan_id from public.loan_installments) x;
