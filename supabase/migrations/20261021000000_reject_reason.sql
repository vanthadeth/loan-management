-- A denied loan keeps the reason the approver gave.
alter table public.loans add column if not exists reject_reason text not null default '';
