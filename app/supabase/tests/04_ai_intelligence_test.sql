-- Pruebas P3: corridas inmutables, feedback por usuario, prompts con historial y edición de borradores.
\set ON_ERROR_STOP on
reset role;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'super3@cardys.test'),
  ('00000000-0000-0000-0000-0000000003a2', 'gerente3@cardys.test'),
  ('00000000-0000-0000-0000-0000000003a3', 'asesor3@cardys.test'),
  ('00000000-0000-0000-0000-0000000003a4', 'lector3@cardys.test'),
  ('00000000-0000-0000-0000-0000000003b1', 'asesor3@overland.test');
insert into public.memberships(organization_id, user_id, role) values
  ('cardys_fiat', '00000000-0000-0000-0000-0000000003a1', 'super_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000003a2', 'dealership_admin'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000003a3', 'sales_advisor'),
  ('cardys_fiat', '00000000-0000-0000-0000-0000000003a4', 'read_only'),
  ('overland_motors', '00000000-0000-0000-0000-0000000003b1', 'sales_advisor');
insert into public.profiles(id, full_name) values
  ('00000000-0000-0000-0000-0000000003a1', 'Super Tres'),
  ('00000000-0000-0000-0000-0000000003a2', 'Gerente Tres')
  on conflict (id) do update set full_name = excluded.full_name;

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

-- ── Prompts: borrador editable por su autor, historial completo ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a2');
insert into public.prompt_versions(organization_id, name, version, prompt_text, created_by, change_note)
  values ('cardys_fiat', 'campaign_analyst', 'v1.0', 'Analizá la campaña', '00000000-0000-0000-0000-0000000003a2', 'versión inicial');
select public.prompt_update_draft((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'Analizá la campaña con evidencia', 'agrego evidencia');
select pg_temp.expect((select prompt_text from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0') = 'Analizá la campaña con evidencia', 'el autor edita su borrador');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003a1');
select pg_temp.expect_error($q$select public.prompt_update_draft((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'otro texto')$q$, 'otro usuario no edita el borrador ajeno');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003a2');
select pg_temp.expect_error($q$select public.prompt_update_draft((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), '   ')$q$, 'el borrador no queda vacío');
select public.prompt_transition((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'submit');
select pg_temp.expect_error($q$select public.prompt_update_draft((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'cambio tardío')$q$, 'en revisión ya no se edita');
select pg_temp.expect_error($q$select public.prompt_transition((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'approve')$q$, 'Dealership Admin no aprueba');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003a1');
select public.prompt_transition((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'approve');
select public.prompt_transition((select id from public.prompt_versions where name = 'campaign_analyst' and version = 'v1.0'), 'activate');
select pg_temp.expect(
  (select array_agg(e.to_status order by e.created_at) from public.prompt_version_events e join public.prompt_versions p on p.id = e.version_id
    where p.name = 'campaign_analyst' and p.version = 'v1.0') = array['draft','in_review','approved','active'],
  'el historial registra cada transición en orden');
select pg_temp.expect(
  (select actor_id from public.prompt_version_events e join public.prompt_versions p on p.id = e.version_id
    where p.name = 'campaign_analyst' and p.version = 'v1.0' and to_status = 'approved') = '00000000-0000-0000-0000-0000000003a1',
  'el historial guarda quién aprobó');
select pg_temp.expect((select approved_by_name from public.prompt_versions_named where name = 'campaign_analyst' and version = 'v1.0') = 'Super Tres', 'la vista muestra el aprobador');
select pg_temp.expect_error($q$insert into public.prompt_version_events(organization_id, version_id, to_status) values ('cardys_fiat', (select id from public.prompt_versions limit 1), 'active')$q$, 'nadie escribe el historial a mano');

-- ── Corridas ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a3');
insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, priority, problem_area, confidence, payload)
  values ('cardys_fiat', 'meta', 'p3-c1', '2026-10-01', '2026-10-31', 'rules', 'rules-v2', 'high', 'capture', 0.8, '{"diagnosis":"d"}');
select pg_temp.expect((select count(*) from public.recommendation_runs where campaign_id = 'p3-c1') = 1, 'el asesor guarda una corrida de reglas');
select pg_temp.expect_error($q$insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, priority, problem_area, confidence, payload)
  values ('cardys_fiat', 'meta', 'p3-c1', '2026-10-01', '2026-10-31', 'ai', 'prompt:x', 'high', 'capture', 0.8, '{}')$q$, 'una corrida de IA sin prompt se rechaza');
select pg_temp.expect_error($q$insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, prompt_version_id, priority, problem_area, confidence, payload)
  values ('cardys_fiat', 'meta', 'p3-c1', '2026-10-01', '2026-10-31', 'ai', 'prompt:analyst', (select id from public.prompt_versions where name = 'analyst' and status <> 'active' limit 1), 'high', 'capture', 0.8, '{}')$q$, 'una corrida de IA con prompt no activo se rechaza');
insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, prompt_version_id, priority, problem_area, confidence, payload)
  values ('cardys_fiat', 'meta', 'p3-c1', '2026-10-01', '2026-10-31', 'ai', 'prompt:campaign_analyst@v1.0', (select id from public.prompt_versions where name = 'campaign_analyst' and status = 'active'), 'medium', 'sales', 0.7, '{}');
select pg_temp.expect((select count(*) from public.recommendation_runs where engine = 'ai') = 1, 'una corrida de IA cita la versión activa');
select pg_temp.expect_error($q$insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, priority, problem_area, confidence, payload)
  values ('cardys_fiat', 'meta', 'x', '2026-10-01', '2026-10-31', 'rules', 'rules-v2', 'high', 'capture', 1.5, '{}')$q$, 'confianza fuera de rango');
select pg_temp.expect_error($q$insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, priority, problem_area, confidence, payload)
  values ('overland_motors', 'meta', 'x', '2026-10-01', '2026-10-31', 'rules', 'rules-v2', 'high', 'capture', 0.5, '{}')$q$, 'no se guardan corridas en otra organización');
update public.recommendation_runs set priority = 'low' where campaign_id = 'p3-c1';
delete from public.recommendation_runs where campaign_id = 'p3-c1';
select pg_temp.expect((select count(*) from public.recommendation_runs where campaign_id = 'p3-c1' and priority <> 'low') = 2, 'las corridas no se modifican ni se borran');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003a4');
select pg_temp.expect((select count(*) from public.recommendation_runs where campaign_id = 'p3-c1') = 2, 'solo lectura ve las corridas');
select pg_temp.expect_error($q$insert into public.recommendation_runs(organization_id, platform, campaign_id, window_from, window_to, engine, version, priority, problem_area, confidence, payload)
  values ('cardys_fiat', 'meta', 'x', '2026-10-01', '2026-10-31', 'rules', 'rules-v2', 'high', 'capture', 0.5, '{}')$q$, 'solo lectura no crea corridas');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003b1');
select pg_temp.expect((select count(*) from public.recommendation_runs) = 0, 'Overland no ve corridas de Cardys');

-- ── Feedback ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000003a3');
insert into public.recommendation_feedback(organization_id, run_id, useful, comment)
  values ('cardys_fiat', (select id from public.recommendation_runs where engine = 'rules' and campaign_id = 'p3-c1'), false, '  no aplica  ');
select pg_temp.expect((select comment from public.recommendation_feedback limit 1) = 'no aplica', 'el comentario se guarda recortado');
select pg_temp.expect_error($q$insert into public.recommendation_feedback(organization_id, run_id, useful)
  values ('cardys_fiat', (select id from public.recommendation_runs where engine = 'rules' and campaign_id = 'p3-c1'), true)$q$, 'un feedback por usuario y corrida');
update public.recommendation_feedback set useful = true, comment = null;
select pg_temp.expect((select useful from public.recommendation_feedback limit 1), 'el usuario cambia su respuesta');
select pg_temp.expect_error($q$update public.recommendation_feedback set run_id = (select id from public.recommendation_runs where engine = 'ai')$q$, 'el feedback no cambia de corrida');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003a2');
insert into public.recommendation_feedback(organization_id, run_id, useful)
  values ('cardys_fiat', (select id from public.recommendation_runs where engine = 'rules' and campaign_id = 'p3-c1'), false);
update public.recommendation_feedback set useful = false where user_id = '00000000-0000-0000-0000-0000000003a3';
select pg_temp.expect((select useful from public.recommendation_feedback where user_id = '00000000-0000-0000-0000-0000000003a3'), 'nadie cambia el feedback de otro');
select pg_temp.expect((select count(*) from public.recommendation_feedback) = 2, 'el gerente ve el feedback del equipo');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003a4');
select pg_temp.expect_error($q$insert into public.recommendation_feedback(organization_id, run_id, useful)
  values ('cardys_fiat', (select id from public.recommendation_runs where engine = 'ai'), true)$q$, 'solo lectura no deja feedback');

select pg_temp.act_as('00000000-0000-0000-0000-0000000003b1');
select pg_temp.expect((select count(*) from public.recommendation_feedback) = 0, 'Overland no ve feedback de Cardys');

reset role;
select pg_temp.expect_error($q$insert into public.recommendation_feedback(organization_id, run_id, useful, user_id)
  values ('overland_motors', (select id from public.recommendation_runs where engine = 'ai'), true, '00000000-0000-0000-0000-0000000003b1')$q$, 'el feedback no cruza organizaciones');
select pg_temp.expect((select count(*) from public.audit_events where entity_type in ('recommendation_runs', 'recommendation_feedback')) >= 5, 'corridas y feedback auditados');
select 'Todas las pruebas de AI Intelligence (P3) pasaron' as ok \gset
\echo :ok
