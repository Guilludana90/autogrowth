-- Pruebas P2: importación transaccional de métricas, reversión, integraciones y secretos.
\set ON_ERROR_STOP on
reset role;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'gerente2@cardys.test'),
  ('00000000-0000-0000-0000-0000000002a2', 'asesor2@cardys.test'),
  ('00000000-0000-0000-0000-0000000002b1', 'gerente@overland.test');
insert into public.memberships(organization_id, user_id, role) values
  ('cardys_fiat', '00000000-0000-0000-0000-0000000002a1', 'dealership_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000002a2', 'sales_advisor'),
  ('overland_motors', '00000000-0000-0000-0000-0000000002b1', 'dealership_admin');
insert into public.integrations(organization_id, provider) values ('cardys_fiat', 'meta'), ('overland_motors', 'meta');
insert into public.integration_secrets(organization_id, provider, access_token) values ('cardys_fiat', 'meta', 'token-de-prueba');

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
select pg_temp.act_as('00000000-0000-0000-0000-0000000002a1');

-- Lote 1: dos días de una campaña nueva
select public.import_campaign_metrics('cardys_fiat', 'meta', 'csv', 'meta-oct.csv', $j$[
  {"campaign_id":"p2-c1","campaign_name":"Cronos Leads P2","date":"2026-10-01","currency":"ARS","spend":1000.5,"impressions":5000,"clicks":120,"platform_leads":10},
  {"campaign_id":"p2-c1","campaign_name":"Cronos Leads P2","date":"2026-10-02","currency":"ARS","spend":900,"impressions":4000,"clicks":100,"platform_leads":8}
]$j$::jsonb);
select pg_temp.expect((select count(*) from public.campaign_metrics_daily where external_campaign_id = 'p2-c1') = 2, 'el lote crea las filas diarias');
select pg_temp.expect(exists(select 1 from public.campaigns where external_campaign_id = 'p2-c1' and name = 'Cronos Leads P2'), 'la campaña nueva se crea con su nombre');
select pg_temp.expect((select counts->>'create' from public.metric_import_jobs where file_name = 'meta-oct.csv') = '2', 'el lote registra sus conteos');

-- Lote 2: reimportar igual + corregir un día + día nuevo
select public.import_campaign_metrics('cardys_fiat', 'meta', 'csv', 'meta-oct-v2.csv', $j$[
  {"campaign_id":"p2-c1","campaign_name":"Cronos Leads P2","date":"2026-10-01","currency":"ARS","spend":1000.5,"impressions":5000,"clicks":120,"platform_leads":10},
  {"campaign_id":"p2-c1","campaign_name":"Cronos Leads P2","date":"2026-10-02","currency":"ARS","spend":950,"impressions":4100,"clicks":101,"platform_leads":9},
  {"campaign_id":"p2-c1","campaign_name":"Cronos Leads P2","date":"2026-10-03","currency":"ARS","spend":10,"impressions":100,"clicks":1,"platform_leads":0}
]$j$::jsonb);
select pg_temp.expect((select counts = '{"create":1,"update":1,"unchanged":1,"campaigns":0}'::jsonb from public.metric_import_jobs where file_name = 'meta-oct-v2.csv'), 'reimportar es idempotente: 1 nueva, 1 corregida, 1 igual');
select pg_temp.expect((select spend from public.campaign_metrics_daily where external_campaign_id = 'p2-c1' and metric_date = '2026-10-02') = 950, 'la corrección actualiza el día');

select pg_temp.expect_error($q$select public.rollback_metric_import((select id from public.metric_import_jobs where file_name = 'meta-oct.csv'))$q$, 'no se revierte un lote con lotes posteriores');
select public.rollback_metric_import((select id from public.metric_import_jobs where file_name = 'meta-oct-v2.csv'));
select pg_temp.expect((select spend from public.campaign_metrics_daily where external_campaign_id = 'p2-c1' and metric_date = '2026-10-02') = 900, 'revertir restaura el valor anterior');
select pg_temp.expect(not exists(select 1 from public.campaign_metrics_daily where external_campaign_id = 'p2-c1' and metric_date = '2026-10-03'), 'revertir borra el día que creó el lote');
select pg_temp.expect_error($q$select public.rollback_metric_import((select id from public.metric_import_jobs where file_name = 'meta-oct-v2.csv'))$q$, 'un lote no se revierte dos veces');
select public.rollback_metric_import((select id from public.metric_import_jobs where file_name = 'meta-oct.csv'));
select pg_temp.expect(not exists(select 1 from public.campaigns where external_campaign_id = 'p2-c1'), 'revertir el primer lote borra la campaña que creó');

