-- "Last active" on the users page: the app calls touch_last_seen() when it opens, when it comes back to the
-- screen and every 5 minutes while in use. Existing users start from their last sign-in.
create or replace function public.touch_last_seen() returns void
  language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid() and status = 'active'
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
update public.profiles p set last_seen = u.last_sign_in_at
  from auth.users u where u.id = p.id and p.last_seen is null and u.last_sign_in_at is not null;
