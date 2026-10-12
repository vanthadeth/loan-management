-- Late fee is now a percentage of the unpaid installment, charged once for every
-- late occurrence (one payment period) instead of a fixed amount per day.
-- (loans.late_fee_per_day and app_settings.late_fee_khr/usd are kept but no longer used.)
alter table public.app_settings add column if not exists late_fee_pct numeric(5,2) not null default 2 check (late_fee_pct >= 0 and late_fee_pct <= 100);
alter table public.loans add column if not exists late_fee_pct numeric(5,2) not null default 0 check (late_fee_pct >= 0 and late_fee_pct <= 100);

-- a decided contract keeps its late fee: extend the freeze list in the guard trigger
do $$ declare d text; begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'loans_guard' and n.nspname = 'private';
  d := replace(d, 'new.late_fee_per_day := old.late_fee_per_day;', 'new.late_fee_per_day := old.late_fee_per_day; new.late_fee_pct := old.late_fee_pct;');
  execute d;
end $$;
