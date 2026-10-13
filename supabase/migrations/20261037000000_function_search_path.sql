
-- 20261037: search_path fixed on private.round_money, private.snapshots_immutable, private.build_schedule (security advisor)
alter function private.round_money(numeric, public.currency_code) set search_path = public;
alter function private.snapshots_immutable() set search_path = public;
alter function private.build_schedule(numeric, public.currency_code, numeric, public.rate_basis, int, text, int, public.pay_mode, date) set search_path = public;
