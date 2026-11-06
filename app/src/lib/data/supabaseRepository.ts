import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportPreview } from '../domain/leadImport';
import type { MetricImportPreview } from '../domain/metricImport';
import { toRpcRows } from '../integrations/meta';
import { scoreLead } from '../domain/scoring';
import type { Advisor, Campaign, CampaignMetricsDaily, Lead, OrganizationId, Role } from '../domain/types';
import type { QuoteAction } from '../domain/quotes';
import type { DateRange, Integration, LeadActivity, Member, MetricImportJob, PriceDocument, Quote, Task } from '../domain/types';
import type {
  ImportJob,
  LeadPatch,
  NewLeadInput,
  NewPriceDocumentInput,
  NewQuoteInput,
  NewTaskInput,
  Repository,
  Session,
  TaskPatch,
} from './repository';

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
      userId: data.user.id,
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

  // ───────────── P1 ─────────────

  private async names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const rows = check(await this.db.from('profiles').select('id, full_name, email').in('id', unique)) as Array<{ id: string; full_name: string; email: string | null }>;
    return new Map(rows.map((r) => [r.id, r.full_name || r.email || 'Usuario']));
  }

  async listActivities(leadId: string) {
    const rows = check(
      await this.db.from('lead_activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200),
    ) as Array<{ id: string; organization_id: OrganizationId; lead_id: string; kind: LeadActivity['kind']; body: string; actor_id: string | null; created_at: string }>;
    const names = await this.names(rows.map((r) => r.actor_id));
    return rows.map<LeadActivity>((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      leadId: r.lead_id,
      kind: r.kind,
      body: r.body,
      actorName: r.actor_id ? names.get(r.actor_id) : undefined,
      createdAt: r.created_at,
    }));
  }

  async addNote(leadId: string, body: string) {
    const { data } = await this.db.auth.getUser();
    const lead = check(await this.db.from('leads').select('organization_id').eq('id', leadId).single()) as { organization_id: OrganizationId };
    const row = check(
      await this.db
        .from('lead_activities')
        .insert({ organization_id: lead.organization_id, lead_id: leadId, kind: 'note', body: body.trim(), actor_id: data.user?.id })
        .select('*')
        .single(),
    ) as { id: string; created_at: string };
    return { id: row.id, organizationId: lead.organization_id, leadId, kind: 'note' as const, body: body.trim(), createdAt: row.created_at };
  }

  async listTasks() {
    const rows = check(await this.db.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false })) as Array<{
      id: string; organization_id: OrganizationId; lead_id: string | null; title: string; notes: string | null; priority: Task['priority'];
      status: Task['status']; due_at: string | null; assignee_id: string | null; created_at: string; completed_at: string | null;
    }>;
    return rows.map<Task>((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      leadId: r.lead_id ?? undefined,
      title: r.title,
      notes: r.notes ?? undefined,
      priority: r.priority,
      status: r.status,
      dueAt: r.due_at ?? undefined,
      assigneeId: r.assignee_id ?? undefined,
      createdAt: r.created_at,
      completedAt: r.completed_at ?? undefined,
    }));
  }

  async createTask(input: NewTaskInput) {
    const row = check(
      await this.db.from('tasks').insert({
        organization_id: input.organizationId,
        lead_id: input.leadId ?? null,
        title: input.title.trim(),
        notes: input.notes ?? null,
        priority: input.priority,
        due_at: input.dueAt ?? null,
        assignee_id: input.assigneeId ?? null,
      }).select('id').single(),
    ) as { id: string };
    return (await this.listTasks()).find((t) => t.id === row.id)!;
  }

  async updateTask(id: string, patch: TaskPatch) {
    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.priority !== undefined) update.priority = patch.priority;
    if (patch.assigneeId !== undefined) update.assignee_id = patch.assigneeId;
    if (patch.dueAt !== undefined) update.due_at = patch.dueAt;
    const row = check(await this.db.from('tasks').update(update).eq('id', id).select('id').maybeSingle());
    if (!row) throw new Error('No tenés permiso para modificar esta tarea');
    return (await this.listTasks()).find((t) => t.id === id)!;
  }

  private async toQuotes(rows: QuoteRow[]): Promise<Quote[]> {
    const names = await this.names(rows.flatMap((r) => [r.created_by, r.decided_by]));
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      number: r.number,
      leadId: r.lead_id ?? undefined,
      kind: r.kind,
      vehicle: r.vehicle,
      input: r.input,
      result: r.result,
      priceDocumentId: r.price_document_id ?? undefined,
      status: r.status,
      validUntil: r.valid_until,
      createdBy: r.created_by,
      createdByName: names.get(r.created_by),
      decidedByName: r.decided_by ? names.get(r.decided_by) : undefined,
      decidedAt: r.decided_at ?? undefined,
      decidedReason: r.decided_reason ?? undefined,
      createdAt: r.created_at,
    }));
  }

  async listQuotes() {
    return this.toQuotes(check(await this.db.from('quotes').select('*').order('created_at', { ascending: false })) as QuoteRow[]);
  }

  async createQuote(input: NewQuoteInput) {
    const row = check(
      await this.db
        .from('quotes')
        .insert({
          organization_id: input.organizationId,
          lead_id: input.leadId ?? null,
          kind: input.kind,
          vehicle: input.vehicle.trim(),
          input: input.input,
          result: input.result,
          price_document_id: input.priceDocumentId ?? null,
        })
        .select('*')
        .single(),
    ) as QuoteRow;
    return (await this.toQuotes([row]))[0]!;
  }

  async transitionQuote(id: string, action: QuoteAction, reason?: string) {
    const row = check(await this.db.rpc('quote_transition', { p_id: id, p_action: action, p_reason: reason ?? null })) as QuoteRow;
    return (await this.toQuotes([row]))[0]!;
  }

  async listPriceDocuments() {
    const rows = check(await this.db.from('price_documents').select('*').order('valid_from', { ascending: false })) as Array<{
      id: string; organization_id: OrganizationId; category: PriceDocument['category']; title: string; file_name: string;
      valid_from: string; valid_to: string | null; rows: PriceDocument['rows']; status: PriceDocument['status']; created_at: string;
    }>;
    return rows.map<PriceDocument>((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      category: r.category,
      title: r.title,
      fileName: r.file_name,
      validFrom: r.valid_from,
      validTo: r.valid_to ?? undefined,
      rows: r.rows,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  async createPriceDocument(input: NewPriceDocumentInput) {
    const row = check(
      await this.db
        .from('price_documents')
        .insert({
          organization_id: input.organizationId,
          category: input.category,
          title: input.title.trim(),
          file_name: input.fileName,
          valid_from: input.validFrom,
          valid_to: input.validTo ?? null,
          rows: input.rows,
        })
        .select('id')
        .single(),
    ) as { id: string };
    return (await this.listPriceDocuments()).find((d) => d.id === row.id)!;
  }

  async activatePriceDocument(id: string) {
    check(await this.db.rpc('activate_price_document', { p_id: id }));
    return (await this.listPriceDocuments()).find((d) => d.id === id)!;
  }

  async listMembers() {
    const rows = check(await this.db.from('memberships').select('organization_id, user_id, role')) as Array<{ organization_id: OrganizationId; user_id: string; role: Role }>;
    const profiles = rows.length
      ? (check(await this.db.from('profiles').select('id, full_name, email').in('id', [...new Set(rows.map((r) => r.user_id))])) as Array<{ id: string; full_name: string; email: string | null }>)
      : [];
    return rows.map<Member>((r) => {
      const p = profiles.find((x) => x.id === r.user_id);
      return { userId: r.user_id, name: p?.full_name || p?.email || 'Sin nombre', email: p?.email ?? undefined, organizationId: r.organization_id, role: r.role };
    });
  }

  async addMember(organizationId: OrganizationId, email: string, role: Role) {
    check(await this.db.rpc('add_member_by_email', { p_org: organizationId, p_email: email, p_role: role }));
    const members = await this.listMembers();
    return members.find((m) => m.organizationId === organizationId && m.email?.toLowerCase() === email.trim().toLowerCase())!;
  }

  async removeMember(organizationId: OrganizationId, userId: string) {
    check(await this.db.from('memberships').delete().eq('organization_id', organizationId).eq('user_id', userId));
  }
  // ───────────── P2 ─────────────

  async listMetricImports() {
    const rows = check(await this.db.from('metric_import_jobs').select('*').order('created_at', { ascending: false }).limit(100)) as Array<{
      id: string; organization_id: OrganizationId; platform: MetricImportJob['platform']; source: MetricImportJob['source']; file_name: string;
      range_from: string | null; range_to: string | null; counts: MetricImportJob['counts']; created_by: string; created_at: string; rolled_back_at: string | null;
    }>;
    const names = await this.names(rows.map((r) => r.created_by));
    return rows.map<MetricImportJob>((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      platform: r.platform,
      source: r.source,
      fileName: r.file_name,
      rangeFrom: r.range_from ?? undefined,
      rangeTo: r.range_to ?? undefined,
      counts: r.counts,
      createdAt: r.created_at,
      createdByName: names.get(r.created_by),
      rolledBack: !!r.rolled_back_at,
    }));
  }

  /** Una sola RPC transaccional: o entra el lote completo o no entra nada. */
  async applyMetricImport(preview: MetricImportPreview, fileName: string) {
    const changed = preview.outcomes.map((o) => o.metric);
    const names = new Map(preview.outcomes.map((o) => [o.metric.campaignId, o.campaignName]));
    const id = check(
      await this.db.rpc('import_campaign_metrics', {
        p_org: preview.organizationId,
        p_platform: preview.platform,
        p_source: 'csv',
        p_file_name: fileName,
        p_rows: toRpcRows(changed, names),
        p_campaigns: preview.newCampaigns,
      }),
    ) as string;
    return (await this.listMetricImports()).find((j) => j.id === id)!;
  }

  async rollbackMetricImport(jobId: string) {
    check(await this.db.rpc('rollback_metric_import', { p_job: jobId }));
  }

  async listIntegrations() {
    const rows = check(await this.db.from('integrations').select('*')) as Array<{
      organization_id: OrganizationId; provider: Integration['provider']; status: Integration['status']; external_account_id: string | null;
      external_account_name: string | null; currency: string | null; last_tested_at: string | null; last_sync_at: string | null; last_error: string | null;
    }>;
    return rows.map<Integration>((r) => ({
      organizationId: r.organization_id,
      provider: r.provider,
      status: r.status,
      externalAccountId: r.external_account_id ?? undefined,
      externalAccountName: r.external_account_name ?? undefined,
      currency: r.currency ?? undefined,
      lastTestedAt: r.last_tested_at ?? undefined,
      lastSyncAt: r.last_sync_at ?? undefined,
      lastError: r.last_error ?? undefined,
    }));
  }

  /** Llama a las rutas del servidor con el JWT del usuario: los secretos de Meta nunca llegan al navegador. */
  private async api<T>(path: string, body: unknown): Promise<T> {
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
    return json;
  }

  async connectMeta(organizationId: OrganizationId, adAccountId: string) {
    return (await this.api<{ url: string }>('/api/integrations/meta/connect', { organizationId, adAccountId })).url;
  }

  async syncMeta(organizationId: OrganizationId, range: DateRange) {
    return this.api<{ jobId: string | null; rows: number; skipped: number }>('/api/integrations/meta/sync', { organizationId, from: range.from, to: range.to });
  }

  async disconnectIntegration(organizationId: OrganizationId, provider: Integration['provider']) {
    check(await this.db.rpc('disconnect_integration', { p_org: organizationId, p_provider: provider }));
  }

}

interface QuoteRow {
  id: string;
  organization_id: OrganizationId;
  number: number;
  lead_id: string | null;
  kind: Quote['kind'];
  vehicle: string;
  input: Quote['input'];
  result: Quote['result'];
  price_document_id: string | null;
  status: Quote['status'];
  valid_until: string;
  created_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decided_reason: string | null;
  created_at: string;
}
