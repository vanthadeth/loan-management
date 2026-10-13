-- Regression test for the finance rules (docs/finance-rules.md). Run in the Supabase SQL editor on a database that has at
-- least one admin user and one borrower. It creates loans, payments and so on, checks the rules, and then ends with an
-- exception on purpose, so EVERYTHING it did is rolled back. The message shows PASS/FAIL per rule (last run: 20 of 20 pass).
do $$
declare
  admin_id uuid; col_id uuid; bor bigint;
  a bigint; b bigint; c bigint; w bigint; pid bigint;
  d date := (now() at time zone 'Asia/Phnom_Penh')::date;
  pass int := 0; fail int := 0; n numeric; t text;
begin
  select pr.id into admin_id from profiles pr join roles ro on ro.id = pr.role_id where ro.locked and pr.status = 'active' limit 1;
  select pr.id into col_id from profiles pr join roles ro on ro.id = pr.role_id
    where not ro.locked and pr.status = 'active' and exists (select 1 from role_permissions rp where rp.role_id = ro.id and rp.permission = 'payments.record') limit 1;
  select id into bor from borrowers limit 1;
  if admin_id is null or bor is null then raise exception 'Needs an active admin user and a borrower'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  -- helper: record one check
  create temp table if not exists chk (ok boolean, name text) on commit drop;

  -- 1. schedule is stored at approval and snapshots start
  insert into loans (borrower_id, currency, amount, fee_pct, late_fee_pct, rate_pct, rate_basis, frequency, interval_days, occurrences, mode, release_date, pay_method, status, prepay_fee_pct)
    values (bor, 'KHR', 1000000, 3, 5, 17, 'contract', 'monthly', 30, 3, 'equal', d, 'cash', 'requested', 2) returning id into a;
  update loans set status = 'approved' where id = a;
  insert into chk select (select count(*) from loan_installments where loan_id = a) = 3, 'R-SCHED-1 schedule stored at approval';
  insert into chk select (select count(*) from loan_snapshots where loan_id = a and event_type = 'approved') = 1, 'R-SNAP-1 approval snapshot';

  -- 2. payment allocates oldest installment first, interest before principal
  insert into payments (loan_id, amount, late_fee, paid_on) values (a, 100000, 0, d) returning id into pid;
  insert into chk select (select status from loan_installments where loan_id = a and no = 1) = 'partial'
    and (select paid_interest from loan_installments where loan_id = a and no = 1) = 56700, 'R-PAY-2 interest first, oldest installment first';
  insert into chk select (select principal_outstanding from loan_snapshots where loan_id = a order by seq desc limit 1) = 1000000 - 43300, 'R-SNAP-2 snapshot after payment';

  -- 3. overpayment, future and before-release dates are refused
  begin insert into payments (loan_id, amount, late_fee, paid_on) values (a, 9999999, 0, d); insert into chk values (false, 'R-PAY-3 overpayment refused'); exception when others then insert into chk values (true, 'R-PAY-3 overpayment refused'); end;
  begin insert into payments (loan_id, amount, late_fee, paid_on) values (a, 1000, 0, d + 1); insert into chk values (false, 'R-PAY-4 future date refused'); exception when others then insert into chk values (true, 'R-PAY-4 future date refused'); end;
  begin insert into payments (loan_id, amount, late_fee, paid_on) values (a, 1000, 0, d - 1); insert into chk values (false, 'R-PAY-4 before release refused'); exception when others then insert into chk values (true, 'R-PAY-4 before release refused'); end;

  -- 4. void and restore
  update payments set voided_at = now(), void_reason = 'test' where id = pid;
  insert into chk select (select count(*) from loan_installments where loan_id = a and status <> 'open') = 0, 'R-FIX-1 void reopens installments';
  update payments set voided_at = null where id = pid;
  insert into chk select (select status from loan_installments where loan_id = a and no = 1) = 'partial', 'R-FIX-1 restore applies it again';

  -- 5. early payoff: refused while something is due, exact amounts, fee waiver needs permission and a reason
  select coalesce(sum(principal - paid_principal), 0) into n from loan_installments where loan_id = a;
  begin
    insert into payments (loan_id, amount, late_fee, paid_on, note, prepay_fee, prepay_fee_waived, interest_waived)
      values (a, n + 1, 0, d, 'Early payoff', 0, 20000, (select sum(interest - paid_interest) from loan_installments where loan_id = a));
    insert into chk values (false, 'R-PAY-5 wrong early payoff refused');
  exception when others then insert into chk values (true, 'R-PAY-5 wrong early payoff refused'); end;
  insert into payments (loan_id, amount, late_fee, paid_on, note, prepay_fee, prepay_fee_waived, interest_waived, waive_reason)
    values (a, n + 10000, 0, d, 'Early payoff', 10000, private.round_money(n * 2 / 100, 'KHR') - 10000, (select sum(interest - paid_interest) from loan_installments where loan_id = a), 'good client');
  insert into chk select (select count(*) from loan_installments where loan_id = a and status = 'paid') = 3, 'R-PAY-5 early payoff closes every installment';

  -- 6. refinance locks the old loan, undo reverses it
  insert into loans (borrower_id, currency, amount, fee_pct, late_fee_pct, rate_pct, rate_basis, frequency, interval_days, occurrences, mode, release_date, pay_method, status)
    values (bor, 'KHR', 1000000, 3, 5, 17, 'contract', 'monthly', 30, 3, 'equal', d, 'cash', 'requested') returning id into b;
  update loans set status = 'approved' where id = b;
  insert into loans (borrower_id, currency, amount, fee_pct, late_fee_pct, rate_pct, rate_basis, frequency, interval_days, occurrences, mode, release_date, pay_method, status, refinance_of, carried_amount, carried_late_fee)
    values (bor, 'KHR', 1500000, 3, 5, 17, 'contract', 'monthly', 30, 3, 'equal', d, 'cash', 'requested', b, 900000, 0) returning id into c;
  update loans set status = 'approved' where id = c;
  insert into chk select (select status from loans where id = b) = 'refinanced' and exists (select 1 from loan_installments where loan_id = b and status = 'locked'), 'R-REFI-2/3 old loan refinanced, rest locked';
  begin update payments set voided_at = now(), void_reason = 'x' where loan_id = b and note like 'Refinanced%'; insert into chk values (false, 'R-REFI-4 payoff cannot be voided directly'); exception when others then insert into chk values (true, 'R-REFI-4 payoff cannot be voided directly'); end;
  update loans set voided_at = now(), void_reason = 'undo' where id = c;
  insert into chk select (select status from loans where id = b) = 'approved' and not exists (select 1 from loan_installments where loan_id = b and status = 'locked'), 'R-REFI-4 voiding the refinancing loan reopens the old loan';

  -- 7. write-off and recovery
  insert into loans (borrower_id, currency, amount, fee_pct, late_fee_pct, rate_pct, rate_basis, frequency, interval_days, occurrences, mode, release_date, pay_method, status)
    values (bor, 'KHR', 1000000, 3, 5, 17, 'contract', 'monthly', 30, 3, 'equal', d - 70, 'cash', 'requested') returning id into w;
  update loans set status = 'approved' where id = w;
  perform write_off_loan(w, 'test');
  begin insert into payments (loan_id, amount, late_fee, paid_on) values (w, 1000, 0, d); insert into chk values (false, 'R-FIX-3 normal payment on written-off loan refused'); exception when others then insert into chk values (true, 'R-FIX-3 normal payment on written-off loan refused'); end;
  insert into payments (loan_id, amount, late_fee, paid_on, note) values (w, 1000, 0, d, 'Recovery');
  insert into chk values (true, 'R-FIX-3 recovery accepted');

  -- 8. the books agree
  insert into chk select (select count(*) from reconcile_books()) = 0, 'R-SNAP-4 books agree after all of the above';

  -- 9. snapshots are immutable
  begin update loan_snapshots set collected = 1 where loan_id = a; insert into chk values (false, 'R-SNAP-2 snapshot cannot change'); exception when others then insert into chk values (true, 'R-SNAP-2 snapshot cannot change'); end;

  -- 10. collector cannot backdate or waive (when such a user exists)
  if col_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', col_id, 'role', 'authenticated')::text, true);
    begin insert into payments (loan_id, amount, late_fee, paid_on, note) values (w, 1000, 0, d - 30, 'Recovery'); insert into chk values (false, 'R-PAY-4 collector cannot backdate'); exception when others then insert into chk values (true, 'R-PAY-4 collector cannot backdate'); end;
    begin perform write_off_loan(w, 'nope'); insert into chk values (false, 'R-FIX-3 collector cannot write off'); exception when others then insert into chk values (true, 'R-FIX-3 collector cannot write off'); end;
  end if;

  select count(*) filter (where ok), count(*) filter (where not ok), string_agg(case when ok then '  PASS ' else '  FAIL ' end || name, E'\n') into pass, fail, t from chk;
  raise exception E'\nPASS % / FAIL %\n%', pass, fail, t;
end $$;
