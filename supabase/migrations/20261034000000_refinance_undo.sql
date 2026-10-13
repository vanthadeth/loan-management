-- Finance rules R-REFI-4 (step 7): voiding a refinancing loan that has no payments reverses the refinancing:
-- the payoff payment on the old loan is voided (its installments unlock and reopen) and the old loan goes back
-- from 'refinanced' to 'approved'. Restoring a voided refinancing loan is refused (refinance the old loan again).
--
-- All parts are applied live. Tested (rolled back): voiding a refinancing loan without payments reopens the old loan
-- ('approved', installments open/partial, payoff voided, snapshot 'refinance_undone'); with payments it is refused;
-- the payoff cannot be voided directly; restoring the voided refinancing loan is refused.

-- 1. loans_guard: one more allowed status change, refinanced -> approved, only while the undo runs (applied live)
--    (the full function is the step-0 definition plus this branch, next to the 'approved' -> 'refinanced' one:)
--      elsif old.status = 'refinanced' and new.status = 'approved'
--            and coalesce(current_setting('komjei.refinance_undo', true), '') = old.id::text then
--        null;

-- 2. payments_void_guard: the payoff payment may be voided while the undo runs (applied live)
create or replace function private.payments_void_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_undo boolean := old.note like 'Refinanced into%'
  and coalesce(current_setting('komjei.refinance_undo', true), '') = new.loan_id::text;
begin
  if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason') is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'A payment cannot be edited, only voided';
  end if;
  if not v_undo then
    if not private.has_perm('payments.void') then raise exception 'Not allowed'; end if;
    if old.note like 'Refinanced into%' then raise exception 'A payment made by refinancing cannot be voided'; end if;
    if (select status from public.loans where id = new.loan_id) <> 'approved' then
      raise exception 'Payments can only be voided on approved loans';
    end if;
  end if;
  if new.voided_at is not null then
    if coalesce(btrim(new.void_reason), '') = '' then raise exception 'Give a reason for voiding the payment'; end if;
    new.voided_by := auth.uid();
  else
    new.voided_by := null; new.void_reason := null;
  end if;
  return new;
end $$;

-- 3. the undo itself
create function private.loans_refinance_undo() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.refinance_of is null or new.status <> 'approved' then return new; end if;
  if old.voided_at is null and new.voided_at is not null then
    if exists (select 1 from public.payments where loan_id = new.id and voided_at is null) then
      raise exception 'This loan has payments, so the refinancing cannot be undone. Void its payments first.';
    end if;
    v_code := 'Refinanced into L-' || lpad(new.id::text, 3, '0');
    perform set_config('komjei.refinance_undo', new.refinance_of::text, true);
    update public.payments set voided_at = now(), void_reason = 'The refinancing loan L-' || lpad(new.id::text, 3, '0') || ' was voided'
      where loan_id = new.refinance_of and note = v_code and voided_at is null;
    update public.loans set status = 'approved' where id = new.refinance_of and status = 'refinanced';
    perform set_config('komjei.refinance_undo', '', true);
  elsif old.voided_at is not null and new.voided_at is null then
    raise exception 'A voided refinancing loan cannot be restored. Refinance the old loan again.';
  end if;
  return new;
end $$;
create trigger loans_refinance_undo after update of voided_at on public.loans
  for each row execute function private.loans_refinance_undo();

-- 4. the snapshot written when the old loan goes back to approved is labelled 
create or replace function private.loans_snapshot() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and exists (select 1 from public.loan_installments where loan_id = new.id) then
    perform private.write_snapshot(new.id, case when old.status = 'refinanced' then 'refinance_undone' else 'approved' end, new.id);
  end if;
  return new;
end $$;
