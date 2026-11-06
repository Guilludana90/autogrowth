-- AutoGrowth OS · 0002
-- Corrige el scaffold 0001 y agrega lo necesario para P0:
--   1. Governance de prompts: las altas siempre nacen en draft; las transiciones solo por RPC.
--   2. Auditoría automática (triggers) e inmutable.
--   3. updated_at automático en leads.
--   4. Alta de memberships por admins, perfiles y vista de asesores.
--   5. Campañas, motivo de pérdida, importaciones con rollback por lote.
-- Probar siempre en una base local (supabase start) antes de cualquier entorno compartido.

-- ───────────────────────── Perfiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ───────────────────────── Memberships ─────────────────────────
-- Super Admin gestiona cualquier rol de su organización; Dealership Admin solo roles operativos.
create policy memberships_insert on public.memberships for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin'])
  or (public.has_org_role(organization_id, array['dealership_admin'])
      and role in ('sales_advisor','post_sales','read_only'))
);
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_org_role(organization_id, array['super_admin']))
  with check (public.has_org_role(organization_id, array['super_admin']));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_org_role(organization_id, array['super_admin']) and user_id <> (select auth.uid()));

create or replace view public.org_advisors with (security_invoker = true) as
  select m.organization_id, m.user_id as id, coalesce(nullif(p.full_name, ''), 'Sin nombre') as name
  from public.memberships m
  left join public.profiles p on p.id = m.user_id
  where m.role in ('sales_advisor', 'dealership_admin');

-- ───────────────────────── Campañas ─────────────────────────
create table if not exists public.campaigns (
  organization_id text not null references public.organizations(id),
  platform text not null check (platform in ('meta','google','tiktok','linkedin')),
  external_campaign_id text not null,
  name text not null,
  objective text not null default '',
  status text not null default 'active' check (status in ('active','paused')),
  currency text not null default 'ARS',
  updated_at timestamptz not null default now(),
  primary key (organization_id, platform, external_campaign_id)
);
alter table public.campaigns enable row level security;
create policy campaigns_read on public.campaigns for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','read_only']));
create policy campaigns_write on public.campaigns for all to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin']))
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin']));

-- ───────────────────────── Leads ─────────────────────────
alter table public.leads add column if not exists lost_reason text;
alter table public.leads add column if not exists import_job_id uuid;
alter table public.leads drop constraint if exists leads_lost_reason_required;
alter table public.leads add constraint leads_lost_reason_required
  check (status <> 'lost' or coalesce(trim(lost_reason), '') <> '');

-- El asesor tiene que pertenecer a la misma organización que el lead.
create or replace function public.check_lead_advisor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.advisor_id is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = new.organization_id and m.user_id = new.advisor_id
  ) then
    raise exception 'El asesor no pertenece a la organización %', new.organization_id using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists leads_check_advisor on public.leads;
create trigger leads_check_advisor before insert or update of advisor_id, organization_id on public.leads
  for each row execute function public.check_lead_advisor();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- Un lead no cambia de organización.
create or replace function public.forbid_org_change() returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'No se puede mover un registro a otra organización' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists leads_00_forbid_org_change on public.leads;
create trigger leads_00_forbid_org_change before update on public.leads for each row execute function public.forbid_org_change();

create policy leads_delete on public.leads for delete to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin']));

-- ───────────────────────── Importaciones ─────────────────────────
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  file_name text not null,
  counts jsonb not null,
  previous jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz
);
alter table public.leads drop constraint if exists leads_import_job_fk;
alter table public.leads add constraint leads_import_job_fk
  foreign key (import_job_id) references public.import_jobs(id) on delete set null;
alter table public.import_jobs enable row level security;
create policy import_jobs_read on public.import_jobs for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin']));
create policy import_jobs_insert on public.import_jobs for insert to authenticated
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin']) and created_by = (select auth.uid()));
create policy import_jobs_update on public.import_jobs for update to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin']))
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin']));

