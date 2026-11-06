-- Pruebas P1: historial del lead, tareas, documentos de precios, cotizaciones y alta de miembros.
\set ON_ERROR_STOP on
reset role;

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'super@cardys.test', '{"full_name":"Ana Super"}'),
  ('00000000-0000-0000-0000-0000000001a2', 'gerente@cardys.test', '{"full_name":"Gema Gerente"}'),
  ('00000000-0000-0000-0000-0000000001a3', 'asesor@cardys.test', '{"full_name":"Alan Asesor"}'),
  ('00000000-0000-0000-0000-0000000001a4', 'nuevo@cardys.test', '{}'),
  ('00000000-0000-0000-0000-0000000001b1', 'asesor@overland.test', '{"full_name":"Olga Overland"}');
insert into public.memberships(organization_id, user_id, role) values
  ('cardys_fiat', '00000000-0000-0000-0000-0000000001a1', 'super_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000001a2', 'dealership_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000001a3', 'sales_advisor'),
  ('overland_motors', '00000000-0000-0000-0000-0000000001b1', 'sales_advisor');

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

select pg_temp.expect((select full_name from public.profiles where email = 'asesor@cardys.test') = 'Alan Asesor', 'el perfil se crea solo al registrarse');

set role authenticated;

-- Historial
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a3');
insert into public.leads(organization_id, name, phone_e164, source) values ('cardys_fiat', 'Lead P1', '+5492392111222', 'Salón');
update public.leads set status = 'contacted', advisor_id = '00000000-0000-0000-0000-0000000001a3' where name = 'Lead P1';
select pg_temp.expect((select count(*) from public.lead_activities a join public.leads l on l.id = a.lead_id where l.name = 'Lead P1') = 3, 'alta, estado y asignación quedan en el historial');
select pg_temp.expect(exists(select 1 from public.lead_activities where body = 'Asignado a Alan Asesor'), 'el historial nombra al asesor');
insert into public.lead_activities(organization_id, lead_id, kind, body, actor_id)
  select 'cardys_fiat', id, 'note', 'Llamó, quiere test drive', '00000000-0000-0000-0000-0000000001a3' from public.leads where name = 'Lead P1';
select pg_temp.expect(true, 'el asesor agrega una nota');
select pg_temp.expect_error($$insert into public.lead_activities(organization_id, lead_id, kind, body, actor_id) select 'cardys_fiat', id, 'status', 'Estado falso', '00000000-0000-0000-0000-0000000001a3' from public.leads where name = 'Lead P1'$$, 'no se fabrican eventos de estado a mano');

select pg_temp.act_as('00000000-0000-0000-0000-0000000001b1');
select pg_temp.expect((select count(*) from public.lead_activities where organization_id = 'cardys_fiat') = 0, 'Overland no ve el historial de Cardys');

-- Tareas
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a3');
insert into public.tasks(organization_id, lead_id, assignee_id, title, priority, due_at)
  select 'cardys_fiat', id, '00000000-0000-0000-0000-0000000001a3', 'Coordinar test drive', 'high', now() + interval '1 day' from public.leads where name = 'Lead P1';
update public.tasks set status = 'done' where title = 'Coordinar test drive';
select pg_temp.expect((select completed_at is not null from public.tasks where title = 'Coordinar test drive'), 'completar una tarea registra la fecha');
select pg_temp.expect((select count(*) from public.lead_activities where kind = 'task') = 2, 'creación y cierre de la tarea en el historial');
select pg_temp.expect_error($$insert into public.tasks(organization_id, title, assignee_id) values ('cardys_fiat', 'Tarea mal asignada', '00000000-0000-0000-0000-0000000001b1')$$, 'responsable de otra organización');
select pg_temp.expect_error($$insert into public.tasks(organization_id, title, priority) values ('cardys_fiat', 'Tarea', 'urgentisima')$$, 'prioridad inválida');

-- Documentos de precios
select pg_temp.expect_error($$insert into public.price_documents(organization_id, category, title, file_name, valid_from, created_by) values ('cardys_fiat', 'price_list', 'Lista asesor', 'x.csv', current_date, '00000000-0000-0000-0000-0000000001a3')$$, 'un asesor no sube listas de precios');
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a2');
select pg_temp.expect_error($$insert into public.price_documents(organization_id, category, title, file_name, valid_from, status, created_by) values ('cardys_fiat', 'price_list', 'Activa directa', 'x.csv', current_date, 'active', '00000000-0000-0000-0000-0000000001a2')$$, 'no se sube un documento ya activo');
insert into public.price_documents(organization_id, category, title, file_name, valid_from, created_by)
  values ('cardys_fiat', 'price_list', 'Lista octubre', 'oct.csv', current_date - 30, '00000000-0000-0000-0000-0000000001a2'),
         ('cardys_fiat', 'price_list', 'Lista noviembre', 'nov.csv', current_date, '00000000-0000-0000-0000-0000000001a2');
