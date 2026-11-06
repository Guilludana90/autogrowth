-- AutoGrowth OS · 0006 · P4 (primer tramo): postventa, base de conocimiento, consentimiento e inbox manual.
--   1. Turnos de taller con estados por RPC, control de superposición por box e historial.
--   2. Pedidos de repuestos y accesorios con estados por RPC.
--   3. Base de conocimiento versionada: nadie aprueba lo que escribió; una versión publicada por artículo.
--   4. Consentimiento por canal (solo se agrega, nunca se edita) y registro manual de conversaciones.
-- Nada de esto envía mensajes: WhatsApp, Instagram y Messenger siguen sin integración.
-- Probar siempre en una base local antes de cualquier entorno compartido.

-- El historial del lead suma consentimientos, mensajes y turnos.
alter table public.lead_activities drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('created','status','assigned','note','task','quote','import','consent','message','service'));

-- ───────────────────────── Turnos de taller ─────────────────────────
create table if not exists public.service_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  vehicle text not null check (length(trim(vehicle)) between 2 and 120),
  plate text check (plate is null or plate ~ '^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$'),
  mileage integer check (mileage is null or mileage between 0 and 2000000),
  service_type text not null check (service_type in ('maintenance','repair','warranty','recall','pdi','other')),
  scheduled_at timestamptz not null,
  duration_min integer not null check (duration_min between 15 and 600),
  bay text not null check (length(trim(bay)) between 1 and 40),
  advisor_id uuid references auth.users(id),
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','checked_in','in_progress','ready','delivered','cancelled','no_show')),
  notes text check (notes is null or length(notes) <= 1000),
  status_reason text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_appointments_day on public.service_appointments(organization_id, scheduled_at);
alter table public.service_appointments enable row level security;
create policy appointments_read on public.service_appointments for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy appointments_insert on public.service_appointments for insert to authenticated
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin','post_sales'])
              and status = 'scheduled' and created_by = (select auth.uid()));
-- Sin update ni delete directos: los cambios de estado van por appointment_transition().

