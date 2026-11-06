-- Pruebas de aislamiento por organización, roles, governance y auditoría.
-- Cada bloque usa set_config para actuar como un usuario distinto. Falla con excepción si algo no se cumple.
\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000000a'), -- super admin Cardys
  ('00000000-0000-0000-0000-00000000000b'), -- dealership admin Cardys
  ('00000000-0000-0000-0000-00000000000c'), -- asesor Cardys
  ('00000000-0000-0000-0000-00000000000d'), -- read only Cardys
  ('00000000-0000-0000-0000-00000000000e'); -- asesor Overland
insert into public.memberships(organization_id, user_id, role) values
  ('cardys_fiat', '00000000-0000-0000-0000-00000000000a', 'super_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-00000000000b', 'dealership_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-00000000000c', 'sales_advisor'),
  ('cardys_fiat', '00000000-0000-0000-0000-00000000000d', 'read_only'),
  ('overland_motors', '00000000-0000-0000-0000-00000000000e', 'sales_advisor');
insert into public.leads(organization_id, name, phone_e164) values
  ('cardys_fiat', 'Lead Cardys', '+5492392555101'),
  ('overland_motors', 'Lead Overland', '+5492926555220');

create or replace function pg_temp.act_as(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;
create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'OK  %: rechazado (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FALLO %: se esperaba un error', label;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLO %', label; end if;
  raise notice 'OK  %', label;
end $$;

set role authenticated;

-- 1. Aislamiento por tenant
select pg_temp.act_as('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect((select count(*) from public.leads) = 1, 'asesor Overland ve solo 1 lead');
select pg_temp.expect((select name from public.leads) = 'Lead Overland', 'y es de su organización');
select pg_temp.expect_error($$insert into public.leads(organization_id,name,phone_e164) values ('cardys_fiat','x','+5492392000000')$$, 'asesor Overland no crea leads en Cardys');

-- 2. Read Only no escribe
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.leads) = 1, 'read only ve leads de Cardys');
update public.leads set status = 'contacted' where organization_id = 'cardys_fiat';
select pg_temp.expect((select status from public.leads) = 'new', 'read only no puede cambiar el estado');

-- 3. Asesor actualiza, asesor de otra org no es asignable, perdido exige motivo
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
update public.leads set status = 'contacted', advisor_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select status from public.leads) = 'contacted', 'asesor Cardys actualiza estado');
select pg_temp.expect_error($$update public.leads set advisor_id = '00000000-0000-0000-0000-00000000000e'$$, 'no se asigna un asesor de otra organización');
select pg_temp.expect_error($$update public.leads set status = 'lost'$$, 'perdido sin motivo');
select pg_temp.expect_error($$update public.leads set organization_id = 'overland_motors'$$, 'un lead no cambia de organización');
select pg_temp.expect_error($$insert into public.audit_events(organization_id, entity_type, entity_id, action) values ('cardys_fiat','x','x','fake')$$, 'nadie escribe auditoría a mano');

-- 4. Governance de prompts
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$insert into public.prompt_versions(organization_id,name,version,prompt_text,status,created_by) values ('cardys_fiat','analyst','v9','x','active','00000000-0000-0000-0000-00000000000b')$$, 'admin no inserta un prompt ya activo');
insert into public.prompt_versions(organization_id, name, version, prompt_text, created_by)
  values ('cardys_fiat', 'analyst', 'v1', 'Prompt v1', '00000000-0000-0000-0000-00000000000b');
-- Sin policy de update: el update directo afecta 0 filas.
update public.prompt_versions set status = 'active';
select pg_temp.expect((select status from public.prompt_versions where version = 'v1') = 'draft', 'update directo no cambia el estado');
select public.prompt_transition((select id from public.prompt_versions where version = 'v1'), 'submit');
select pg_temp.expect((select status from public.prompt_versions where version = 'v1') = 'in_review', 'el autor envía a revisión');
select pg_temp.expect_error($$select public.prompt_transition((select id from public.prompt_versions where version = 'v1'), 'approve')$$, 'dealership admin no aprueba');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.prompt_transition((select id from public.prompt_versions where version = 'v1'), 'approve');
select public.prompt_transition((select id from public.prompt_versions where version = 'v1'), 'activate');
select pg_temp.expect((select status from public.prompt_versions where version = 'v1') = 'active', 'super admin aprueba y activa v1');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
insert into public.prompt_versions(organization_id, name, version, prompt_text, created_by)
  values ('cardys_fiat', 'analyst', 'v2', 'Prompt v2', '00000000-0000-0000-0000-00000000000b');
select public.prompt_transition((select id from public.prompt_versions where version = 'v2'), 'submit');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.prompt_transition((select id from public.prompt_versions where version = 'v2'), 'approve');
select public.prompt_transition((select id from public.prompt_versions where version = 'v2'), 'activate');
select pg_temp.expect((select count(*) from public.prompt_versions where status = 'active') = 1, 'una sola versión activa');
select pg_temp.expect_error($$select public.prompt_transition((select id from public.prompt_versions where version = 'v1'), 'rollback')$$, 'rollback sin motivo');
select public.prompt_transition((select id from public.prompt_versions where version = 'v1'), 'rollback', 'v2 bajó la calidad');
select pg_temp.expect((select version from public.prompt_versions where status = 'active') = 'v1', 'rollback reactiva v1');
select pg_temp.expect((select status from public.prompt_versions where version = 'v2') = 'rolled_back', 'v2 queda retirada');

-- 5. Auditoría
select pg_temp.expect((select count(*) from public.audit_events where entity_type = 'prompt_versions') >= 8, 'transiciones auditadas');
select pg_temp.expect((select count(*) from public.audit_events where entity_type = 'leads' and action = 'update') >= 1, 'cambios de leads auditados');
select pg_temp.expect((select actor_id from public.audit_events where entity_type = 'leads' and action = 'update' order by occurred_at limit 1) = '00000000-0000-0000-0000-00000000000c', 'la auditoría registra quién');

-- 6. Memberships
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$insert into public.memberships(organization_id,user_id,role) values ('cardys_fiat','00000000-0000-0000-0000-00000000000e','super_admin')$$, 'dealership admin no crea super admins');
insert into public.memberships(organization_id, user_id, role) values ('cardys_fiat', '00000000-0000-0000-0000-00000000000e', 'read_only');
select pg_temp.expect(true, 'dealership admin agrega un usuario read only');

reset role;
\echo 'Todas las pruebas de RLS pasaron'
