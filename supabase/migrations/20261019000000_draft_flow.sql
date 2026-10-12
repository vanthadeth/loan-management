-- Loan flow is now drafted -> requested -> approved (rejected from requested). The Verifier role and
-- the loans.verify permission are gone. A draft is visible only to the person who saved it.
alter type public.loan_status add value if not exists 'drafted' before 'requested';

update public.loans set status = 'requested' where status = 'verified';
delete from public.role_permissions where permission = 'loans.verify';
delete from public.roles where id = 'verifier' and not exists (select 1 from public.profiles where role_id = 'verifier');

-- (applied live, in this order) private.can_see_loan hides other people's drafts, policies loans_select / loans_update /
-- loans_delete were reworked for drafts, and private.loans_guard now allows drafted -> requested (loans.create),
-- requested -> approved and requested -> rejected (loans.approve); only drafts can be edited.

-- (applied live) more loans_guard transitions: requested -> drafted and rejected(denied) -> drafted
-- (loans.create or loans.approve), approved -> requested "reset approval" (loans.approve, blocked once a
-- payment exists; clears approved_by/approved_at).