create or replace function public.check_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
declare clash record;
begin
  if new.lead_id is not null and not exists (select 1 from public.leads where id = new.lead_id and organization_id = new.organization_id) then
    raise exception 'El lead no pertenece a la organización' using errcode = '23514';
  end if;
  if new.advisor_id is not null and not exists (
    select 1 from public.memberships where organization_id = new.organization_id and user_id = new.advisor_id
  ) then
    raise exception 'El asesor de servicio no pertenece a la organización' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.scheduled_at < now() - interval '5 minutes' then
    raise exception 'El turno no puede quedar en el pasado' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'No se puede mover un registro a otra organización' using errcode = '42501';
  end if;
  if new.status in ('scheduled','confirmed','checked_in','in_progress') then
    select a.id, a.scheduled_at into clash from public.service_appointments a
      where a.organization_id = new.organization_id and a.id <> new.id
        and lower(trim(a.bay)) = lower(trim(new.bay))
        and a.status in ('scheduled','confirmed','checked_in','in_progress')
        and a.scheduled_at < new.scheduled_at + make_interval(mins => new.duration_min)
        and new.scheduled_at < a.scheduled_at + make_interval(mins => a.duration_min)
      limit 1;
    if found then
      raise exception 'El box % ya tiene un turno que se superpone (%)', new.bay, to_char(clash.scheduled_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
        using errcode = '23P01';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists appointments_check on public.service_appointments;
create trigger appointments_check before insert or update on public.service_appointments for each row execute function public.check_appointment();

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  appointment_id uuid not null references public.service_appointments(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.appointment_events enable row level security;
create policy appointment_events_read on public.appointment_events for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
revoke insert, update, delete, truncate on public.appointment_events from anon, authenticated;

create or replace function public.log_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  labels jsonb := '{"scheduled":"Agendado","confirmed":"Confirmado","checked_in":"Recibido","in_progress":"En taller","ready":"Listo para entregar","delivered":"Entregado","cancelled":"Cancelado","no_show":"No se presentó"}';
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.appointment_events(organization_id, appointment_id, from_status, to_status, actor_id, reason)
    values (new.organization_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(),
            case when tg_op = 'UPDATE' then new.status_reason end);
    if new.lead_id is not null then
      insert into public.lead_activities(organization_id, lead_id, kind, body)
      values (new.organization_id, new.lead_id, 'service',
              'Turno de taller ' || to_char(new.scheduled_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
              || ': ' || (labels->>new.status) || coalesce(' (' || new.status_reason || ')', ''));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists appointments_log on public.service_appointments;
create trigger appointments_log after insert or update on public.service_appointments for each row execute function public.log_appointment();

create or replace function public.appointment_transition(p_id uuid, p_action text, p_reason text default null)
returns public.service_appointments
language plpgsql security definer set search_path = public as $$
declare
  a public.service_appointments;
  allowed text[];
  target text;
begin
  select * into a from public.service_appointments where id = p_id for update;
  if not found then raise exception 'Turno inexistente' using errcode = 'P0002'; end if;
  if not public.has_org_role(a.organization_id, array['super_admin','dealership_admin','post_sales']) then
    raise exception 'Tu rol no gestiona turnos de taller' using errcode = '42501';
  end if;
  case p_action
    when 'confirm' then allowed := array['scheduled']; target := 'confirmed';
    when 'check_in' then allowed := array['scheduled','confirmed']; target := 'checked_in';
    when 'start' then allowed := array['checked_in']; target := 'in_progress';
    when 'ready' then allowed := array['in_progress']; target := 'ready';
    when 'deliver' then allowed := array['ready']; target := 'delivered';
    when 'cancel' then allowed := array['scheduled','confirmed','checked_in']; target := 'cancelled';
    when 'no_show' then allowed := array['scheduled','confirmed']; target := 'no_show';
    else raise exception 'Acción desconocida: %', p_action;
  end case;
  if not a.status = any(allowed) then raise exception 'No se puede % un turno en estado %', p_action, a.status; end if;
  if p_action in ('cancel','no_show') and coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  if p_action = 'no_show' and a.scheduled_at > now() then raise exception 'Todavía no llegó la hora del turno'; end if;
  update public.service_appointments set status = target, status_reason = nullif(trim(p_reason), '') where id = p_id returning * into a;
  return a;
end $$;
revoke all on function public.appointment_transition(uuid, text, text) from public;
grant execute on function public.appointment_transition(uuid, text, text) to authenticated;

-- ───────────────────────── Repuestos y accesorios ─────────────────────────
create table if not exists public.parts_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  kind text not null check (kind in ('part','accessory')),
  appointment_id uuid references public.service_appointments(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  part_number text check (part_number is null or length(part_number) <= 60),
  description text not null check (length(trim(description)) between 2 and 300),
  quantity integer not null check (quantity between 1 and 999),
  unit_price numeric(14,2) check (unit_price is null or unit_price > 0),
  currency text not null default 'ARS',
  eta date,
  status text not null default 'requested' check (status in ('requested','quoted','ordered','received','delivered','cancelled')),
  status_reason text,
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parts_requests enable row level security;
create policy parts_read on public.parts_requests for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy parts_insert on public.parts_requests for insert to authenticated
  with check (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales'])
              and status = 'requested' and created_by = (select auth.uid()));

create or replace function public.check_parts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null and not exists (select 1 from public.leads where id = new.lead_id and organization_id = new.organization_id) then
    raise exception 'El lead no pertenece a la organización' using errcode = '23514';
  end if;
  if new.appointment_id is not null and not exists (select 1 from public.service_appointments where id = new.appointment_id and organization_id = new.organization_id) then
    raise exception 'El turno no pertenece a la organización' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'No se puede mover un registro a otra organización' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists parts_check on public.parts_requests;
create trigger parts_check before insert or update on public.parts_requests for each row execute function public.check_parts();

create or replace function public.parts_transition(p_id uuid, p_action text, p_unit_price numeric default null, p_eta date default null, p_reason text default null)
returns public.parts_requests
language plpgsql security definer set search_path = public as $$
declare
  p public.parts_requests;
  allowed text[];
  target text;
begin
  select * into p from public.parts_requests where id = p_id for update;
  if not found then raise exception 'Pedido inexistente' using errcode = 'P0002'; end if;
  if not public.has_org_role(p.organization_id, array['super_admin','dealership_admin','post_sales']) then
    raise exception 'Tu rol no gestiona repuestos' using errcode = '42501';
  end if;
  case p_action
    when 'quote' then allowed := array['requested']; target := 'quoted';
    when 'order' then allowed := array['requested','quoted']; target := 'ordered';
    when 'receive' then allowed := array['ordered']; target := 'received';
    when 'deliver' then allowed := array['received']; target := 'delivered';
    when 'cancel' then allowed := array['requested','quoted','ordered']; target := 'cancelled';
    else raise exception 'Acción desconocida: %', p_action;
  end case;
  if not p.status = any(allowed) then raise exception 'No se puede % un pedido en estado %', p_action, p.status; end if;
  if p_action = 'quote' and coalesce(p_unit_price, 0) <= 0 then raise exception 'Para cotizar hace falta un precio unitario mayor a 0'; end if;
  if p_action = 'order' and p_eta is not null and p_eta < current_date then raise exception 'La fecha estimada no puede ser pasada'; end if;
  if p_action = 'cancel' and coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo de la cancelación'; end if;
  update public.parts_requests set
    status = target,
    unit_price = coalesce(p_unit_price, unit_price),
    eta = case when p_action = 'order' then coalesce(p_eta, eta) else eta end,
    status_reason = case when p_action = 'cancel' then trim(p_reason) else status_reason end
  where id = p_id returning * into p;
  return p;
end $$;
revoke all on function public.parts_transition(uuid, text, numeric, date, text) from public;
grant execute on function public.parts_transition(uuid, text, numeric, date, text) to authenticated;

-- ───────────────────────── Base de conocimiento ─────────────────────────
create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  article_key text not null check (article_key ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  version integer not null check (version >= 1),
  title text not null check (length(trim(title)) between 3 and 160),
  body text not null check (length(trim(body)) between 10 and 20000),
  language text not null default 'es' check (language in ('es','en')),
  category text not null check (category in ('producto','financiacion','postventa','garantia','procesos','objeciones')),
  model text check (model is null or length(model) <= 80),
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'draft' check (status in ('draft','in_review','published','archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (organization_id, article_key, version),
  constraint knowledge_validity check (valid_to is null or valid_to >= valid_from)
);
create unique index if not exists knowledge_one_published on public.knowledge_articles(organization_id, article_key) where status = 'published';
alter table public.knowledge_articles enable row level security;
-- Todos leen lo publicado; quienes escriben o aprueban ven también borradores y revisiones.
create policy knowledge_read on public.knowledge_articles for select to authenticated using (
  (status = 'published' and public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']))
  or public.has_org_role(organization_id, array['super_admin','dealership_admin','post_sales'])
);
create policy knowledge_insert on public.knowledge_articles for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin','dealership_admin','post_sales'])
  and status = 'draft' and created_by = (select auth.uid()) and approved_by is null
);

create or replace function public.knowledge_update_draft(p_id uuid, p_title text, p_body text, p_valid_from date, p_valid_to date)
returns public.knowledge_articles
language plpgsql security definer set search_path = public as $$
declare k public.knowledge_articles;
begin
  select * into k from public.knowledge_articles where id = p_id for update;
  if not found then raise exception 'Artículo inexistente' using errcode = 'P0002'; end if;
  if k.status <> 'draft' then raise exception 'Solo se edita un borrador'; end if;
  if k.created_by <> auth.uid() then raise exception 'Solo el autor edita su borrador' using errcode = '42501'; end if;
  update public.knowledge_articles set title = p_title, body = p_body, valid_from = p_valid_from, valid_to = p_valid_to
    where id = p_id returning * into k;
  return k;
end $$;
revoke all on function public.knowledge_update_draft(uuid, text, text, date, date) from public;
grant execute on function public.knowledge_update_draft(uuid, text, text, date, date) to authenticated;

create or replace function public.knowledge_transition(p_id uuid, p_action text, p_note text default null)
returns public.knowledge_articles
language plpgsql security definer set search_path = public as $$
declare
  k public.knowledge_articles;
  uid uuid := auth.uid();
begin
  select * into k from public.knowledge_articles where id = p_id for update;
  if not found then raise exception 'Artículo inexistente' using errcode = 'P0002'; end if;
  if p_action = 'submit' then
    if k.status <> 'draft' then raise exception 'Solo un borrador se envía a revisión'; end if;
    if k.created_by <> uid then raise exception 'Solo el autor envía su borrador' using errcode = '42501'; end if;
    update public.knowledge_articles set status = 'in_review', review_note = null where id = p_id returning * into k;
  elsif p_action in ('approve','reject') then
    if not public.has_org_role(k.organization_id, array['super_admin','dealership_admin']) then
      raise exception 'Solo Super Admin o Gerente aprueban artículos' using errcode = '42501';
    end if;
    if k.created_by = uid then raise exception 'Nadie aprueba lo que escribió' using errcode = '42501'; end if;
    if k.status <> 'in_review' then raise exception 'Solo se decide sobre un artículo en revisión'; end if;
    if p_action = 'approve' then
      update public.knowledge_articles set status = 'archived'
        where organization_id = k.organization_id and article_key = k.article_key and status = 'published';
      update public.knowledge_articles set status = 'published', approved_by = uid, approved_at = now(), review_note = nullif(trim(p_note), '')
        where id = p_id returning * into k;
    else
      if coalesce(trim(p_note), '') = '' then raise exception 'Explicá qué hay que cambiar'; end if;
      update public.knowledge_articles set status = 'draft', review_note = trim(p_note) where id = p_id returning * into k;
    end if;
  elsif p_action = 'archive' then
    if not public.has_org_role(k.organization_id, array['super_admin','dealership_admin']) then
      raise exception 'Solo Super Admin o Gerente archivan artículos' using errcode = '42501';
    end if;
    if k.status <> 'published' then raise exception 'Solo se archiva un artículo publicado'; end if;
    update public.knowledge_articles set status = 'archived' where id = p_id returning * into k;
  else
    raise exception 'Acción desconocida: %', p_action;
  end if;
  return k;
end $$;
revoke all on function public.knowledge_transition(uuid, text, text) from public;
grant execute on function public.knowledge_transition(uuid, text, text) to authenticated;

-- ───────────────────────── Consentimiento ─────────────────────────
-- Solo se agregan eventos: el estado vigente es el último. Revocar es otro evento, no un borrado.
create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email')),
  granted boolean not null,
  source text not null check (length(trim(source)) between 2 and 80),
  evidence text check (evidence is null or length(evidence) <= 500),
  actor_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists consent_events_lead on public.consent_events(lead_id, channel, created_at desc);
alter table public.consent_events enable row level security;
create policy consent_read on public.consent_events for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy consent_insert on public.consent_events for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales'])
  and actor_id = (select auth.uid())
  and exists (select 1 from public.leads l where l.id = lead_id and l.organization_id = consent_events.organization_id)
);

create or replace function public.log_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lead_activities(organization_id, lead_id, kind, body)
  values (new.organization_id, new.lead_id, 'consent',
          case when new.granted then 'Consentimiento otorgado para ' else 'Consentimiento revocado para ' end
          || case new.channel when 'whatsapp' then 'WhatsApp' else 'email' end || ' (' || new.source || ')');
  return new;
end $$;
drop trigger if exists consent_log on public.consent_events;
create trigger consent_log after insert on public.consent_events for each row execute function public.log_consent();

create or replace function public.lead_consent(p_lead uuid, p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from public.consent_events where lead_id = p_lead and channel = p_channel order by created_at desc limit 1), false);
$$;
-- Uso interno (trigger): no se expone por la API para no filtrar datos entre organizaciones.
revoke all on function public.lead_consent(uuid, text) from public, anon, authenticated;

-- ───────────────────────── Conversaciones (registro manual) ─────────────────────────
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram','messenger','email','phone','in_person')),
  direction text not null check (direction in ('in','out')),
  body text not null check (length(trim(body)) between 1 and 4000),
  occurred_at timestamptz not null,
  source text not null default 'manual' check (source = 'manual'),
  logged_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_lead on public.conversation_messages(lead_id, occurred_at);
alter table public.conversation_messages enable row level security;
create policy messages_read on public.conversation_messages for select to authenticated
  using (public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy messages_insert on public.conversation_messages for insert to authenticated with check (
  public.has_org_role(organization_id, array['super_admin','dealership_admin','sales_advisor','post_sales'])
  and logged_by = (select auth.uid())
);
-- Sin update ni delete: es un registro de lo que pasó.

create or replace function public.check_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.leads where id = new.lead_id and organization_id = new.organization_id) then
    raise exception 'El lead no pertenece a la organización' using errcode = '23514';
  end if;
  if new.occurred_at > now() + interval '5 minutes' then raise exception 'El mensaje no puede ser futuro' using errcode = '23514'; end if;
  if new.direction = 'out' then
    if new.channel in ('whatsapp','email') and not public.lead_consent(new.lead_id, new.channel) then
      raise exception 'Sin consentimiento vigente para %', new.channel using errcode = '42501';
    end if;
    if new.channel in ('instagram','messenger') and not exists (
      select 1 from public.conversation_messages m
      where m.lead_id = new.lead_id and m.channel = new.channel and m.direction = 'in'
        and m.occurred_at <= new.occurred_at and m.occurred_at > new.occurred_at - interval '24 hours'
    ) then
      raise exception 'Solo se responde dentro de las 24 h del último mensaje del cliente' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_check on public.conversation_messages;
create trigger messages_check before insert on public.conversation_messages for each row execute function public.check_message();

create or replace function public.log_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lead_activities(organization_id, lead_id, kind, body)
  values (new.organization_id, new.lead_id, 'message',
          case new.direction when 'in' then 'Mensaje recibido por ' else 'Mensaje enviado por ' end || new.channel || ' (registro manual)');
  return new;
end $$;
drop trigger if exists messages_log on public.conversation_messages;
create trigger messages_log after insert on public.conversation_messages for each row execute function public.log_message();

-- ───────────────────────── Auditoría ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['service_appointments','parts_requests','knowledge_articles','consent_events','conversation_messages'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
