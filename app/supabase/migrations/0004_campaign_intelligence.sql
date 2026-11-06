-- P2 · Campaign Intelligence: importación transaccional de métricas diarias, reversión e integraciones (Meta en sandbox).
-- Aplicar solo en una base local o de staging. No conecta nada por sí sola.

-- ───────────────────────── Lotes de métricas ─────────────────────────
create table if not exists public.metric_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  platform text not null check (platform in ('meta','google','tiktok','linkedin')),
  source text not null check (source in ('csv','meta_api')),
  file_name text not null,
  range_from date,
  range_to date,
  counts jsonb not null default '{}'::jsonb,
  -- Para revertir: filas que existían antes (valores previos) y claves/campañas que creó este lote.
  previous jsonb not null default '[]'::jsonb,
  created_keys jsonb not null default '[]'::jsonb,
  created_campaigns jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz
);
alter table public.metric_import_jobs enable row level security;
create policy metric_jobs_read on public.metric_import_jobs for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin']));
-- Sin insert/update directos: solo las RPC de abajo.
revoke insert, update, delete on public.metric_import_jobs from anon, authenticated;

alter table public.campaign_metrics_daily add column if not exists import_job_id uuid references public.metric_import_jobs(id) on delete set null;
alter table public.campaign_metrics_daily add column if not exists source text not null default 'csv' check (source in ('csv','meta_api','seed'));

-- Las métricas se escriben solo por RPC, para que cada cambio quede en un lote reversible.
drop policy if exists campaign_write on public.campaign_metrics_daily;
revoke insert, update, delete on public.campaign_metrics_daily from anon, authenticated;

