-- Last active: profiles.last_seen existed but nothing wrote it, so every user showed "Never signed in".
-- The app calls this when it opens and every few minutes while it is open. It only ever stamps the caller's
-- own row with the server clock, at most once a minute.
create function public.touch_last_seen() returns void
  language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now()
  where id = auth.uid() and (last_seen is null or last_seen < now() - interval '1 minute');
$$;
revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
