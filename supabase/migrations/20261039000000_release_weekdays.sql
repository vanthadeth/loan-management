-- Week days on which money is released (0 = Sunday ... 6 = Saturday). New loans default their release date to the next
-- of these days; a different date is allowed with a warning. Default Wednesday and Friday (what the form used before).
alter table public.app_settings add column release_weekdays smallint[];
update public.app_settings set release_weekdays = '{3,5}' where id = 1;
alter table public.app_settings
  alter column release_weekdays set default '{3,5}',
  alter column release_weekdays set not null,
  add constraint app_settings_release_weekdays_check
    check (cardinality(release_weekdays) between 1 and 7 and release_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);
