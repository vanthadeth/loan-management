-- Finance rules R-SNAP-4 (step 8a): a reconciliation check. Admin only. Returns one row per disagreement between the
-- database's own records for a loan (or every loan with a stored schedule when no loan is given); no rows = books agree.
-- Checks: payments applied = allocations; allocations = installments paid; voided payments hold no allocation;
-- the latest snapshot = the installments (principal outstanding, interest outstanding, collected);
-- the stored schedule = the schedule recalculated from the loan's terms.
create function public.reconcile_books(p_loan bigint default null)
returns table (loan_id bigint, check_name text, expected numeric, actual numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id
                 where p.id = auth.uid() and r.locked and p.status = 'active') then
    raise exception 'Not allowed';
  end if;
  return query
  with ids as (select distinct i.loan_id from public.loan_installments i where p_loan is null or i.loan_id = p_loan),
  pay as (select p.loan_id, sum(p.amount - p.late_fee - coalesce(p.prepay_fee, 0) + coalesce(p.interest_waived, 0)) v
          from public.payments p where p.voided_at is null group by 1),
  al as (select a.loan_id, sum(a.principal + a.interest) v from public.payment_allocations a group by 1),
  al_void as (select a.loan_id, sum(a.principal + a.interest) v from public.payment_allocations a
              join public.payments p on p.id = a.payment_id where p.voided_at is not null group by 1),
  inst as (select i.loan_id, sum(i.paid_principal + i.paid_interest) v,
             sum(i.principal - i.paid_principal) filter (where i.status <> 'locked') po,
             sum(i.interest - i.paid_interest) filter (where i.status <> 'locked') io
           from public.loan_installments i group by 1),
  snap as (select distinct on (s.loan_id) s.loan_id, s.principal_outstanding po, s.interest_outstanding io, s.collected c
           from public.loan_snapshots s order by s.loan_id, s.seq desc),
  drift as (select i.loan_id, count(*) filter (where i.due_date <> b.due_date or i.principal <> b.principal or i.interest <> b.interest) n
            from public.loan_installments i join public.loans l on l.id = i.loan_id
            join lateral private.build_schedule(l.amount, l.currency, l.rate_pct, l.rate_basis, l.occurrences, l.frequency, l.interval_days, l.mode, l.release_date) b on b.no = i.no
            group by i.loan_id)
  select * from (
    select ids.loan_id, 'payments applied = allocations'::text, coalesce(pay.v, 0), coalesce(al.v, 0) from ids left join pay using (loan_id) left join al using (loan_id)
    union all select ids.loan_id, 'allocations = installments paid', coalesce(al.v, 0), coalesce(inst.v, 0) from ids left join al using (loan_id) left join inst using (loan_id)
    union all select ids.loan_id, 'voided payments hold no allocation', 0::numeric, coalesce(al_void.v, 0) from ids left join al_void using (loan_id)
    union all select ids.loan_id, 'snapshot principal outstanding', coalesce(inst.po, 0), snap.po from ids join inst using (loan_id) join snap using (loan_id)
    union all select ids.loan_id, 'snapshot interest outstanding', coalesce(inst.io, 0), snap.io from ids join inst using (loan_id) join snap using (loan_id)
    union all select ids.loan_id, 'snapshot collected', coalesce(inst.v, 0), snap.c from ids join inst using (loan_id) join snap using (loan_id)
    union all select ids.loan_id, 'stored schedule = recalculated', 0::numeric, drift.n::numeric from ids join drift using (loan_id)
  ) x(loan_id, check_name, expected, actual)
  where abs(x.expected - x.actual) > 0.005;
end $$;
revoke execute on function public.reconcile_books(bigint) from public, anon;
grant execute on function public.reconcile_books(bigint) to authenticated;
