-- An admin (payments.void) can void a received payment: it stays on record, with who/when/why, and counts nowhere.
alter table public.payments
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id),
  add column void_reason text;

create function private.payments_void_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason') is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'A payment cannot be edited, only voided';
  end if;
  if not private.has_perm('payments.void') then raise exception 'Not allowed'; end if;
  if old.note like 'Refinanced into%' then raise exception 'A payment made by refinancing cannot be voided'; end if;
  if (select status from public.loans where id = new.loan_id) <> 'approved' then
    raise exception 'Payments can only be voided on approved loans';
  end if;
  if new.voided_at is not null then
    if coalesce(btrim(new.void_reason), '') = '' then raise exception 'Give a reason for voiding the payment'; end if;
    new.voided_by := auth.uid();
  else
    new.voided_by := null; new.void_reason := null;
  end if;
  return new;
end $$;
create trigger payments_void_guard before update on public.payments
  for each row execute function private.payments_void_guard();

create policy payments_update on public.payments for update to authenticated
  using (private.has_perm('payments.void') and private.can_see_loan(loan_id))
  with check (private.has_perm('payments.void') and private.can_see_loan(loan_id));
