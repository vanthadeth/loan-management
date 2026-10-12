-- Collectors, like supervisors, see only the loans assigned to them (as supervisor or collector).
create or replace function private.can_see_loan(lid bigint) returns boolean
  language sql stable security definer set search_path = public as $$
  select private.has_perm('loans.view') and exists (
    select 1 from public.loans l
    where l.id = lid
      and (not private.is_scoped() or l.supervisor_id = auth.uid() or l.collector_id = auth.uid())
      and (l.voided_at is null or private.has_perm('loans.void'))
      and (l.status <> 'drafted' or l.requested_by = auth.uid()))
$$;
alter policy loans_select on public.loans using (
  private.has_perm('loans.view')
  and (not private.is_scoped() or supervisor_id = (select auth.uid()) or collector_id = (select auth.uid()))
  and (voided_at is null or private.has_perm('loans.void'))
  and (status <> 'drafted' or requested_by = (select auth.uid())));
update public.roles set scoped = true, description = 'Collects payments on the loans assigned to them, and only those' where id = 'collector';
