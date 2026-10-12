begin;

-- Save all changed contacts atomically, comparing the values the owner reviewed.
create or replace function public.save_external_links(changes jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry jsonb;
  contact_platform text;
  expected text;
  next_url text;
  wrote boolean;
begin
  if not (select private.can_manage_posts()) then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Expected a changes array';
  end if;
  if jsonb_array_length(changes) not between 1 and 7 then
    raise exception using errcode = '22023', message = 'Expected one to seven changed contacts';
  end if;
  if exists (
    select 1 from jsonb_array_elements(changes) as items(value)
    where jsonb_typeof(value) is distinct from 'object'
       or jsonb_typeof(value -> 'platform') is distinct from 'string'
       or value ->> 'platform' not in ('email', 'github', 'linkedin', 'telegram', 'discord', 'x', 'cv')
       or not (value ? 'url') or jsonb_typeof(value -> 'url') not in ('string', 'null')
       or not (value ? 'expected_url') or jsonb_typeof(value -> 'expected_url') not in ('string', 'null')
  ) or (select count(distinct value ->> 'platform') from jsonb_array_elements(changes) as items(value)) <> jsonb_array_length(changes) then
    raise exception using errcode = '22023', message = 'Invalid or duplicate contact change';
  end if;

  -- A stable lock order avoids deadlocks when two tabs save several contacts.
  for entry in select value from jsonb_array_elements(changes) as items(value) order by value ->> 'platform'
  loop
    contact_platform := entry ->> 'platform';
    expected := entry ->> 'expected_url';
    next_url := entry ->> 'url';
    wrote := false;
    update public.external_links
       set url = next_url
     where platform = contact_platform and url is not distinct from expected
    returning true into wrote;

    if not coalesce(wrote, false) and expected is null then
      insert into public.external_links (platform, url) values (contact_platform, next_url)
      on conflict (platform) do nothing
      returning true into wrote;
    end if;
    if not coalesce(wrote, false) then
      raise exception using errcode = '40001', message = 'A contact changed since it was opened';
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.save_external_links(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_external_links(jsonb) to authenticated;

commit;
