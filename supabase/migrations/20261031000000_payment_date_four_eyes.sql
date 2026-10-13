-- Finance rules R-PAY-4 and R-LOAN-2 (step 4): guardrails in the database.
-- Settings: how many days back a payment may be dated, and whether a loan's requester may approve it.
alter table public.app_settings add column backdate_days int, add column four_eyes boolean;
update public.app_settings set backdate_days = 7, four_eyes = false where id = 1;
alter table public.app_settings
  alter column backdate_days set default 7, alter column backdate_days set not null,
  alter column four_eyes set default false, alter column four_eyes set not null;

-- A payment cannot be dated in the future (Cambodia date) or before the release, and beyond the limit it needs
-- the payments.backdate permission (Admin always has it). A refinancing payoff is dated on the new loan's release day.
create function private.payments_date_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_rel date; v_days int; v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
begin
  if new.note like 'Refinanced into%' then return new; end if;
  select release_date into v_rel from public.loans where id = new.loan_id;
  if new.paid_on > v_today then raise exception 'The payment date cannot be in the future'; end if;
  if new.paid_on < v_rel then raise exception 'The payment date is before the loan was released'; end if;
  select backdate_days into v_days from public.app_settings where id = 1;
  if v_today - new.paid_on > coalesce(v_days, 7) and not private.has_perm('payments.backdate') then
    raise exception 'A payment dated more than % days ago needs the permission to backdate payments', coalesce(v_days, 7);
  end if;
  return new;
end $$;
create trigger payments_date_guard before insert on public.payments
  for each row execute function private.payments_date_guard();

create function private.loans_four_eyes() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'requested' and new.status = 'approved' and auth.uid() = old.requested_by
     and (select four_eyes from public.app_settings where id = 1) then
    raise exception 'Another person must approve a loan that you requested';
  end if;
  return new;
end $$;
create trigger loans_four_eyes before update of status on public.loans
  for each row execute function private.loans_four_eyes();
