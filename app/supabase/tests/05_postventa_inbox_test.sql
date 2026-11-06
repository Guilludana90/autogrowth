-- Pruebas P4: turnos de taller, repuestos, base de conocimiento, consentimiento y registro de conversaciones.
\set ON_ERROR_STOP on
reset role;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'gerente4@cardys.test'),
  ('00000000-0000-0000-0000-0000000004a2', 'taller4@cardys.test'),
  ('00000000-0000-0000-0000-0000000004a3', 'asesor4@cardys.test'),
  ('00000000-0000-0000-0000-0000000004a4', 'lector4@cardys.test'),
  ('00000000-0000-0000-0000-0000000004b1', 'taller4@overland.test');
insert into public.memberships(organization_id, user_id, role) values
  ('cardys_fiat', '00000000-0000-0000-0000-0000000004a1', 'dealership_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000004a2', 'post_sales'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000004a3', 'sales_advisor'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000004a4', 'read_only'),
  ('overland_motors', '00000000-0000-0000-0000-0000000004b1', 'post_sales');
insert into public.leads(id, organization_id, name, phone_e164, source) values
  ('00000000-0000-0000-0000-00000000c0a1', 'cardys_fiat', 'Cliente P4', '+5492392444555', 'Salón'),
  ('00000000-0000-0000-0000-00000000c0b1', 'overland_motors', 'Cliente Overland P4', '+5492392444666', 'Salón');

