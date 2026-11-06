-- AutoGrowth OS · 0005 · P3 Inteligencia
--   1. recommendation_runs: cada diagnóstico (reglas o IA) que alguien guarda o califica, inmutable.
--   2. recommendation_feedback: útil / no útil + comentario, uno por usuario y corrida.
--   3. prompt_version_events: historial de transiciones de prompts escrito por trigger.
--   4. prompt_update_draft: el autor edita su borrador (el update directo sigue prohibido).
-- Probar siempre en una base local antes de cualquier entorno compartido.

-- ───────────────────────── Corridas de recomendación ─────────────────────────
create table if not exists public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  platform text not null check (platform in ('meta','google','tiktok','linkedin')),
  campaign_id text not null,
  window_from date not null,
  window_to date not null,
  engine text not null check (engine in ('rules','ai')),
  version text not null check (length(version) between 1 and 200),
  prompt_version_id uuid references public.prompt_versions(id),
  priority text not null check (priority in ('high','medium','low')),
  problem_area text not null check (problem_area in ('media','capture','sales','data','none')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  payload jsonb not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint runs_window check (window_from <= window_to),
  constraint runs_ai_prompt check (engine = 'rules' or prompt_version_id is not null)
);
create index if not exists recommendation_runs_campaign on public.recommendation_runs(organization_id, platform, campaign_id, created_at desc);
alter table public.recommendation_runs enable row level security;

create policy runs_read on public.recommendation_runs for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','read_only']));
create policy runs_insert on public.recommendation_runs for insert to authenticated
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor']) and created_by = (select auth.uid()));
-- Sin update ni delete: una corrida es evidencia histórica.

-- Una corrida de IA solo puede citar la versión de prompt activa de su organización.
create or replace function public.check_run_prompt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.engine = 'ai' and not exists (
    select 1 from public.prompt_versions p
    where p.id = new.prompt_version_id and p.organization_id = new.organization_id and p.status = 'active'
  ) then
    raise exception 'La corrida de IA requiere la versión de prompt activa de la organización' using errcode = '23514';
  end if;
  if new.engine = 'rules' then new.prompt_version_id := null; end if;
  return new;
end $$;
drop trigger if exists runs_check_prompt on public.recommendation_runs;
create trigger runs_check_prompt before insert on public.recommendation_runs for each row execute function public.check_run_prompt();

-- ───────────────────────── Feedback ─────────────────────────
create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  run_id uuid not null references public.recommendation_runs(id) on delete cascade,
  useful boolean not null,
  comment text check (comment is null or length(comment) <= 500),
  user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id)
);
alter table public.recommendation_feedback enable row level security;

create policy feedback_read on public.recommendation_feedback for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','read_only']));
create policy feedback_insert on public.recommendation_feedback for insert to authenticated
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor']) and user_id = (select auth.uid()));
create policy feedback_update on public.recommendation_feedback for update to authenticated
  using (user_id = (select auth.uid()) and public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor']))
  with check (user_id = (select auth.uid()) and public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor']));

-- La organización del feedback es siempre la de la corrida; no se mueve de corrida ni de usuario.
create or replace function public.feedback_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare run_org text;
begin
  select organization_id into run_org from public.recommendation_runs where id = new.run_id;
  if run_org is null then raise exception 'Corrida inexistente' using errcode = 'P0002'; end if;
  if tg_op = 'INSERT' then
    if new.organization_id is distinct from run_org then
      raise exception 'El feedback tiene que ser de la organización de la corrida' using errcode = '42501';
    end if;
  else
    if new.run_id <> old.run_id or new.user_id <> old.user_id or new.organization_id <> old.organization_id then
      raise exception 'Solo se puede cambiar la respuesta y el comentario' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  new.comment := nullif(trim(new.comment), '');
  return new;
end $$;
drop trigger if exists feedback_00_fill on public.recommendation_feedback;
create trigger feedback_00_fill before insert or update on public.recommendation_feedback for each row execute function public.feedback_fill();

-- ───────────────────────── Historial de prompts ─────────────────────────
alter table public.prompt_versions add column if not exists parent_version_id uuid references public.prompt_versions(id);

create table if not exists public.prompt_version_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  version_id uuid not null references public.prompt_versions(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists prompt_events_version on public.prompt_version_events(version_id, created_at);
alter table public.prompt_version_events enable row level security;
create policy prompt_events_read on public.prompt_version_events for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','read_only']));
revoke insert, update, delete, truncate on public.prompt_version_events from anon, authenticated;

create or replace function public.prompt_log_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.prompt_version_events(organization_id, version_id, from_status, to_status, actor_id, reason)
    values (new.organization_id, new.id, null, new.status, auth.uid(), new.change_note);
  elsif new.status is distinct from old.status then
    insert into public.prompt_version_events(organization_id, version_id, from_status, to_status, actor_id, reason)
    values (new.organization_id, new.id, old.status, new.status, auth.uid(),
            case when new.decided_reason is distinct from old.decided_reason then new.decided_reason end);
  end if;
  return new;
end $$;
drop trigger if exists prompt_events on public.prompt_versions;
create trigger prompt_events after insert or update on public.prompt_versions for each row execute function public.prompt_log_event();

-- El autor corrige su borrador antes de enviarlo. Nada más se edita.
create or replace function public.prompt_update_draft(p_id uuid, p_text text, p_note text default null)
returns public.prompt_versions
language plpgsql security definer set search_path = public as $$
declare v public.prompt_versions;
begin
  select * into v from public.prompt_versions where id = p_id for update;
  if not found then raise exception 'Versión inexistente' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Solo se edita un borrador'; end if;
  if v.created_by <> auth.uid() then raise exception 'Solo el autor edita su borrador' using errcode = '42501'; end if;
  if coalesce(trim(p_text), '') = '' or length(p_text) > 20000 then raise exception 'El prompt no puede quedar vacío ni superar 20.000 caracteres'; end if;
  update public.prompt_versions set prompt_text = p_text, change_note = nullif(trim(p_note), '') where id = p_id returning * into v;
  return v;
end $$;
revoke all on function public.prompt_update_draft(uuid, text, text) from public;
grant execute on function public.prompt_update_draft(uuid, text, text) to authenticated;

-- Nombres de autor y aprobador para la lista de versiones (respeta RLS de prompts y perfiles).
create or replace view public.prompt_versions_named with (security_invoker = true) as
  select p.*, coalesce(nullif(a.full_name, ''), 'Sin nombre') as created_by_name, nullif(b.full_name, '') as approved_by_name
  from public.prompt_versions p
  left join public.profiles a on a.id = p.created_by
  left join public.profiles b on b.id = p.approved_by;

-- ───────────────────────── Auditoría ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['recommendation_runs','recommendation_feedback'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
