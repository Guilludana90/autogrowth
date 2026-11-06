-- AutoGrowth OS · 0003 · Operación comercial (P1)
--   · Historial del lead (lead_activities): notas manuales + eventos automáticos de estado y asignación.
--   · Tareas con prioridad, notas, vencimiento y cierre.
--   · Documentos de precios versionados con vigencia y una sola versión activa por categoría.
--   · Cotizaciones con numeración por concesionario y aprobación gerencial por RPC.
--   · Usuarios: email en profiles, alta automática del perfil y alta de miembros por email.

-- ───────────────────────── Perfiles ─────────────────────────
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email on public.profiles(lower(email)) where email is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Alta de un usuario existente (ya invitado en Supabase Auth) a una organización, por email.
-- Mismas reglas que la policy memberships_insert: Dealership Admin no da roles de administración.
create or replace function public.add_member_by_email(p_org text, p_email text, p_role text)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  m public.memberships;
begin
  if not (public.has_org_role(p_org, array['super_admin'])
          or (public.has_org_role(p_org, array['dealership_admin']) and p_role in ('sales_advisor','post_sales','read_only'))) then
    raise exception 'No tenés permiso para asignar el rol %', p_role using errcode = '42501';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No existe un usuario con ese email: primero hay que invitarlo desde Supabase Auth' using errcode = 'P0002';
  end if;
  insert into public.memberships(organization_id, user_id, role) values (p_org, v_user, p_role)
    on conflict (organization_id, user_id) do update set role = excluded.role
    returning * into m;
  return m;
end $$;
revoke all on function public.add_member_by_email(text, text, text) from public;
grant execute on function public.add_member_by_email(text, text, text) to authenticated;

-- ───────────────────────── Historial del lead ─────────────────────────
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('created','status','assigned','note','task','quote','import')),
  body text not null check (length(trim(body)) between 1 and 2000),
  actor_id uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead on public.lead_activities(lead_id, created_at desc);
alter table public.lead_activities enable row level security;
create policy lead_activities_read on public.lead_activities for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
-- A mano solo se cargan notas; el resto lo escriben los triggers.
create policy lead_activities_note on public.lead_activities for insert to authenticated with check (
  kind = 'note'
  and actor_id = (select auth.uid())
  and public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales'])
  and exists (select 1 from public.leads l where l.id = lead_id and l.organization_id = lead_activities.organization_id)
);

create or replace function public.log_lead_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  labels jsonb := '{"new":"Nuevo","contacted":"Contactado","negotiation":"Negociación","won":"Ganado","lost":"Perdido"}';
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities(organization_id, lead_id, kind, body)
    values (new.organization_id, new.id, case when new.import_job_id is null then 'created' else 'import' end,
            case when new.import_job_id is null then 'Lead creado (origen: ' || new.source || ')' else 'Lead importado desde CSV' end);
  else
    if new.status is distinct from old.status then
      insert into public.lead_activities(organization_id, lead_id, kind, body)
      values (new.organization_id, new.id, 'status',
              'Estado: ' || (labels->>old.status) || ' → ' || (labels->>new.status)
              || case when new.status = 'lost' then ' (' || new.lost_reason || ')' else '' end);
    end if;
    if new.advisor_id is distinct from old.advisor_id then
      insert into public.lead_activities(organization_id, lead_id, kind, body)
      values (new.organization_id, new.id, 'assigned',
              case when new.advisor_id is null then 'Asesor quitado'
                   else 'Asignado a ' || coalesce((select nullif(full_name, '') from public.profiles where id = new.advisor_id), 'asesor') end);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_activity on public.leads;
create trigger leads_activity after insert or update on public.leads for each row execute function public.log_lead_activity();

-- ───────────────────────── Tareas ─────────────────────────
alter table public.tasks add column if not exists notes text;
alter table public.tasks add column if not exists priority text not null default 'normal';
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('low','normal','high'));
alter table public.tasks drop constraint if exists tasks_title_len;
alter table public.tasks add constraint tasks_title_len check (length(trim(title)) between 2 and 200);

create or replace function public.check_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null and not exists (select 1 from public.leads where id = new.lead_id and organization_id = new.organization_id) then
    raise exception 'El lead no pertenece a la organización' using errcode = '23514';
  end if;
  if new.assignee_id is not null and not exists (
    select 1 from public.memberships where organization_id = new.organization_id and user_id = new.assignee_id
  ) then
    raise exception 'El responsable no pertenece a la organización' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'No se puede mover un registro a otra organización' using errcode = '42501';
  end if;
  new.completed_at := case when new.status = 'done' then coalesce(new.completed_at, now()) else null end;
  return new;
end $$;
drop trigger if exists tasks_check on public.tasks;
create trigger tasks_check before insert or update on public.tasks for each row execute function public.check_task();

create or replace function public.log_task_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.lead_activities(organization_id, lead_id, kind, body)
    values (new.organization_id, new.lead_id, 'task', 'Tarea creada: ' || new.title);
  elsif new.status = 'done' and old.status <> 'done' then
    insert into public.lead_activities(organization_id, lead_id, kind, body)
    values (new.organization_id, new.lead_id, 'task', 'Tarea completada: ' || new.title);
  end if;
  return new;
end $$;
drop trigger if exists tasks_activity on public.tasks;
create trigger tasks_activity after insert or update on public.tasks for each row execute function public.log_task_activity();

