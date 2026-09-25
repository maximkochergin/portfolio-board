begin;

create table public.external_links (
  platform text primary key check (platform in ('email', 'github', 'linkedin', 'telegram', 'discord', 'x', 'cv')),
  url text check (
    url is null or (
      char_length(url) <= 500 and
      ((platform = 'email' and url ~* '^mailto:[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or
       (platform <> 'email' and url ~* '^https://[^[:space:]]+$'))
    )
  )
);

alter table public.external_links enable row level security;
alter table public.external_links force row level security;
revoke all on table public.external_links from anon, authenticated;
grant select on table public.external_links to anon, authenticated;
grant insert, update on table public.external_links to authenticated;

create policy "public can read active external links"
on public.external_links for select to anon, authenticated
using (url is not null);

create policy "owner can read all external links"
on public.external_links for select to authenticated
using ((select private.can_manage_posts()));

create policy "owner can add external links"
on public.external_links for insert to authenticated
with check ((select private.can_manage_posts()));

create policy "owner can update external links"
on public.external_links for update to authenticated
using ((select private.can_manage_posts()))
with check ((select private.can_manage_posts()));

insert into public.external_links (platform, url) values
  ('github', 'https://github.com/maximkochergin'),
  ('linkedin', 'https://www.linkedin.com/in/maksym-kocherhin-312557402/'),
  ('telegram', 'https://t.me/frosteddoor'),
  ('x', 'https://x.com/jphghd');

commit;
