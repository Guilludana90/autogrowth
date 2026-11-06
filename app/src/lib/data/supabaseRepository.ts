import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportPreview } from '../domain/leadImport';
import { scoreLead } from '../domain/scoring';
import type { Advisor, Campaign, CampaignMetricsDaily, Lead, OrganizationId, Role } from '../domain/types';
import type { ImportJob, LeadPatch, NewLeadInput, Repository, Session } from './repository';

/* Filas tal como vienen de Postgres (snake_case). */
interface LeadRow {
  id: string;
  organization_id: OrganizationId;
  name: string;
  phone_e164: string | null;
  email: string | null;
  source: string;
  external_campaign_id: string | null;
  model_interest: string | null;
  score: number | null;
  score_reason: string | null;
  status: Lead['status'];
  lost_reason: string | null;
  advisor_id: string | null;
  created_at: string;
  updated_at: string;
}

const toLead = (r: LeadRow): Lead => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  phoneE164: r.phone_e164 ?? undefined,
  email: r.email ?? undefined,
  source: r.source,
  campaignId: r.external_campaign_id ?? undefined,
  modelInterest: r.model_interest ?? undefined,
  score: r.score ?? undefined,
  scoreReason: r.score_reason ?? undefined,
  status: r.status,
  lostReason: r.lost_reason ?? undefined,
  advisorId: r.advisor_id ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const leadInsert = (l: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'status'>, importJobId?: string) => ({
  organization_id: l.organizationId,
  name: l.name,
  phone_e164: l.phoneE164 ?? null,
  email: l.email ?? null,
  source: l.source,
  external_campaign_id: l.campaignId ?? null,
  model_interest: l.modelInterest ?? null,
  score: l.score ?? null,
  score_reason: l.scoreReason ?? null,
  import_job_id: importJobId ?? null,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Repositorio real: Supabase Auth + Postgres. Toda la seguridad la aplica RLS (supabase/migrations);
 * este cliente solo usa la anon key y la sesión del usuario.
 */
export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  constructor(private readonly db: SupabaseClient) {}

  async getSession(): Promise<Session | null> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) return null;
    const memberships = check(
      await this.db.from('memberships').select('organization_id, role').eq('user_id', data.user.id),
    ) as Array<{ organization_id: OrganizationId; role: Role }>;
    const profile = check(await this.db.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle()) as {
      full_name: string;
    } | null;
    return {
      userName: profile?.full_name || data.user.email || 'Usuario',
      roles: Object.fromEntries(memberships.map((m) => [m.organization_id, m.role])),
    };
  }

  async listLeads() {
    const rows = check(await this.db.from('leads').select('*').order('created_at', { ascending: false })) as LeadRow[];
    return rows.map(toLead);
  }

  async createLead(input: NewLeadInput) {
    const { score, reason } = scoreLead(input);
    const res = await this.db.from('leads').insert(leadInsert({ ...input, score, scoreReason: reason })).select('*').single();
    if (res.error?.code === '23505') throw new Error('Ya existe un lead con ese teléfono o email en este concesionario');
    return toLead(check(res) as LeadRow);
  }

  async updateLead(id: string, patch: LeadPatch) {
    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) {
      update.status = patch.status;
      update.lost_reason = patch.status === 'lost' ? (patch.lostReason ?? null) : null;
    }
    if (patch.advisorId !== undefined) update.advisor_id = patch.advisorId;
    const res = await this.db.from('leads').update(update).eq('id', id).select('*').maybeSingle();
    const row = check(res) as LeadRow | null;
    if (!row) throw new Error('No tenés permiso para modificar este lead');
    return toLead(row);
  }

  async applyImport(preview: ImportPreview, fileName: string) {
    const orgs = new Set(
      preview.outcomes.flatMap((o) => (o.kind === 'create' ? [o.lead.organizationId] : [])),
    );
    if (orgs.size > 1) throw new Error('Importá un concesionario por archivo');
    const creates = preview.outcomes.flatMap((o) => (o.kind === 'create' ? [o.lead] : []));
    const updates = preview.outcomes.flatMap((o) => (o.kind === 'update' ? [o] : []));
    const existing = updates.length
      ? (check(await this.db.from('leads').select('*').in('id', updates.map((u) => u.leadId))) as LeadRow[]).map(toLead)
      : [];
    const organizationId = creates[0]?.organizationId ?? existing[0]?.organizationId;
    if (!organizationId) throw new Error('No hay filas para importar');
    const previous: Record<string, Partial<Lead>> = {};
    for (const u of updates) {
      const before = existing.find((l) => l.id === u.leadId);
      if (before) previous[u.leadId] = Object.fromEntries(Object.keys(u.changes).map((k) => [k, before[k as keyof Lead] ?? null]));
    }

    const job = check(
      await this.db
        .from('import_jobs')
        .insert({ organization_id: organizationId, file_name: fileName, counts: preview.counts, previous })
        .select('id, created_at')
        .single(),
    ) as { id: string; created_at: string };

    if (creates.length) check(await this.db.from('leads').insert(creates.map((l) => leadInsert(l, job.id))));
    for (const u of updates) {
      const c = u.changes;
      check(
        await this.db
          .from('leads')
          .update({
            ...(c.modelInterest !== undefined && { model_interest: c.modelInterest }),
            ...(c.email !== undefined && { email: c.email }),
            ...(c.phoneE164 !== undefined && { phone_e164: c.phoneE164 }),
          })
          .eq('id', u.leadId),
      );
    }
    return { id: job.id, fileName, createdAt: job.created_at, counts: preview.counts, createdLeadIds: [], previous, rolledBack: false };
  }

  async rollbackImport(jobId: string) {
    const job = check(await this.db.from('import_jobs').select('previous').eq('id', jobId).single()) as {
      previous: Record<string, { modelInterest?: string | null; email?: string | null; phoneE164?: string | null }>;
    };
    check(await this.db.from('leads').delete().eq('import_job_id', jobId));
    for (const [id, p] of Object.entries(job.previous)) {
      check(
        await this.db
          .from('leads')
          .update({
            ...('modelInterest' in p && { model_interest: p.modelInterest }),
            ...('email' in p && { email: p.email }),
            ...('phoneE164' in p && { phone_e164: p.phoneE164 }),
          })
          .eq('id', id),
      );
    }
    check(await this.db.from('import_jobs').update({ rolled_back_at: new Date().toISOString() }).eq('id', jobId));
  }

  async listImportJobs() {
    const rows = check(
      await this.db.from('import_jobs').select('id, file_name, created_at, counts, previous, rolled_back_at').order('created_at', { ascending: false }),
    ) as Array<{ id: string; file_name: string; created_at: string; counts: ImportJob['counts']; previous: ImportJob['previous']; rolled_back_at: string | null }>;
    return rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      createdAt: r.created_at,
      counts: r.counts,
      createdLeadIds: [],
      previous: r.previous,
      rolledBack: r.rolled_back_at !== null,
    }));
  }

  async listAdvisors() {
    const rows = check(await this.db.from('org_advisors').select('organization_id, id, name')) as Array<{
      organization_id: OrganizationId;
      id: string;
      name: string;
    }>;
    return rows.map<Advisor>((r) => ({ id: r.id, name: r.name, organizationId: r.organization_id }));
  }

  async listCampaigns() {
    const rows = check(await this.db.from('campaigns').select('*')) as Array<{
      organization_id: OrganizationId;
      platform: Campaign['platform'];
      external_campaign_id: string;
      name: string;
      objective: string;
      status: Campaign['status'];
      currency: string;
    }>;
    return rows.map<Campaign>((r) => ({
      id: r.external_campaign_id,
      organizationId: r.organization_id,
      platform: r.platform,
      name: r.name,
      objective: r.objective,
      status: r.status,
      currency: r.currency,
    }));
  }

  async listMetrics() {
    const rows = check(await this.db.from('campaign_metrics_daily').select('*')) as Array<{
      organization_id: OrganizationId;
      platform: CampaignMetricsDaily['platform'];
      external_campaign_id: string;
      metric_date: string;
      currency: string;
      spend: string | number;
      impressions: number;
      clicks: number;
      platform_leads: number;
    }>;
    return rows.map<CampaignMetricsDaily>((r) => ({
      organizationId: r.organization_id,
      platform: r.platform,
      campaignId: r.external_campaign_id,
      date: r.metric_date,
      currency: r.currency,
      spend: Number(r.spend),
      impressions: r.impressions,
      clicks: r.clicks,
      platformLeads: r.platform_leads,
    }));
  }
}
