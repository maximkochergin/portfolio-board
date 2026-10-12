-- Execute as a database administrator. All writes below are rolled back.
begin;
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', owner_id::text, 'role', 'authenticated')::text
  from public.site_settings where singleton
), true);
set local role authenticated;

do $$
declare
  original_url text;
  original_email text;
  temporary_url text;
  before_conflict jsonb;
  after_conflict jsonb;
  ok boolean;
begin
  if not private.can_manage_posts() then
    raise exception 'An existing owner is required for this rollback test';
  end if;
  if has_function_privilege('anon', 'public.save_external_links(jsonb)', 'execute') then
    raise exception 'Anonymous callers must not execute contact saves';
  end if;
  select url into original_url from public.external_links where platform = 'github';
  select url into original_email from public.external_links where platform = 'email';
  temporary_url := case when original_url = 'https://github.com/portfolio-transaction-check'
    then 'https://github.com/portfolio-transaction-check-2'
    else 'https://github.com/portfolio-transaction-check' end;
  ok := public.save_external_links(jsonb_build_array(jsonb_build_object(
    'platform','github','url',temporary_url,'expected_url',original_url
  )));
  if ok is distinct from true or (select url from public.external_links where platform='github') is distinct from temporary_url then
    raise exception 'An owner save must succeed';
  end if;

  select jsonb_agg(to_jsonb(row) order by platform) into before_conflict from public.external_links as row;
  begin
    perform public.save_external_links(jsonb_build_array(
      jsonb_build_object('platform','email','url','mailto:qa@example.test','expected_url',original_email),
      jsonb_build_object('platform','github','url','https://github.com/stale','expected_url',original_url)
    ));
    raise exception 'A stale batch must be rejected';
  exception when serialization_failure then null;
  end;
  select jsonb_agg(to_jsonb(row) order by platform) into after_conflict from public.external_links as row;
  if after_conflict is distinct from before_conflict then
    raise exception 'A failed batch must roll back every contact';
  end if;

  begin
    perform public.save_external_links('[{"platform":"github","url":null}]'::jsonb);
    raise exception 'Missing snapshots must be rejected';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_external_links('[{"platform":"github","url":null,"expected_url":null},{"platform":"github","url":null,"expected_url":null}]'::jsonb);
    raise exception 'Duplicate platforms must be rejected';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_external_links(jsonb_build_array(jsonb_build_object(
      'platform','github','url','javascript:alert(1)','expected_url',temporary_url
    )));
    raise exception 'Invalid URLs must be rejected by table constraints';
  exception when check_violation then null;
  end;

  perform public.save_external_links(jsonb_build_array(jsonb_build_object(
    'platform','email','url','mailto:qa@example.test','expected_url',original_email
  )));
  perform public.save_external_links('[{"platform":"email","url":null,"expected_url":"mailto:qa@example.test"}]'::jsonb);
  if not exists (select 1 from public.external_links where platform='email' and url is null) then
    raise exception 'The owner must be able to hide a contact';
  end if;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  if private.can_manage_posts() then raise exception 'A non-owner must not receive owner access'; end if;
  if exists (select 1 from public.posts where status='draft') or exists (select 1 from public.site_settings) then
    raise exception 'A non-owner must not read drafts or owner settings';
  end if;
  begin
    perform public.save_external_links('[{"platform":"email","url":null,"expected_url":null}]'::jsonb);
    raise exception 'A non-owner contact save must be rejected';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
