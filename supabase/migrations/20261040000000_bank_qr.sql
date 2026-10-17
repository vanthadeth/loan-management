-- A QR code picture for each receiving bank account (stored in the private 'files' bucket), so contracts can show it.
alter table public.bank_accounts add column if not exists qr_path text;
