-- Several contract templates (Google Docs shared as "anyone with the link can view"), each in Khmer or English.
create table public.contract_templates (
  id bigint generated always as identity primary key,
  name text not null,
  url text not null,
  lang text not null default 'km' check (lang in ('km', 'en')),
  created_at timestamptz not null default now()
);
alter table public.contract_templates enable row level security;
revoke all on public.contract_templates from anon;
create policy contract_templates_select on public.contract_templates for select to authenticated using (private.is_active());
create policy contract_templates_write on public.contract_templates for all to authenticated
  using (private.has_perm('settings.edit')) with check (private.has_perm('settings.edit'));

-- carry over a template link saved earlier (app_settings.contract_template_url is no longer used)
insert into public.contract_templates (name, url, lang)
  select 'Contract', contract_template_url, 'en' from public.app_settings where contract_template_url <> '';