select public.activate_price_document((select id from public.price_documents where title = 'Lista octubre'));
select public.activate_price_document((select id from public.price_documents where title = 'Lista noviembre'));
select pg_temp.expect((select string_agg(title || ':' || status, ',' order by title) from public.price_documents) = 'Lista noviembre:active,Lista octubre:archived', 'activar una versión archiva la anterior');
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a3');
select pg_temp.expect_error($$select public.activate_price_document((select id from public.price_documents where title = 'Lista octubre'))$$, 'un asesor no activa documentos');

-- Cotizaciones
insert into public.quotes(organization_id, lead_id, kind, vehicle, input, result, created_by)
  select 'cardys_fiat', id, 'financing', 'Fiat Cronos Drive 1.3', '{"price":30000000}', '{"installment":1}', '00000000-0000-0000-0000-0000000001a3' from public.leads where name = 'Lead P1';
insert into public.quotes(organization_id, kind, vehicle, input, result, created_by)
  values ('cardys_fiat', 'used', 'Fiat Argo 2019', '{}', '{}', '00000000-0000-0000-0000-0000000001a3');
select pg_temp.expect((select string_agg(number::text, ',' order by number) from public.quotes) = '1,2', 'numeración correlativa por concesionario');
select pg_temp.expect_error($$insert into public.quotes(organization_id, kind, vehicle, input, result, status, created_by) values ('cardys_fiat', 'used', 'Auto', '{}', '{}', 'approved', '00000000-0000-0000-0000-0000000001a3')$$, 'no se crea una cotización ya aprobada');
update public.quotes set number = 99 where number = 1;
select pg_temp.expect((select count(*) from public.quotes where number = 99) = 0, 'el número no se puede cambiar');
select public.quote_transition((select id from public.quotes where number = 1), 'submit');
update public.quotes set status = 'approved' where number = 1;
select pg_temp.expect((select status from public.quotes where number = 1) = 'pending_approval', 'el asesor no se autoaprueba con un update');
select pg_temp.expect_error($$select public.quote_transition((select id from public.quotes where number = 1), 'approve')$$, 'el asesor no aprueba');

select pg_temp.act_as('00000000-0000-0000-0000-0000000001a2');
select pg_temp.expect_error($$select public.quote_transition((select id from public.quotes where number = 1), 'reject')$$, 'rechazo sin motivo');
select public.quote_transition((select id from public.quotes where number = 1), 'reject', 'Anticipo mínimo 40%');
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a3');
select public.quote_transition((select id from public.quotes where number = 1), 'submit');
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a2');
select public.quote_transition((select id from public.quotes where number = 1), 'approve');
select pg_temp.expect((select status || '|' || (decided_by = '00000000-0000-0000-0000-0000000001a2')::text from public.quotes where number = 1) = 'approved|true', 'la gerencia aprueba y queda registrado quién');
select pg_temp.expect((select count(*) from public.lead_activities where kind = 'quote') = 4, 'el recorrido de la cotización queda en el historial del lead');

insert into public.quotes(organization_id, kind, vehicle, input, result, created_by)
  values ('cardys_fiat', 'savings', 'Fiat Mobi', '{}', '{}', '00000000-0000-0000-0000-0000000001a2');
select public.quote_transition((select id from public.quotes where number = 3), 'submit');
select pg_temp.expect_error($$select public.quote_transition((select id from public.quotes where number = 3), 'approve')$$, 'un gerente no aprueba su propia cotización');

select pg_temp.act_as('00000000-0000-0000-0000-0000000001b1');
select pg_temp.expect((select count(*) from public.quotes where organization_id = 'cardys_fiat') = 0, 'Overland no ve cotizaciones de Cardys');

-- Alta de miembros por email
select pg_temp.act_as('00000000-0000-0000-0000-0000000001a2');
select pg_temp.expect_error($$select public.add_member_by_email('cardys_fiat', 'nuevo@cardys.test', 'dealership_admin')$$, 'un gerente no crea otros administradores');
select pg_temp.expect_error($$select public.add_member_by_email('cardys_fiat', 'noexiste@x.test', 'sales_advisor')$$, 'email sin cuenta');
select public.add_member_by_email('cardys_fiat', 'NUEVO@cardys.test', 'sales_advisor');
select pg_temp.expect((select role from public.memberships where user_id = '00000000-0000-0000-0000-0000000001a4') = 'sales_advisor', 'el gerente suma un asesor por email');
select pg_temp.act_as('00000000-0000-0000-0000-0000000001b1');
select pg_temp.expect_error($$select public.add_member_by_email('cardys_fiat', 'nuevo@cardys.test', 'read_only')$$, 'otra organización no agrega miembros');

reset role;
\echo 'Todas las pruebas de RLS de P1 pasaron'
