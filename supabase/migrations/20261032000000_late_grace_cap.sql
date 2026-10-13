-- Finance rules R-LATE-2 / R-LOAN-3 (step 5): late fee grace days and cap, part of each loan's terms.
-- Existing loans keep null (= no grace, no cap). The app calculates the fee (src/lib/calc.ts scheduleStatus).
alter table public.loans add column late_grace_days int, add column late_cap_pct numeric(6,2);
alter table public.loans alter column late_grace_days set default 0;
alter table public.app_settings add column late_grace_days int, add column late_cap_pct numeric(6,2);
update public.app_settings set late_grace_days = 0 where id = 1;
alter table public.app_settings alter column late_grace_days set default 0, alter column late_grace_days set not null;

create function private.loans_late_terms_freeze() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- grace days and cap are part of the terms snapshot: fixed once the loan leaves draft
  if old.status <> 'drafted' then
    new.late_grace_days := old.late_grace_days;
    new.late_cap_pct := old.late_cap_pct;
  end if;
  return new;
end $$;
create trigger loans_late_terms_freeze before update on public.loans
  for each row execute function private.loans_late_terms_freeze();