create or replace function pg_temp.act_as(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;
create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK  %: rechazado (%)', label, sqlerrm; return; end;
  raise exception 'FALLO %: se esperaba un error', label;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLO %', label; end if;
  raise notice 'OK  %', label;
end $$;

set role authenticated;

-- ── Turnos ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a2');
insert into public.service_appointments(organization_id, lead_id, customer_name, vehicle, plate, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'Cliente P4', 'Fiat Cronos', 'AB123CD', 'maintenance', date_trunc('hour', now()) + interval '2 days', 60, 'Box P4');
select pg_temp.expect((select count(*) from public.service_appointments where bay = 'Box P4') = 1, 'postventa agenda un turno');
select pg_temp.expect_error($q$insert into public.service_appointments(organization_id, customer_name, vehicle, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', 'Otro', 'Pulse', 'repair', date_trunc('hour', now()) + interval '2 days 30 minutes', 60, 'box p4')$q$, 'no se superponen turnos en el mismo box');
insert into public.service_appointments(organization_id, customer_name, vehicle, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', 'Otro', 'Pulse', 'repair', date_trunc('hour', now()) + interval '2 days 30 minutes', 60, 'Box P4 bis');
select pg_temp.expect((select count(*) from public.service_appointments where bay like 'Box P4%') = 2, 'en otro box sí entra');
select pg_temp.expect_error($q$insert into public.service_appointments(organization_id, customer_name, vehicle, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', 'Pasado', 'Pulse', 'repair', now() - interval '1 day', 60, 'Box 9')$q$, 'no se agenda en el pasado');
select pg_temp.expect_error($q$insert into public.service_appointments(organization_id, customer_name, vehicle, plate, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', 'Mal', 'Pulse', 'XX1', 'repair', now() + interval '3 days', 60, 'Box 9')$q$, 'patente inválida');
select pg_temp.expect_error($q$insert into public.service_appointments(organization_id, lead_id, customer_name, vehicle, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0b1', 'Cruzado', 'Pulse', 'repair', now() + interval '3 days', 60, 'Box 9')$q$, 'no se usa un lead de otra organización');
update public.service_appointments set status = 'delivered' where bay = 'Box P4';
select pg_temp.expect((select status from public.service_appointments where bay = 'Box P4') = 'scheduled', 'el update directo no hace nada');
select public.appointment_transition((select id from public.service_appointments where bay = 'Box P4'), 'confirm');
select pg_temp.expect_error($q$select public.appointment_transition((select id from public.service_appointments where bay = 'Box P4'), 'deliver')$q$, 'no se entrega sin pasar por taller');
select pg_temp.expect_error($q$select public.appointment_transition((select id from public.service_appointments where bay = 'Box P4'), 'no_show', 'no vino')$q$, 'no se marca ausente antes de la hora');
select pg_temp.expect_error($q$select public.appointment_transition((select id from public.service_appointments where bay = 'Box P4 bis'), 'cancel')$q$, 'cancelar exige motivo');
select public.appointment_transition((select id from public.service_appointments where bay = 'Box P4 bis'), 'cancel', 'El cliente reprogramó');
select pg_temp.expect(
  (select array_agg(e.to_status order by e.created_at) from public.appointment_events e join public.service_appointments a on a.id = e.appointment_id where a.bay = 'Box P4') = array['scheduled','confirmed'],
  'el historial del turno registra cada estado');
select pg_temp.expect(exists(select 1 from public.lead_activities where lead_id = '00000000-0000-0000-0000-00000000c0a1' and kind = 'service'), 'el turno aparece en el historial del lead');

select pg_temp.act_as('00000000-0000-0000-0000-0000000004a3');
select pg_temp.expect((select count(*) from public.service_appointments where bay like 'Box P4%') = 2, 'ventas ve la agenda');
select pg_temp.expect_error($q$insert into public.service_appointments(organization_id, customer_name, vehicle, service_type, scheduled_at, duration_min, bay)
  values ('cardys_fiat', 'Asesor', 'Pulse', 'repair', now() + interval '5 days', 60, 'Box 7')$q$, 'ventas no agenda turnos de taller');
select pg_temp.expect_error($q$select public.appointment_transition((select id from public.service_appointments where bay = 'Box P4'), 'check_in')$q$, 'ventas no cambia estados del taller');

select pg_temp.act_as('00000000-0000-0000-0000-0000000004b1');
select pg_temp.expect((select count(*) from public.service_appointments where bay like 'Box P4%') = 0, 'Overland no ve turnos de Cardys');

-- ── Repuestos ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a3');
insert into public.parts_requests(organization_id, kind, lead_id, customer_name, description, quantity)
  values ('cardys_fiat', 'accessory', '00000000-0000-0000-0000-00000000c0a1', 'Cliente P4', 'Barras portaequipaje', 1);
select pg_temp.expect_error($q$select public.parts_transition((select id from public.parts_requests where description = 'Barras portaequipaje'), 'quote', 1000)$q$, 'ventas pide pero no gestiona repuestos');
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a2');
select pg_temp.expect_error($q$select public.parts_transition((select id from public.parts_requests where description = 'Barras portaequipaje'), 'quote')$q$, 'cotizar exige precio');
select public.parts_transition((select id from public.parts_requests where description = 'Barras portaequipaje'), 'quote', 250000);
select pg_temp.expect_error($q$select public.parts_transition((select id from public.parts_requests where description = 'Barras portaequipaje'), 'order', null, current_date - 1)$q$, 'la llegada estimada no es pasada');
select public.parts_transition((select id from public.parts_requests where description = 'Barras portaequipaje'), 'order', null, current_date + 10);
select pg_temp.expect((select status = 'ordered' and unit_price = 250000 and eta = current_date + 10 from public.parts_requests where description = 'Barras portaequipaje'), 'el pedido guarda precio y llegada');
select pg_temp.expect_error($q$select public.parts_transition((select id from public.parts_requests where description = 'Barras portaequipaje'), 'deliver')$q$, 'no se entrega lo que no llegó');

-- ── Base de conocimiento ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a2');
insert into public.knowledge_articles(organization_id, article_key, version, title, body, category)
  values ('cardys_fiat', 'service-10k', 1, 'Service de 10.000 km', 'Incluye cambio de aceite y filtro.', 'postventa');
select public.knowledge_update_draft((select id from public.knowledge_articles where article_key = 'service-10k'), 'Service de 10.000 km', 'Incluye cambio de aceite, filtro y revisión general.', current_date, null);
select public.knowledge_transition((select id from public.knowledge_articles where article_key = 'service-10k'), 'submit');
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a3');
select pg_temp.expect((select count(*) from public.knowledge_articles where article_key = 'service-10k') = 0, 'ventas no ve borradores ni revisiones');
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a1');
select pg_temp.expect_error($q$select public.knowledge_transition((select id from public.knowledge_articles where article_key = 'service-10k'), 'reject')$q$, 'devolver exige comentario');
select public.knowledge_transition((select id from public.knowledge_articles where article_key = 'service-10k'), 'approve');
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a3');
select pg_temp.expect((select status from public.knowledge_articles where article_key = 'service-10k') = 'published', 'publicado lo ve todo el equipo');
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a1');
insert into public.knowledge_articles(organization_id, article_key, version, title, body, category)
  values ('cardys_fiat', 'service-10k', 2, 'Service de 10.000 km', 'Versión 2 con precios orientativos.', 'postventa');
select public.knowledge_transition((select id from public.knowledge_articles where article_key = 'service-10k' and version = 2), 'submit');
select pg_temp.expect_error($q$select public.knowledge_transition((select id from public.knowledge_articles where article_key = 'service-10k' and version = 2), 'approve')$q$, 'nadie aprueba lo que escribió');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.knowledge_transition((select id from public.knowledge_articles where article_key = 'service-10k' and version = 2), 'approve');
select pg_temp.expect((select array_agg(status order by version) from public.knowledge_articles where article_key = 'service-10k') = array['archived','published'], 'publicar v2 archiva v1');

-- ── Consentimiento y conversaciones ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000004a3');
insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'whatsapp', 'in', 'Hola, quiero turno', now() - interval '1 hour');
select pg_temp.expect_error($q$insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'whatsapp', 'out', 'Hola!', now())$q$, 'sin consentimiento no se registra un WhatsApp saliente');
insert into public.consent_events(organization_id, lead_id, channel, granted, source) values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'whatsapp', true, 'Formulario en salón');
insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'whatsapp', 'out', 'Te agendamos el jueves', now());
select pg_temp.expect((select count(*) from public.conversation_messages where lead_id = '00000000-0000-0000-0000-00000000c0a1') = 2, 'con consentimiento sí');
insert into public.consent_events(organization_id, lead_id, channel, granted, source) values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'whatsapp', false, 'Pidió no recibir más');
select pg_temp.expect_error($q$insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'whatsapp', 'out', 'Otra cosa', now())$q$, 'la revocación bloquea salientes');
select pg_temp.expect_error($q$insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'instagram', 'out', 'Hola', now())$q$, 'Instagram solo responde dentro de 24 h');
select pg_temp.expect_error($q$insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'phone', 'in', 'futuro', now() + interval '1 day')$q$, 'no se registran mensajes futuros');
select pg_temp.expect_error($q$insert into public.conversation_messages(organization_id, lead_id, channel, direction, body, occurred_at)
  values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0b1', 'phone', 'in', 'cruzado', now())$q$, 'no se registran mensajes en otra organización');
update public.consent_events set granted = true;
delete from public.conversation_messages;
select pg_temp.expect((select count(*) from public.consent_events where lead_id = '00000000-0000-0000-0000-00000000c0a1') = 2 and (select count(*) from public.conversation_messages) = 2, 'consentimientos y mensajes no se editan ni se borran');
select pg_temp.expect_error($q$select public.lead_consent('00000000-0000-0000-0000-00000000c0b1', 'whatsapp')$q$, 'el consentimiento de otra organización no se consulta por la API');
select pg_temp.expect((select count(*) from public.lead_activities where lead_id = '00000000-0000-0000-0000-00000000c0a1' and kind in ('consent','message')) = 4, 'consentimientos y mensajes quedan en el historial del lead');

select pg_temp.act_as('00000000-0000-0000-0000-0000000004a4');
select pg_temp.expect((select count(*) from public.conversation_messages) = 2, 'solo lectura ve conversaciones');
select pg_temp.expect_error($q$insert into public.consent_events(organization_id, lead_id, channel, granted, source, actor_id) values ('cardys_fiat', '00000000-0000-0000-0000-00000000c0a1', 'email', true, 'x', '00000000-0000-0000-0000-0000000004a4')$q$, 'solo lectura no registra consentimiento');
select pg_temp.act_as('00000000-0000-0000-0000-0000000004b1');
select pg_temp.expect((select count(*) from public.conversation_messages) + (select count(*) from public.consent_events) = 0, 'Overland no ve conversaciones ni consentimientos de Cardys');

reset role;
select pg_temp.expect((select count(*) from public.audit_events where entity_type in ('service_appointments','parts_requests','knowledge_articles','consent_events','conversation_messages')) >= 10, 'postventa, conocimiento e inbox auditados');

\echo Todas las pruebas de Postventa e Inbox (P4) pasaron
