-- Clears all loan data: loans, payments, installments, allocations, snapshots, collaterals, attachments, loan messages
-- and read marks, and fund transactions. KEEPS users, roles, permissions, settings, bank accounts, contract templates,
-- borrowers and their documents. Uploaded files in storage are NOT touched (they stay as orphans, harmless).
-- Run it in the Supabase SQL editor (it is destructive and cannot be undone). Not a migration: do not apply twice by habit.

-- 1. look first
select 'loans' as t, count(*) from public.loans
union all select 'payments', count(*) from public.payments
union all select 'installments', count(*) from public.loan_installments
union all select 'allocations', count(*) from public.payment_allocations
union all select 'snapshots', count(*) from public.loan_snapshots
union all select 'collaterals', count(*) from public.loan_collaterals
union all select 'attachments', count(*) from public.loan_attachments
union all select 'messages', count(*) from public.messages
union all select 'message_reads', count(*) from public.message_reads
union all select 'fund_transactions', count(*) from public.fund_transactions
union all select 'borrowers (kept)', count(*) from public.borrowers;

-- 2. clear, in one transaction (any error leaves everything as it was)
begin;

-- listing every table that points at another one makes the truncate work without CASCADE (so nothing else is touched)
truncate table
  public.message_reads, public.messages,
  public.payment_allocations, public.loan_snapshots, public.loan_installments,
  public.payments, public.loan_attachments, public.loan_collaterals,
  public.loans, public.fund_transactions
  restart identity;

commit;

-- 3. check: every count above (except borrowers) is now 0 and the next loan is L-001 again