-- ───────────────────────── Governance de prompts ─────────────────────────
-- Corrección: en 0001 un Dealership Admin podía insertar directamente status='active'
-- y el autor no podía pasar su borrador a revisión. Ahora:
--   · insert: siempre draft, created_by = usuario actual, sin aprobador.
--   · update directo: prohibido para todos; solo vía RPC (security definer) con reglas de transición.
alter table public.prompt_versions add column if not exists change_note text;
alter table public.prompt_versions add column if not exists decided_reason text;
alter table public.prompt_versions add column if not exists submitted_at timestamptz;
alter table public.prompt_versions add column if not exists activated_at timestamptz;

drop policy if exists prompt_insert on public.prompt_versions;
drop policy if exists prompt_update on public.prompt_versions;
create policy prompt_insert on public.prompt_versions for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin','dealership_admin'])
  and status = 'draft'
  and created_by = (select auth.uid())
  and approved_by is null and approved_at is null
);

create unique index if not exists prompt_one_active
  on public.prompt_versions(organization_id, name) where status = 'active';

create or replace function public.prompt_transition(p_id uuid, p_action text, p_reason text default null)
returns public.prompt_versions
language plpgsql security definer set search_path = public as $$
declare
  v public.prompt_versions;
  uid uuid := auth.uid();
begin
  select * into v from public.prompt_versions where id = p_id for update;
  if not found then raise exception 'Versión inexistente' using errcode = 'P0002'; end if;

  if p_action = 'submit' then
    if v.status <> 'draft' then raise exception 'Solo un borrador se envía a revisión'; end if;
    if v.created_by <> uid and not public.has_org_role(v.organization_id, array['super_admin']) then
      raise exception 'Solo el autor envía su borrador a revisión' using errcode = '42501';
    end if;
    update public.prompt_versions set status = 'in_review', submitted_at = now() where id = p_id returning * into v;

  elsif p_action in ('approve', 'reject', 'activate', 'rollback') then
    if not public.has_org_role(v.organization_id, array['super_admin']) then
      raise exception 'Solo Super Admin puede % prompts', p_action using errcode = '42501';
    end if;
    if p_action = 'approve' then
      if v.status <> 'in_review' then raise exception 'Solo se aprueba una versión en revisión'; end if;
      update public.prompt_versions set status = 'approved', approved_by = uid, approved_at = now(), decided_reason = p_reason
        where id = p_id returning * into v;
    elsif p_action = 'reject' then
      if v.status not in ('in_review', 'approved') then raise exception 'No se puede rechazar en estado %', v.status; end if;
      if coalesce(trim(p_reason), '') = '' then raise exception 'El rechazo requiere un motivo'; end if;
      update public.prompt_versions set status = 'rejected', decided_reason = p_reason where id = p_id returning * into v;
    elsif p_action = 'activate' then
      if v.status <> 'approved' then raise exception 'Solo se activa una versión aprobada'; end if;
      update public.prompt_versions set status = 'rolled_back', decided_reason = coalesce(p_reason, 'Reemplazada por ' || v.version)
        where organization_id = v.organization_id and name = v.name and status = 'active';
      update public.prompt_versions set status = 'active', activated_at = now() where id = p_id returning * into v;
    elsif p_action = 'rollback' then
      -- Vuelve a activar esta versión (que estuvo activa antes) y retira la actual.
      if v.status <> 'rolled_back' or v.approved_by is null then
        raise exception 'Solo se puede volver a una versión aprobada que estuvo activa';
      end if;
      if coalesce(trim(p_reason), '') = '' then raise exception 'El rollback requiere un motivo'; end if;
      update public.prompt_versions set status = 'rolled_back', decided_reason = p_reason
        where organization_id = v.organization_id and name = v.name and status = 'active';
      update public.prompt_versions set status = 'active', activated_at = now() where id = p_id returning * into v;
    end if;
  else
    raise exception 'Acción desconocida: %', p_action;
  end if;
  return v;
end $$;
revoke all on function public.prompt_transition(uuid, text, text) from public;
grant execute on function public.prompt_transition(uuid, text, text) to authenticated;

-- ───────────────────────── Auditoría ─────────────────────────
-- Se completa sola por triggers (security definer). Nadie puede insertar, modificar ni borrar desde la API.
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
    coalesce(rec->>'id', rec->>'external_campaign_id', ''),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['leads','tasks','memberships','prompt_versions','import_jobs','campaigns'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