-- ───────────────────────── Documentos de precios ─────────────────────────
create table if not exists public.price_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  category text not null check (category in ('price_list','savings_plan','factory_financing','agreement','other')),
  title text not null check (length(trim(title)) between 2 and 160),
  file_name text not null,
  valid_from date not null,
  valid_to date,
  -- Filas validadas de la lista: [{model, version, price}]. Los adjuntos van a Storage privado (fase siguiente).
  rows jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index if not exists price_documents_one_active
  on public.price_documents(organization_id, category) where status = 'active';
alter table public.price_documents enable row level security;
create policy price_documents_read on public.price_documents for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy price_documents_insert on public.price_documents for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin','dealership_admin'])
  and status = 'draft' and created_by = (select auth.uid()) and activated_by is null
);

create or replace function public.activate_price_document(p_id uuid)
returns public.price_documents language plpgsql security definer set search_path = public as $$
declare d public.price_documents;
begin
  select * into d from public.price_documents where id = p_id for update;
  if not found then raise exception 'Documento inexistente' using errcode = 'P0002'; end if;
  if not public.has_org_role(d.organization_id, array['super_admin','dealership_admin']) then
    raise exception 'Solo administradores activan documentos' using errcode = '42501';
  end if;
  if d.status = 'active' then return d; end if;
  update public.price_documents set status = 'archived'
    where organization_id = d.organization_id and category = d.category and status = 'active';
  update public.price_documents set status = 'active', activated_by = auth.uid() where id = p_id returning * into d;
  return d;
end $$;
revoke all on function public.activate_price_document(uuid) from public;
grant execute on function public.activate_price_document(uuid) to authenticated;

-- ───────────────────────── Cotizaciones ─────────────────────────
create table if not exists public.quote_counters (
  organization_id text primary key references public.organizations(id),
  last_number integer not null default 0
);
alter table public.quote_counters enable row level security; -- sin policies: solo la usan funciones definer

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  number integer not null,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check (kind in ('used','savings','financing')),
  vehicle text not null check (length(trim(vehicle)) between 2 and 160),
  input jsonb not null,
  result jsonb not null,
  price_document_id uuid references public.price_documents(id),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected')),
  valid_until date not null default (current_date + 7),
  created_by uuid not null default auth.uid() references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decided_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);
alter table public.quotes enable row level security;
create policy quotes_read on public.quotes for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','read_only']));
create policy quotes_insert on public.quotes for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor'])
  and status = 'draft' and created_by = (select auth.uid()) and decided_by is null
);
-- El autor edita su borrador; las transiciones solo por quote_transition().
create policy quotes_update_draft on public.quotes for update to authenticated
  using (status = 'draft' and created_by = (select auth.uid()))
  with check (status = 'draft' and created_by = (select auth.uid()) and decided_by is null);

create or replace function public.assign_quote_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.number := old.number;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'No se puede mover un registro a otra organización' using errcode = '42501';
    end if;
    return new;
  end if;
  insert into public.quote_counters(organization_id, last_number) values (new.organization_id, 1)
    on conflict (organization_id) do update set last_number = quote_counters.last_number + 1
    returning last_number into new.number;
  if new.lead_id is not null and not exists (select 1 from public.leads where id = new.lead_id and organization_id = new.organization_id) then
    raise exception 'El lead no pertenece a la organización' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists quotes_number on public.quotes;
create trigger quotes_number before insert or update on public.quotes for each row execute function public.assign_quote_number();

create or replace function public.quote_transition(p_id uuid, p_action text, p_reason text default null)
returns public.quotes language plpgsql security definer set search_path = public as $$
declare
  q public.quotes;
  uid uuid := auth.uid();
begin
  select * into q from public.quotes where id = p_id for update;
  if not found then raise exception 'Cotización inexistente' using errcode = 'P0002'; end if;

  if p_action = 'submit' then
    if q.status not in ('draft', 'rejected') then raise exception 'Solo un borrador o una cotización rechazada se envía a aprobación'; end if;
    if q.created_by <> uid then raise exception 'Solo el autor envía su cotización' using errcode = '42501'; end if;
    update public.quotes set status = 'pending_approval', decided_by = null, decided_at = null, decided_reason = null
      where id = p_id returning * into q;
  elsif p_action in ('approve', 'reject') then
    if q.status <> 'pending_approval' then raise exception 'La cotización no está pendiente de aprobación'; end if;
    if not public.has_org_role(q.organization_id, array['super_admin','dealership_admin']) then
      raise exception 'Solo la gerencia aprueba cotizaciones' using errcode = '42501';
    end if;
    if q.created_by = uid and not public.has_org_role(q.organization_id, array['super_admin']) then
      raise exception 'Nadie aprueba su propia cotización' using errcode = '42501';
    end if;
    if p_action = 'reject' and coalesce(trim(p_reason), '') = '' then raise exception 'El rechazo requiere un motivo'; end if;
    update public.quotes
      set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
          decided_by = uid, decided_at = now(), decided_reason = p_reason,
          valid_until = case when p_action = 'approve' then greatest(valid_until, current_date) else valid_until end
      where id = p_id returning * into q;
  else
    raise exception 'Acción desconocida: %', p_action;
  end if;

  if q.lead_id is not null then
    insert into public.lead_activities(organization_id, lead_id, kind, body)
    values (q.organization_id, q.lead_id, 'quote',
            'Cotización #' || q.number || ' · ' || q.vehicle || ': ' ||
            case q.status when 'pending_approval' then 'enviada a aprobación' when 'approved' then 'aprobada' else 'rechazada (' || p_reason || ')' end);
  end if;
  return q;
end $$;
revoke all on function public.quote_transition(uuid, text, text) from public;
grant execute on function public.quote_transition(uuid, text, text) to authenticated;

-- ───────────────────────── Auditoría ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['quotes','price_documents'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
