begin;

create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('work', 'notes', 'about')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  subtitle text check (subtitle is null or char_length(subtitle) <= 160),
  link text check (link is null or link ~* '^https?://'),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null references auth.users(id) on delete restrict
);

create index if not exists posts_published_at_idx
on public.posts (published_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
before update on public.posts
for each row execute procedure public.touch_updated_at();

create or replace function private.can_manage_posts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_settings
    where owner_id = auth.uid()
  );
$$;

alter table public.posts enable row level security;
alter table public.site_settings enable row level security;

revoke all on table public.posts from anon, authenticated;
revoke all on table public.site_settings from anon, authenticated;
revoke all on function private.can_manage_posts() from public;

grant select on table public.posts to anon, authenticated;
grant insert, update, delete on table public.posts to authenticated;
grant execute on function private.can_manage_posts() to authenticated;

drop policy if exists "public can read posts" on public.posts;
create policy "public can read posts"
on public.posts for select
to anon, authenticated
using (true);

drop policy if exists "owner can create posts" on public.posts;
create policy "owner can create posts"
on public.posts for insert
to authenticated
with check ((select private.can_manage_posts()));

drop policy if exists "owner can update posts" on public.posts;
create policy "owner can update posts"
on public.posts for update
to authenticated
using ((select private.can_manage_posts()))
with check ((select private.can_manage_posts()));

drop policy if exists "owner can delete posts" on public.posts;
create policy "owner can delete posts"
on public.posts for delete
to authenticated
using ((select private.can_manage_posts()));

commit;
