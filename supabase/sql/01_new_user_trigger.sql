-- Trigger: automatically create a public.users profile row when a new
-- auth.users record is inserted (i.e. on every Supabase Auth sign-up).
--
-- Run this once in the Supabase SQL editor after the public schema is set up.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, billing_tier, created_at)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    'free',
    now()
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
