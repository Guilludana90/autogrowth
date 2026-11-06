-- AutoGrowth OS: esquema inicial de desarrollo. Revisar y probar RLS antes de producción.
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.organizations(id,name) values
 ('cardys_fiat','Cardys - FIAT'),
 ('overland_motors','Overland Motors - Jeep/RAM')
on conflict (id) do nothing;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','dealership_admin','sales_advisor','post_sales','read_only')),
  unique(organization_id,user_id)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  name text not null,
  phone_e164 text,
  email text,
  source text not null default 'manual',
  external_campaign_id text,
  model_interest text,
  score integer check (score between 0 and 100),
  score_reason text,
  status text not null default 'new' check (status in ('new','contacted','negotiation','won','lost')),
  advisor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone_e164 is not null or email is not null)
);
create unique index if not exists leads_phone_per_org on public.leads(organization_id,phone_e164) where phone_e164 is not null;
create unique index if not exists leads_email_per_org on public.leads(organization_id,lower(email)) where email is not null;

create table if not exists public.campaign_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  platform text not null check (platform in ('meta','google','tiktok','linkedin')),
  external_campaign_id text not null,
  campaign_name text not null,
  metric_date date not null,
  currency text not null default 'ARS',
  spend numeric(18,2) not null default 0 check(spend>=0),
  impressions integer not null default 0 check(impressions>=0),
  clicks integer not null default 0 check(clicks>=0),
  platform_leads integer not null default 0 check(platform_leads>=0),
  imported_at timestamptz not null default now(),
  unique(organization_id,platform,external_campaign_id,metric_date)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  lead_id uuid references public.leads(id) on delete set null,
  assignee_id uuid references auth.users(id),
  title text not null,
  due_at timestamptz,
  status text not null default 'pending' check(status in ('pending','in_progress','done')),
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  name text not null,
  version text not null,
  prompt_text text not null,
  status text not null default 'draft' check(status in ('draft','in_review','approved','active','rejected','rolled_back')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,name,version)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id),
  actor_id uuid references auth.users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function public.has_org_role(org text, allowed_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role=any(allowed_roles));
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.leads enable row level security;
alter table public.campaign_metrics_daily enable row level security;
alter table public.tasks enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_read on public.organizations for select to authenticated using (public.has_org_role(id,array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy memberships_read on public.memberships for select to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin']) or user_id=(select auth.uid()));
create policy leads_read on public.leads for select to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy leads_insert on public.leads for insert to authenticated with check (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor']));
create policy leads_update on public.leads for update to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor'])) with check (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor']));
create policy campaign_read on public.campaign_metrics_daily for select to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor','read_only']));
create policy campaign_write on public.campaign_metrics_daily for all to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin'])) with check (public.has_org_role(organization_id,array['super_admin','dealership_admin']));
create policy tasks_read on public.tasks for select to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor','post_sales','read_only']));
create policy tasks_write on public.tasks for all to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor','post_sales'])) with check (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor','post_sales']));
create policy prompt_read on public.prompt_versions for select to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin','sales_advisor','read_only']));
create policy prompt_insert on public.prompt_versions for insert to authenticated with check (public.has_org_role(organization_id,array['super_admin','dealership_admin']));
create policy prompt_update on public.prompt_versions for update to authenticated using (public.has_org_role(organization_id,array['super_admin'])) with check (public.has_org_role(organization_id,array['super_admin']));
create policy audit_read on public.audit_events for select to authenticated using (public.has_org_role(organization_id,array['super_admin','dealership_admin']));

-- Pendiente: policies seguras para alta de memberships, procedimiento inmutable de audit_events,
-- RPC transaccional para aprobar/activar prompts, storage privado y pruebas de aislamiento RLS.