-- Validaciones
select pg_temp.expect_error($q$select public.import_campaign_metrics('cardys_fiat', 'meta', 'csv', 'f.csv', '[{"campaign_id":"x","date":"2999-01-01","spend":1,"impressions":1,"clicks":1,"platform_leads":0}]')$q$, 'fecha futura');
select pg_temp.expect_error($q$select public.import_campaign_metrics('cardys_fiat', 'meta', 'csv', 'f.csv', '[{"campaign_id":"x","date":"2026-10-01","spend":-1,"impressions":1,"clicks":1,"platform_leads":0}]')$q$, 'inversión negativa');
select pg_temp.expect_error($q$select public.import_campaign_metrics('cardys_fiat', 'meta', 'csv', 'f.csv', '[]')$q$, 'lote vacío');
select pg_temp.expect((select count(*) from public.metric_import_jobs where file_name = 'f.csv') = 0, 'un lote que falla no deja rastros (transaccional)');
select pg_temp.expect_error($q$insert into public.campaign_metrics_daily(organization_id, platform, external_campaign_id, campaign_name, metric_date) values ('cardys_fiat','meta','x','x','2026-10-01')$q$, 'nadie escribe métricas fuera de un lote');
select pg_temp.expect_error($q$select public.import_campaign_metrics('overland_motors', 'meta', 'csv', 'o.csv', '[{"campaign_id":"x","date":"2026-10-01","spend":1,"impressions":1,"clicks":1,"platform_leads":0}]')$q$, 'un gerente de Cardys no importa en Overland');

select pg_temp.act_as('00000000-0000-0000-0000-0000000002a2');
select pg_temp.expect_error($q$select public.import_campaign_metrics('cardys_fiat', 'meta', 'csv', 'a.csv', '[{"campaign_id":"x","date":"2026-10-01","spend":1,"impressions":1,"clicks":1,"platform_leads":0}]')$q$, 'un asesor no importa métricas');
select pg_temp.expect((select count(*) from public.metric_import_jobs) = 0, 'un asesor no ve los lotes');
select pg_temp.expect((select count(*) from public.integrations) = 0, 'un asesor no ve integraciones');

-- Integraciones y secretos
select pg_temp.act_as('00000000-0000-0000-0000-0000000002a1');
select pg_temp.expect((select count(*) from public.integrations) = 1, 'el gerente ve solo la integración de su organización');
select pg_temp.expect_error($q$select * from public.integration_secrets$q$, 'ningún usuario lee tokens');
select pg_temp.expect_error($q$update public.integrations set status = 'connected', last_tested_at = now(), external_account_id = 'act_1' where organization_id = 'cardys_fiat'$q$, 'nadie marca una integración como conectada desde la API');
select public.disconnect_integration('cardys_fiat', 'meta');
select pg_temp.expect((select status from public.integrations where organization_id = 'cardys_fiat') = 'revoked', 'desconectar deja la integración revocada');
reset role;
select pg_temp.expect(not exists(select 1 from public.integration_secrets where organization_id = 'cardys_fiat'), 'desconectar borra el token');
select pg_temp.expect_error($q$update public.integrations set status = 'connected' where organization_id = 'overland_motors'$q$, 'ni el servidor marca conectada sin prueba registrada');
select pg_temp.expect(not exists(select 1 from public.audit_events where entity_type = 'integration_secrets'), 'los tokens nunca van a auditoría');
select pg_temp.expect(exists(select 1 from public.audit_events where entity_type = 'metric_import_jobs'), 'los lotes quedan auditados');

\echo Todas las pruebas de Campaign Intelligence (P2) pasaron
