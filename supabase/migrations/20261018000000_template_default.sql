-- One default template per type (contract / schedule); the contract page opens with it selected.
alter table public.contract_templates add column is_default boolean not null default false;
create unique index contract_templates_one_default on public.contract_templates (kind) where is_default;
update public.contract_templates t set is_default = true
 where t.id = (select min(id) from public.contract_templates x where x.kind = t.kind);
