-- Late fee is settled on its own, not with each payment: a settlement collects some of the fee and forgives
-- the rest. Forgiving all of it records a payment of 0, so a zero amount is allowed when a fee is forgiven.
alter table public.payments drop constraint payments_amount_check;
alter table public.payments add constraint payments_amount_check check (amount > 0 or (amount = 0 and late_fee_waived > 0));
