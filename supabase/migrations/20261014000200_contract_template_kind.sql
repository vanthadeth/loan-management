-- A template is either the contract itself or the payment schedule annex (a separate Google Doc).
alter table public.contract_templates add column kind text not null default 'contract' check (kind in ('contract', 'schedule'));