create or replace function public.import_campaign_metrics(
  p_org text, p_platform text, p_source text, p_file_name text, p_rows jsonb, p_campaigns jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job uuid;
  r jsonb;
  v_old public.campaign_metrics_daily;
  v_prev jsonb := '[]'::jsonb;
  v_keys jsonb := '[]'::jsonb;
  v_camps jsonb := '[]'::jsonb;
  v_create int := 0; v_update int := 0; v_same int := 0;
  v_date date; v_from date; v_to date;
  v_name text;
  c jsonb;
begin
  if not public.has_org_role(p_org, array['super_admin','dealership_admin']) then
    raise exception 'No tenés permiso para importar métricas de %', p_org using errcode = '42501';
  end if;
  if p_platform not in ('meta','google','tiktok','linkedin') then raise exception 'Plataforma inválida: %', p_platform; end if;
  if p_source not in ('csv','meta_api') then raise exception 'Origen inválido: %', p_source; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'No hay filas para importar'; end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'Máximo 20.000 filas por lote'; end if;
  if coalesce(trim(p_file_name), '') = '' then raise exception 'Falta el nombre del archivo u origen'; end if;

  insert into public.metric_import_jobs(organization_id, platform, source, file_name)
  values (p_org, p_platform, p_source, p_file_name) returning id into v_job;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_date := (r->>'date')::date;
    if v_date > current_date then raise exception 'Fecha futura en métricas: %', v_date; end if;
    if coalesce(trim(r->>'campaign_id'), '') = '' then raise exception 'Fila sin campaña'; end if;
    if (r->>'spend')::numeric < 0 or (r->>'impressions')::int < 0 or (r->>'clicks')::int < 0 or (r->>'platform_leads')::int < 0 then
      raise exception 'Valores negativos en % %', r->>'campaign_id', v_date;
    end if;
    v_from := least(coalesce(v_from, v_date), v_date);
    v_to := greatest(coalesce(v_to, v_date), v_date);
    v_name := coalesce(nullif(trim(r->>'campaign_name'), ''), r->>'campaign_id');

    if not exists (select 1 from public.campaigns where organization_id = p_org and platform = p_platform and external_campaign_id = r->>'campaign_id') then
      insert into public.campaigns(organization_id, platform, external_campaign_id, name, currency)
      values (p_org, p_platform, r->>'campaign_id', v_name, coalesce(r->>'currency', 'ARS'));
      v_camps := v_camps || to_jsonb(r->>'campaign_id');
    end if;

    select * into v_old from public.campaign_metrics_daily
      where organization_id = p_org and platform = p_platform and external_campaign_id = r->>'campaign_id' and metric_date = v_date
      for update;
    if not found then
      insert into public.campaign_metrics_daily(organization_id, platform, external_campaign_id, campaign_name, metric_date, currency,
                                                spend, impressions, clicks, platform_leads, import_job_id, source)
      values (p_org, p_platform, r->>'campaign_id', v_name, v_date, coalesce(r->>'currency', 'ARS'),
              (r->>'spend')::numeric, (r->>'impressions')::int, (r->>'clicks')::int, (r->>'platform_leads')::int, v_job, p_source);
      v_keys := v_keys || jsonb_build_object('campaign_id', r->>'campaign_id', 'date', v_date);
      v_create := v_create + 1;
    elsif v_old.spend = (r->>'spend')::numeric and v_old.impressions = (r->>'impressions')::int and v_old.clicks = (r->>'clicks')::int
          and v_old.platform_leads = (r->>'platform_leads')::int and v_old.currency = coalesce(r->>'currency', 'ARS') then
      v_same := v_same + 1;
    else
      v_prev := v_prev || jsonb_build_object(
        'campaign_id', v_old.external_campaign_id, 'date', v_old.metric_date, 'campaign_name', v_old.campaign_name,
        'currency', v_old.currency, 'spend', v_old.spend, 'impressions', v_old.impressions, 'clicks', v_old.clicks,
        'platform_leads', v_old.platform_leads, 'import_job_id', v_old.import_job_id, 'source', v_old.source);
      update public.campaign_metrics_daily set
        campaign_name = v_name, currency = coalesce(r->>'currency', 'ARS'), spend = (r->>'spend')::numeric,
        impressions = (r->>'impressions')::int, clicks = (r->>'clicks')::int, platform_leads = (r->>'platform_leads')::int,
        import_job_id = v_job, source = p_source, imported_at = now()
      where id = v_old.id;
      v_update := v_update + 1;
    end if;
  end loop;

  -- Nombres de campaña informados aparte (p. ej. campañas nuevas sin filas con nombre).
  for c in select * from jsonb_array_elements(coalesce(p_campaigns, '[]'::jsonb)) loop
    update public.campaigns set name = c->>'name', updated_at = now()
      where organization_id = p_org and platform = p_platform and external_campaign_id = c->>'id'
        and (c->>'id') in (select jsonb_array_elements_text(v_camps)) and coalesce(trim(c->>'name'), '') <> '';
  end loop;

  update public.metric_import_jobs set
    range_from = v_from, range_to = v_to, previous = v_prev, created_keys = v_keys, created_campaigns = v_camps,
    counts = jsonb_build_object('create', v_create, 'update', v_update, 'unchanged', v_same, 'campaigns', jsonb_array_length(v_camps))
  where id = v_job;
  return v_job;
end $$;

-- Revierte un lote. Solo el más reciente vigente de esa organización y plataforma, para no pisar lotes posteriores.
create or replace function public.rollback_metric_import(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  j public.metric_import_jobs;
  k jsonb;
begin
  select * into j from public.metric_import_jobs where id = p_job for update;
  if not found then raise exception 'Lote inexistente'; end if;
  if not public.has_org_role(j.organization_id, array['super_admin','dealership_admin']) then
    raise exception 'No tenés permiso para revertir este lote' using errcode = '42501';
  end if;
  if j.rolled_back_at is not null then raise exception 'El lote ya fue revertido'; end if;
  if exists (select 1 from public.metric_import_jobs where organization_id = j.organization_id and platform = j.platform
             and rolled_back_at is null and created_at > j.created_at) then
    raise exception 'Hay lotes posteriores de la misma plataforma: revertí primero el más reciente';
  end if;

  for k in select * from jsonb_array_elements(j.created_keys) loop
    delete from public.campaign_metrics_daily
      where organization_id = j.organization_id and platform = j.platform
        and external_campaign_id = k->>'campaign_id' and metric_date = (k->>'date')::date and import_job_id = j.id;
  end loop;
  for k in select * from jsonb_array_elements(j.previous) loop
    update public.campaign_metrics_daily set
      campaign_name = k->>'campaign_name', currency = k->>'currency', spend = (k->>'spend')::numeric,
      impressions = (k->>'impressions')::int, clicks = (k->>'clicks')::int, platform_leads = (k->>'platform_leads')::int,
      import_job_id = nullif(k->>'import_job_id', '')::uuid, source = coalesce(k->>'source', 'csv')
    where organization_id = j.organization_id and platform = j.platform
      and external_campaign_id = k->>'campaign_id' and metric_date = (k->>'date')::date;
  end loop;
  delete from public.campaigns c
    where c.organization_id = j.organization_id and c.platform = j.platform
      and c.external_campaign_id in (select jsonb_array_elements_text(j.created_campaigns))
      and not exists (select 1 from public.campaign_metrics_daily m
                      where m.organization_id = c.organization_id and m.platform = c.platform and m.external_campaign_id = c.external_campaign_id);
  update public.metric_import_jobs set rolled_back_at = now() where id = j.id;
end $$;

revoke all on function public.import_campaign_metrics(text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.rollback_metric_import(uuid) from public, anon;
grant execute on function public.import_campaign_metrics(text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.rollback_metric_import(uuid) to authenticated;

-- ───────────────────────── Integraciones ─────────────────────────
-- Estado visible para administradores. Solo el servidor (service role) lo escribe, después de probar la conexión.
create table if not exists public.integrations (
  organization_id text not null references public.organizations(id),
  provider text not null check (provider in ('meta','google','tiktok','linkedin')),
  status text not null default 'not_connected' check (status in ('not_connected','connected','error','revoked')),
  external_account_id text,
  external_account_name text,
  currency text,
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider),
  -- "Conectada" exige una prueba registrada contra la cuenta.
  constraint integrations_connected_tested check (status <> 'connected' or (last_tested_at is not null and external_account_id is not null))
);
alter table public.integrations enable row level security;
create policy integrations_read on public.integrations for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin']));
revoke insert, update, delete on public.integrations from anon, authenticated;

-- Tokens: sin políticas y sin grants para anon/authenticated. Solo los lee el servidor con service role.
create table if not exists public.integration_secrets (
  organization_id text not null references public.organizations(id),
  provider text not null check (provider in ('meta','google','tiktok','linkedin')),
  access_token text not null,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

create or replace function public.disconnect_integration(p_org text, p_provider text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['super_admin','dealership_admin']) then
    raise exception 'No tenés permiso para desconectar integraciones' using errcode = '42501';
  end if;
  delete from public.integration_secrets where organization_id = p_org and provider = p_provider;
  update public.integrations set status = 'revoked', last_error = null, updated_at = now()
    where organization_id = p_org and provider = p_provider;
end $$;
revoke all on function public.disconnect_integration(text, text) from public, anon;
grant execute on function public.disconnect_integration(text, text) to authenticated;

-- ───────────────────────── Auditoría ─────────────────────────
-- integrations no tiene id: se identifica por proveedor. integration_secrets nunca se audita (guardaría el token).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_events(organization_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (
    rec->>'organization_id',
    auth.uid(),
    tg_table_name,
    coalesce(rec->>'id', rec->>'external_campaign_id', rec->>'provider', ''),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['metric_import_jobs','integrations'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
