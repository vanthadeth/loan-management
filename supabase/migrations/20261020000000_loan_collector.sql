-- Each loan can have a collector (a Loan supervisor or Collector user). Informational: it does not limit who sees the loan.
alter table public.loans add column if not exists collector_id uuid references public.profiles (id) on delete set null;
-- (applied live) private.loans_guard keeps collector_id as it was unless the loan is a draft or the user has loans.approve.
