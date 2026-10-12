-- Voiding: an admin (permission loans.void) can void a loan. It is kept for the record but hidden from
-- everyone who does not hold loans.void, and the app leaves it out of every total.
alter table public.loans
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id),
  add column void_reason text not null default '';
create index on public.loans (voided_by);

create or replace function private.can_see_loan(lid bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select private.has_perm('loans.view') and exists (
    select 1 from public.loans l
    where l.id = lid
      and (not private.is_scoped() or l.supervisor_id = auth.uid())
      and (l.voided_at is null or private.has_perm('loans.void')))
$$;

alter policy loans_select on public.loans
  using (private.has_perm('loans.view')
    and (not private.is_scoped() or supervisor_id = (select auth.uid()))
    and (voided_at is null or private.has_perm('loans.void')));

-- loans_guard(): see the function in the database; it now handles voiding (new block after INSERT):
--   changing voided_at / void_reason needs loans.void, changes nothing else in the same step, records
--   voided_by, and a voided loan accepts no other update until it is restored.
