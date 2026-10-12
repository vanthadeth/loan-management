-- Link to the Google Doc used as the loan contract template (shared "anyone with the link can view").
alter table public.app_settings add column contract_template_url text not null default '';
