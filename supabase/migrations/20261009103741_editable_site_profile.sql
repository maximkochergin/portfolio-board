begin;

create table public.site_profile (
  singleton boolean primary key default true check (singleton),
  title text not null default 'archive' check (char_length(btrim(title)) between 1 and 80),
  introduction text not null default 'Projects and notes.' check (char_length(introduction) <= 240),
  updated_at timestamptz not null default now()
);

alter table public.site_profile enable row level security;
alter table public.site_profile force row level security;
revoke all on table public.site_profile from anon, authenticated;
grant select on table public.site_profile to anon, authenticated;
grant update on table public.site_profile to authenticated;

create policy "public can read site profile" on public.site_profile
for select to anon, authenticated using (true);
create policy "owner can update site profile" on public.site_profile
for update to authenticated
using ((select private.can_manage_posts()))
with check ((select private.can_manage_posts()));

create trigger site_profile_touch_updated_at
before update on public.site_profile
for each row execute procedure public.touch_updated_at();

insert into public.site_profile (singleton) values (true);

commit;
