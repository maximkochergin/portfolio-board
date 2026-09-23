begin;

alter table public.posts
  add column if not exists status text;

update public.posts
set status = 'published'
where status is null;

alter table public.posts
  alter column status set default 'published',
  alter column status set not null;

alter table public.posts
  drop constraint if exists posts_status_check;

alter table public.posts
  add constraint posts_status_check check (status in ('draft', 'published'));

drop index if exists public.posts_published_at_idx;
create index if not exists posts_public_feed_idx
  on public.posts (published_at desc)
  where status = 'published';

drop policy if exists "public can read posts" on public.posts;
drop policy if exists "public can read published posts" on public.posts;
create policy "public can read published posts"
on public.posts for select
to anon, authenticated
using (status = 'published');

drop policy if exists "owner can read all posts" on public.posts;
create policy "owner can read all posts"
on public.posts for select
to authenticated
using ((select private.can_manage_posts()));

commit;
