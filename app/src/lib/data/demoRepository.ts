import { toDay } from '../domain/dates';
import type { ImportPreview } from '../domain/leadImport';
import type { MetricImportPreview } from '../domain/metricImport';
import { normalizeEmail } from '../domain/phone';
import { nextStatus, validUntil, type QuoteAction } from '../domain/quotes';
import { scoreLead } from '../domain/scoring';
import type {
  Campaign,
  CampaignMetricsDaily,
  Integration,
  Lead,
  LeadActivity,
  Member,
  MetricImportJob,
  OrganizationId,
  AppointmentEvent,
  ConsentEvent,
  ConversationMessage,
  KnowledgeArticle,
  PartsRequest,
  ServiceAppointment,
  Platform,
  PriceDocument,
  PromptAction,
  PromptEvent,
  PromptVersion,
  Quote,
  RecommendationFeedback,
  RecommendationRun,
  Role,
  Task,
} from '../domain/types';
import { nextPromptStatus, VERSION_RE } from '../domain/governance';
import type { CampaignRecommendation } from '../domain/recommendations';
import { toRecommendationJson } from '../domain/recommendations';
import { demoPrompts } from '../demo/seedP3';
import { demoAppointments, demoInbox, demoKnowledge, demoParts } from '../demo/seedP4';
import {
  appointmentActions,
  findConflicts,
  nextAppointmentStatus,
  nextArticleVersion,
  nextKnowledgeStatus,
  nextPartsStatus,
  normalizePlate,
  outboundCheck,
  partsActions,
  validateAppointment,
  validatePartsStep,
  APPOINTMENT_NEEDS_REASON,
  type AppointmentAction,
  type KnowledgeAction,
  type PartsAction,
} from '../domain/postventa';
import { APPOINTMENT_STATUS_LABEL, CHANNEL_LABEL } from '../domain/types';
import { ORGANIZATIONS } from '../domain/types';
import { STATUS_LABEL } from '../domain/types';
import { DEMO_CAMPAIGNS, demoLeads, demoMetrics } from '../demo/seed';
import { DEMO_MEMBERS, DEMO_USER_ID, demoPriceDocuments, demoQuotes, demoTasks } from '../demo/seedP1';
import type {
  AiAnalysisResult,
  AiStatus,
  ImportJob,
  NewPromptDraftInput,
  NewAppointmentInput,
  NewConsentInput,
  NewKnowledgeInput,
  NewMessageInput,
  NewPartsInput,
  PartsStepInput,
  LeadPatch,
  NewLeadInput,
  NewPriceDocumentInput,
  NewQuoteInput,
  NewTaskInput,
  Repository,
  Session,
  TaskPatch,
} from './repository';

const KEY = 'autogrowth:demo:v6';

interface DemoMetricJob extends MetricImportJob {
  previous: CampaignMetricsDaily[];
  createdKeys: string[];
  createdCampaigns: string[];
}

const mkey = (m: Pick<CampaignMetricsDaily, 'organizationId' | 'platform' | 'campaignId' | 'date'>) =>
  `${m.organizationId}|${m.platform}|${m.campaignId}|${m.date}`;
const ckey = (c: { organizationId: string; platform: string; id: string }) => `${c.organizationId}|${c.platform}|${c.id}`;
export const DEMO_AI_OFF = 'Modo demo: la IA generativa está desactivada. Las recomendaciones salen del motor de reglas; el análisis con IA se habilita en el servidor con Supabase y ANTHROPIC_API_KEY.';
const DEMO_OFF = 'Modo demo: la conexión con Meta está desactivada. Se habilita en un entorno con Supabase y una app de Meta de desarrollo.';

interface DemoState {
  seededOn: string;
  leads: Lead[];
  imports: ImportJob[];
  activities: LeadActivity[];
  tasks: Task[];
  quotes: Quote[];
  priceDocs: PriceDocument[];
  members: Member[];
  campaigns: Campaign[];
  metrics: CampaignMetricsDaily[];
  metricJobs: DemoMetricJob[];
  prompts: PromptVersion[];
  promptEvents: PromptEvent[];
  runs: RecommendationRun[];
  feedback: RecommendationFeedback[];
  appointments: ServiceAppointment[];
  appointmentEvents: AppointmentEvent[];
  parts: PartsRequest[];
  knowledge: KnowledgeArticle[];
  consents: ConsentEvent[];
  messages: ConversationMessage[];
}

function readStorage(): DemoState | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as DemoState) : null;
  } catch {
    return null;
  }
}

function writeStorage(s: DemoState) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado o storage lleno: la demo sigue funcionando en memoria */
  }
}

const uid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = <T,>(v: T): T => structuredClone(v);

/**
 * Repositorio de DEMO_MODE: datos ficticios en el navegador. No hace ninguna llamada de red.
 * Replica las reglas de la base (dedupe, asesor de la misma org, historial, numeración y aprobación de cotizaciones).
 */
export class DemoRepository implements Repository {
  readonly mode = 'demo' as const;
  private state: DemoState;
  private readonly today: string;

  constructor(today = toDay(new Date())) {
    this.today = today;
    this.state = readStorage() ?? this.fresh();
  }

  private fresh(): DemoState {
    const metrics = demoMetrics(this.today);
    const leads = demoLeads(this.today, metrics);
    const prompts = demoPrompts(this.today);
    const svc = demoAppointments(this.today, leads);
    const inbox = demoInbox(this.today, leads);
    return {
      appointments: svc.appointments,
      appointmentEvents: svc.events,
      parts: demoParts(this.today),
      knowledge: demoKnowledge(this.today),
      consents: inbox.consents,
      messages: inbox.messages,
      prompts: prompts.versions,
      promptEvents: prompts.events,
      runs: [],
      feedback: [],
      campaigns: DEMO_CAMPAIGNS,
      metrics,
      metricJobs: [],
      seededOn: this.today,
      leads,
      imports: [],
      activities: [],
      tasks: demoTasks(this.today, leads),
      quotes: demoQuotes(this.today, leads),
      priceDocs: demoPriceDocuments(this.today),
      members: DEMO_MEMBERS,
    };
  }

  private commit() {
    writeStorage(this.state);
  }

  private memberName(userId?: string) {
    return this.state.members.find((m) => m.userId === userId)?.name;
  }

  private log(lead: Pick<Lead, 'id' | 'organizationId'>, kind: LeadActivity['kind'], body: string, actor = true) {
    this.state.activities.unshift({
      id: uid(),
      organizationId: lead.organizationId,
      leadId: lead.id,
      kind,
      body,
      actorName: actor ? 'Usuario demo' : undefined,
      createdAt: new Date().toISOString(),
    });
  }

  async getSession(): Promise<Session> {
    return { userId: DEMO_USER_ID, userName: 'Usuario demo', roles: { cardys_fiat: 'super_admin', overland_motors: 'super_admin' } };
  }

  async listLeads() {
    return clone(this.state.leads);
  }

  async createLead(input: NewLeadInput) {
    const dup = this.state.leads.find(
      (l) =>
        l.organizationId === input.organizationId &&
        ((input.phoneE164 && l.phoneE164 === input.phoneE164) || (input.email && l.email === input.email)),
    );
    if (dup) throw new Error(`Ya existe un lead con ese teléfono o email: ${dup.name}`);
    const now = new Date().toISOString();
    const { score, reason } = scoreLead(input);
    const lead: Lead = { id: uid(), ...input, score, scoreReason: reason, status: 'new', createdAt: now, updatedAt: now };
    this.state.leads.unshift(lead);
    this.log(lead, 'created', `Lead creado (origen: ${lead.source})`);
    this.commit();
    return clone(lead);
  }

  async updateLead(id: string, patch: LeadPatch) {
    const lead = this.state.leads.find((l) => l.id === id);
    if (!lead) throw new Error('Lead inexistente');
    if (patch.status === 'lost' && !patch.lostReason?.trim()) throw new Error('Indicá el motivo de pérdida');
    if (patch.advisorId) {
      const ok = this.state.members.some((m) => m.userId === patch.advisorId && m.organizationId === lead.organizationId);
      if (!ok) throw new Error('El asesor no pertenece a este concesionario');
    }
    if (patch.status !== undefined && patch.status !== lead.status) {
      const reason = patch.status === 'lost' ? ` (${patch.lostReason!.trim()})` : '';
      this.log(lead, 'status', `Estado: ${STATUS_LABEL[lead.status]} → ${STATUS_LABEL[patch.status]}${reason}`);
      lead.status = patch.status;
      if (patch.status === 'lost') lead.lostReason = patch.lostReason!.trim();
      else delete lead.lostReason;
    }
    if (patch.advisorId !== undefined && (patch.advisorId ?? undefined) !== lead.advisorId) {
      if (patch.advisorId === null) delete lead.advisorId;
      else lead.advisorId = patch.advisorId;
      this.log(lead, 'assigned', patch.advisorId ? `Asignado a ${this.memberName(patch.advisorId) ?? 'asesor'}` : 'Asesor quitado');
    }
    lead.updatedAt = new Date().toISOString();
    this.commit();
    return clone(lead);
  }

  async applyImport(preview: ImportPreview, fileName: string) {
    const job: ImportJob = { id: uid(), fileName, createdAt: new Date().toISOString(), counts: preview.counts, createdLeadIds: [], previous: {}, rolledBack: false };
    for (const o of preview.outcomes) {
      if (o.kind === 'create') {
        this.state.leads.unshift(o.lead);
        job.createdLeadIds.push(o.lead.id);
        this.log(o.lead, 'import', `Lead importado desde ${fileName}`);
      } else if (o.kind === 'update') {
        const lead = this.state.leads.find((l) => l.id === o.leadId);
        if (!lead) continue;
        job.previous[lead.id] ??= Object.fromEntries(Object.keys(o.changes).map((k) => [k, lead[k as keyof Lead]]));
        Object.assign(lead, o.changes, { updatedAt: job.createdAt });
      }
    }
    this.state.imports.unshift(job);
    this.commit();
    return clone(job);
  }

  async rollbackImport(jobId: string) {
    const job = this.state.imports.find((j) => j.id === jobId);
    if (!job || job.rolledBack) return;
    const created = new Set(job.createdLeadIds);
    this.state.leads = this.state.leads.filter((l) => !created.has(l.id));
    this.state.activities = this.state.activities.filter((a) => !created.has(a.leadId));
    for (const [id, prev] of Object.entries(job.previous)) {
      const lead = this.state.leads.find((l) => l.id === id);
      if (lead) Object.assign(lead, prev);
    }
    job.rolledBack = true;
    this.commit();
  }

  async listImportJobs() {
    return clone(this.state.imports);
  }

  async listAdvisors() {
    return this.state.members
      .filter((m) => m.role === 'sales_advisor' || m.role === 'dealership_admin')
      .map((m) => ({ id: m.userId, name: m.name, organizationId: m.organizationId }));
  }

  async listCampaigns() {
    return clone(this.state.campaigns);
  }

  async listMetrics() {
    return clone(this.state.metrics);
  }

  // ───────────── P2 ─────────────

  async listMetricImports(): Promise<MetricImportJob[]> {
    return this.state.metricJobs.map(({ previous: _p, createdKeys: _k, createdCampaigns: _c, ...j }) => clone(j));
  }

  async applyMetricImport(preview: MetricImportPreview, fileName: string) {
    const rows = preview.outcomes.filter((o) => o.kind !== 'unchanged');
    if (!preview.outcomes.length) throw new Error('No hay filas para importar');
    if (preview.outcomes.some((o) => o.metric.date > this.today)) throw new Error('Hay fechas futuras');
    const index = new Map(this.state.metrics.map((m, i) => [mkey(m), i]));
    const known = new Set(this.state.campaigns.map(ckey));
    const job: DemoMetricJob = {
      id: uid(),
      organizationId: preview.organizationId,
      platform: preview.platform,
      source: 'csv',
      fileName,
      rangeFrom: preview.range?.from,
      rangeTo: preview.range?.to,
      counts: { create: 0, update: 0, unchanged: preview.counts.unchanged, campaigns: 0 },
      createdAt: new Date().toISOString(),
      createdByName: 'Usuario demo',
      rolledBack: false,
      previous: [],
      createdKeys: [],
      createdCampaigns: [],
    };
    for (const o of rows) {
      const k = mkey(o.metric);
      const i = index.get(k);
      if (i === undefined) {
        this.state.metrics.push(clone(o.metric));
        job.createdKeys.push(k);
        job.counts.create++;
      } else {
        job.previous.push(clone(this.state.metrics[i]!));
        this.state.metrics[i] = clone(o.metric);
        job.counts.update++;
      }
    }
    for (const o of preview.outcomes) {
      const c = { organizationId: o.metric.organizationId, platform: o.metric.platform, id: o.metric.campaignId };
      if (known.has(ckey(c))) continue;
      known.add(ckey(c));
      this.state.campaigns.push({ ...c, name: o.campaignName, objective: '', status: 'active', currency: o.metric.currency });
      job.createdCampaigns.push(ckey(c));
      job.counts.campaigns++;
    }
    this.state.metricJobs.unshift(job);
    this.commit();
    return (await this.listMetricImports())[0]!;
  }

  async rollbackMetricImport(jobId: string) {
    const job = this.state.metricJobs.find((j) => j.id === jobId);
    if (!job) throw new Error('Lote inexistente');
    if (job.rolledBack) throw new Error('El lote ya fue revertido');
    const later = this.state.metricJobs.some(
      (j) => j.organizationId === job.organizationId && j.platform === job.platform && !j.rolledBack && j.createdAt > job.createdAt,
    );
    if (later) throw new Error('Hay lotes posteriores de la misma plataforma: revertí primero el más reciente');
    const created = new Set(job.createdKeys);
    this.state.metrics = this.state.metrics.filter((m) => !created.has(mkey(m)));
    const prev = new Map(job.previous.map((m) => [mkey(m), m]));
    this.state.metrics = this.state.metrics.map((m) => prev.get(mkey(m)) ?? m);
    const withMetrics = new Set(this.state.metrics.map((m) => ckey({ ...m, id: m.campaignId })));
    const dropped = new Set(job.createdCampaigns.filter((k) => !withMetrics.has(k)));
    this.state.campaigns = this.state.campaigns.filter((c) => !dropped.has(ckey(c)));
    job.rolledBack = true;
    this.commit();
  }

  async listIntegrations(): Promise<Integration[]> {
    return ORGANIZATIONS.map((o) => ({ organizationId: o.id, provider: 'meta' as const, status: 'not_connected' as const }));
  }

  async connectMeta(): Promise<string> {
    throw new Error(DEMO_OFF);
  }

  async syncMeta(): Promise<{ jobId: string | null; rows: number; skipped: number }> {
    throw new Error(DEMO_OFF);
  }

  async disconnectIntegration() {
    throw new Error(DEMO_OFF);
  }

  // ───────────── P1 ─────────────

  async listActivities(leadId: string) {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) return [];
    const list = this.state.activities.filter((a) => a.leadId === leadId);
    // Los leads sembrados no tienen evento de alta: se deriva de createdAt (no se inventan otros eventos).
    if (!list.some((a) => a.kind === 'created' || a.kind === 'import')) {
      list.push({ id: `created-${lead.id}`, organizationId: lead.organizationId, leadId, kind: 'created', body: `Lead creado (origen: ${lead.source})`, createdAt: lead.createdAt });
    }
    return clone(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async addNote(leadId: string, body: string) {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error('Lead inexistente');
    const text = body.trim();
    if (!text || text.length > 2000) throw new Error('La nota debe tener entre 1 y 2000 caracteres');
    this.log(lead, 'note', text);
    this.commit();
    return clone(this.state.activities[0]!);
  }

  async listTasks() {
    return clone(this.state.tasks);
  }

  private checkTaskRefs(t: Pick<Task, 'organizationId' | 'leadId' | 'assigneeId'>) {
    if (t.leadId && !this.state.leads.some((l) => l.id === t.leadId && l.organizationId === t.organizationId)) {
      throw new Error('El lead no pertenece a este concesionario');
    }
    if (t.assigneeId && !this.state.members.some((m) => m.userId === t.assigneeId && m.organizationId === t.organizationId)) {
      throw new Error('El responsable no pertenece a este concesionario');
    }
  }

  async createTask(input: NewTaskInput) {
    const title = input.title.trim();
    if (title.length < 2 || title.length > 200) throw new Error('El título debe tener entre 2 y 200 caracteres');
    this.checkTaskRefs(input);
    const task: Task = { id: uid(), ...input, title, status: 'pending', createdAt: new Date().toISOString() };
    this.state.tasks.unshift(task);
    const lead = this.state.leads.find((l) => l.id === input.leadId);
    if (lead) this.log(lead, 'task', `Tarea creada: ${title}`);
    this.commit();
    return clone(task);
  }

  async updateTask(id: string, patch: TaskPatch) {
    const t = this.state.tasks.find((x) => x.id === id);
    if (!t) throw new Error('Tarea inexistente');
    const next = { ...t, ...patch, assigneeId: patch.assigneeId === null ? undefined : (patch.assigneeId ?? t.assigneeId), dueAt: patch.dueAt === null ? undefined : (patch.dueAt ?? t.dueAt) };
    this.checkTaskRefs(next);
    if (next.status === 'done' && t.status !== 'done') {
      next.completedAt = new Date().toISOString();
      const lead = this.state.leads.find((l) => l.id === t.leadId);
      if (lead) this.log(lead, 'task', `Tarea completada: ${t.title}`);
    }
    if (next.status !== 'done') delete next.completedAt;
    Object.assign(t, next);
    this.commit();
    return clone(t);
  }

  async listQuotes() {
    return clone(this.state.quotes);
  }

  async createQuote(input: NewQuoteInput) {
    if (input.leadId && !this.state.leads.some((l) => l.id === input.leadId && l.organizationId === input.organizationId)) {
      throw new Error('El lead no pertenece a este concesionario');
    }
    if (input.vehicle.trim().length < 2) throw new Error('Indicá el vehículo');
    const number = Math.max(0, ...this.state.quotes.filter((q) => q.organizationId === input.organizationId).map((q) => q.number)) + 1;
    const quote: Quote = {
      id: uid(),
      ...input,
      vehicle: input.vehicle.trim(),
      number,
      status: 'draft',
      validUntil: validUntil(this.today),
      createdBy: DEMO_USER_ID,
      createdByName: 'Usuario demo',
      createdAt: new Date().toISOString(),
    };
    this.state.quotes.unshift(quote);
    this.commit();
    return clone(quote);
  }

  async transitionQuote(id: string, action: QuoteAction, reason?: string) {
    const q = this.state.quotes.find((x) => x.id === id);
    if (!q) throw new Error('Cotización inexistente');
    if (action === 'reject' && !reason?.trim()) throw new Error('El rechazo requiere un motivo');
    // Los permisos por rol los valida AppContext con canTransition (mismas reglas que quote_transition()).
    q.status = nextStatus(action);
    if (action === 'submit') {
      delete q.decidedByName;
      delete q.decidedAt;
      delete q.decidedReason;
    } else {
      q.decidedByName = 'Usuario demo';
      q.decidedAt = new Date().toISOString();
      q.decidedReason = reason?.trim() || undefined;
      if (action === 'approve' && q.validUntil < this.today) q.validUntil = this.today;
    }
    const lead = this.state.leads.find((l) => l.id === q.leadId);
    if (lead) {
      const what = action === 'submit' ? 'enviada a aprobación' : action === 'approve' ? 'aprobada' : `rechazada (${reason!.trim()})`;
      this.log(lead, 'quote', `Cotización #${q.number} · ${q.vehicle}: ${what}`);
    }
    this.commit();
    return clone(q);
  }

  async listPriceDocuments() {
    return clone(this.state.priceDocs);
  }

  async createPriceDocument(input: NewPriceDocumentInput) {
    if (input.validTo && input.validTo < input.validFrom) throw new Error('La vigencia termina antes de empezar');
    const doc: PriceDocument = { id: uid(), ...input, status: 'draft', createdAt: new Date().toISOString() };
    this.state.priceDocs.unshift(doc);
    this.commit();
    return clone(doc);
  }

  async activatePriceDocument(id: string) {
    const d = this.state.priceDocs.find((x) => x.id === id);
    if (!d) throw new Error('Documento inexistente');
    for (const other of this.state.priceDocs) {
      if (other.organizationId === d.organizationId && other.category === d.category && other.status === 'active') other.status = 'archived';
    }
    d.status = 'active';
    this.commit();
    return clone(d);
  }

  async listMembers() {
    return clone(this.state.members);
  }

  async addMember(organizationId: OrganizationId, email: string, role: Role) {
    const e = normalizeEmail(email);
    if (!e) throw new Error('Email inválido');
    const existing = this.state.members.find((m) => m.email === e);
    const member: Member = { userId: existing?.userId ?? uid(), name: existing?.name ?? e.split('@')[0]!, email: e, organizationId, role };
    this.state.members = this.state.members.filter((m) => !(m.userId === member.userId && m.organizationId === organizationId));
    this.state.members.push(member);
    this.commit();
    return clone(member);
  }

  async removeMember(organizationId: OrganizationId, userId: string) {
    if (userId === DEMO_USER_ID) throw new Error('No podés quitarte a vos mismo');
    this.state.members = this.state.members.filter((m) => !(m.userId === userId && m.organizationId === organizationId));
    for (const l of this.state.leads) if (l.organizationId === organizationId && l.advisorId === userId) delete l.advisorId;
    for (const t of this.state.tasks) if (t.organizationId === organizationId && t.assigneeId === userId) delete t.assigneeId;
    this.commit();
  }

  // ───────────── P3 ─────────────

  async listPromptVersions() {
    return clone(this.state.prompts);
  }

  async listPromptEvents() {
    return clone(this.state.promptEvents);
  }

  private promptEvent(v: PromptVersion, from: PromptVersion['status'] | undefined, reason?: string) {
    this.state.promptEvents.push({ id: uid(), versionId: v.id, fromStatus: from, toStatus: v.status, actorName: 'Usuario demo', reason, createdAt: new Date().toISOString() });
  }

  async createPromptDraft(input: NewPromptDraftInput) {
    const text = input.promptText.trim();
    if (!text || text.length > 20000) throw new Error('El prompt no puede quedar vacío ni superar 20.000 caracteres');
    if (!VERSION_RE.test(input.version)) throw new Error('La versión tiene que tener el formato v1.3');
    if (this.state.prompts.some((p) => p.organizationId === input.organizationId && p.name === input.name && p.version === input.version))
      throw new Error(`Ya existe la versión ${input.version}`);
    const v: PromptVersion = {
      id: uid(),
      ...input,
      promptText: text,
      changeNote: input.changeNote?.trim() || undefined,
      status: 'draft',
      createdBy: DEMO_USER_ID,
      createdByName: 'Usuario demo',
      createdAt: new Date().toISOString(),
    };
    this.state.prompts.push(v);
    this.promptEvent(v, undefined, v.changeNote);
    this.commit();
    return clone(v);
  }

  async updatePromptDraft(id: string, promptText: string, changeNote?: string) {
    const v = this.state.prompts.find((p) => p.id === id);
    if (!v) throw new Error('Versión inexistente');
    if (v.status !== 'draft') throw new Error('Solo se edita un borrador');
    if (v.createdBy !== DEMO_USER_ID) throw new Error('Solo el autor edita su borrador');
    const text = promptText.trim();
    if (!text || text.length > 20000) throw new Error('El prompt no puede quedar vacío ni superar 20.000 caracteres');
    v.promptText = text;
    v.changeNote = changeNote?.trim() || undefined;
    this.commit();
    return clone(v);
  }

  /** Mismas validaciones de estado y motivo que prompt_transition(); el rol lo valida AppContext con canPrompt. */
  async transitionPrompt(id: string, action: PromptAction, reason?: string) {
    const v = this.state.prompts.find((p) => p.id === id);
    if (!v) throw new Error('Versión inexistente');
    const r = reason?.trim() || undefined;
    const now = new Date().toISOString();
    const from = v.status;
    const retireActive = (why: string) => {
      const cur = this.state.prompts.find((p) => p.organizationId === v.organizationId && p.name === v.name && p.status === 'active');
      if (!cur) return;
      cur.status = 'rolled_back';
      cur.decidedReason = why;
      this.promptEvent(cur, 'active', why);
    };
    if (action === 'submit') {
      if (v.status !== 'draft') throw new Error('Solo un borrador se envía a revisión');
      v.submittedAt = now;
    } else if (action === 'approve') {
      if (v.status !== 'in_review') throw new Error('Solo se aprueba una versión en revisión');
      v.approvedByName = 'Usuario demo';
      v.approvedAt = now;
      v.decidedReason = r;
    } else if (action === 'reject') {
      if (v.status !== 'in_review' && v.status !== 'approved') throw new Error(`No se puede rechazar en estado ${v.status}`);
      if (!r) throw new Error('El rechazo requiere un motivo');
      v.decidedReason = r;
    } else if (action === 'activate') {
      if (v.status !== 'approved') throw new Error('Solo se activa una versión aprobada');
      retireActive(r ?? `Reemplazada por ${v.version}`);
      v.activatedAt = now;
    } else {
      if (v.status !== 'rolled_back' || !v.approvedByName) throw new Error('Solo se puede volver a una versión aprobada que estuvo activa');
      if (!r) throw new Error('El rollback requiere un motivo');
      retireActive(r);
      v.activatedAt = now;
    }
    v.status = nextPromptStatus(action);
    this.promptEvent(v, from, action === 'reject' || action === 'rollback' || action === 'approve' ? r : undefined);
    this.commit();
    return clone(v);
  }

  async listRecommendationRuns() {
    return clone(this.state.runs);
  }

  async saveRulesRun(organizationId: OrganizationId, platform: Platform, rec: CampaignRecommendation) {
    if (rec.engine !== 'rules') throw new Error('Las corridas de IA las guarda el servidor');
    if (!rec.window) throw new Error('Falta el período analizado');
    const run: RecommendationRun = {
      id: uid(),
      organizationId,
      platform,
      campaignId: rec.campaignId,
      windowFrom: rec.window.from,
      windowTo: rec.window.to,
      engine: 'rules',
      version: rec.version,
      priority: rec.priority,
      problemArea: rec.problemArea,
      confidence: rec.confidence,
      payload: toRecommendationJson(rec),
      createdAt: new Date().toISOString(),
    };
    this.state.runs.unshift(run);
    this.commit();
    return clone(run);
  }

  async listFeedback() {
    return clone(this.state.feedback);
  }

  async submitFeedback(runId: string, useful: boolean, comment?: string) {
    const run = this.state.runs.find((r) => r.id === runId);
    if (!run) throw new Error('Corrida inexistente');
    const c = comment?.trim() || undefined;
    if (c && c.length > 500) throw new Error('El comentario admite hasta 500 caracteres');
    let f = this.state.feedback.find((x) => x.runId === runId && x.userId === DEMO_USER_ID);
    if (f) Object.assign(f, { useful, comment: c });
    else {
      f = { id: uid(), organizationId: run.organizationId, runId, useful, comment: c, userId: DEMO_USER_ID, userName: 'Usuario demo', createdAt: new Date().toISOString() };
      this.state.feedback.unshift(f);
    }
    this.commit();
    return clone(f);
  }

  async aiStatus(): Promise<AiStatus> {
    return { enabled: false, reason: DEMO_AI_OFF };
  }

  async runAiAnalysis(): Promise<AiAnalysisResult> {
    throw new Error(DEMO_AI_OFF);
  }

  // ───────────── P4 ─────────────

  async listAppointments() {
    return clone(this.state.appointments);
  }

  async listAppointmentEvents() {
    return clone(this.state.appointmentEvents);
  }

  private apptEvent(a: ServiceAppointment, from: ServiceAppointment['status'] | undefined, reason?: string) {
    const createdAt = new Date().toISOString();
    this.state.appointmentEvents.push({ id: uid(), appointmentId: a.id, fromStatus: from, toStatus: a.status, actorName: 'Usuario demo', reason, createdAt });
    if (a.leadId) {
      const lead = this.state.leads.find((l) => l.id === a.leadId);
      const when = new Date(a.scheduledAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
      if (lead) this.log(lead, 'service', `Turno de taller ${when}: ${APPOINTMENT_STATUS_LABEL[a.status][0]}${reason ? ` (${reason})` : ''}`);
    }
  }

  /** Mismas validaciones que check_appointment(): datos, lead y asesor de la org, nada en el pasado, sin superposición por box. */
  async createAppointment(input: NewAppointmentInput) {
    const errors = validateAppointment(input, new Date());
    if (errors.length) throw new Error(errors.join(' '));
    if (input.leadId && !this.state.leads.some((l) => l.id === input.leadId && l.organizationId === input.organizationId)) throw new Error('El lead no pertenece a la organización');
    if (input.advisorId && !this.state.members.some((m) => m.userId === input.advisorId && m.organizationId === input.organizationId)) throw new Error('El asesor de servicio no pertenece a la organización');
    const clash = findConflicts(input, this.state.appointments)[0];
    if (clash) throw new Error(`El ${input.bay} ya tiene un turno que se superpone (${clash.customerName}, ${new Date(clash.scheduledAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})`);
    const now = new Date().toISOString();
    const a: ServiceAppointment = {
      id: uid(),
      ...input,
      customerName: input.customerName.trim(),
      vehicle: input.vehicle.trim(),
      bay: input.bay.trim(),
      plate: normalizePlate(input.plate),
      notes: input.notes?.trim() || undefined,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    };
    this.state.appointments.push(a);
    this.apptEvent(a, undefined);
    this.commit();
    return clone(a);
  }

  async transitionAppointment(id: string, action: AppointmentAction, reason?: string) {
    const a = this.state.appointments.find((x) => x.id === id);
    if (!a) throw new Error('Turno inexistente');
    if (!appointmentActions(a, new Date()).includes(action)) throw new Error(action === 'no_show' && a.status !== 'delivered' ? 'Todavía no llegó la hora del turno' : `No se puede pasar de ${APPOINTMENT_STATUS_LABEL[a.status][0]} con esa acción`);
    const r = reason?.trim();
    if (APPOINTMENT_NEEDS_REASON.has(action) && !r) throw new Error('Indicá el motivo');
    const from = a.status;
    a.status = nextAppointmentStatus(action);
    a.statusReason = r || undefined;
    a.updatedAt = new Date().toISOString();
    this.apptEvent(a, from, r);
    this.commit();
    return clone(a);
  }

  async listParts() {
    return clone(this.state.parts);
  }

  async createPartsRequest(input: NewPartsInput) {
    if (input.customerName.trim().length < 2) throw new Error('Indicá para quién es el pedido.');
    if (input.description.trim().length < 2) throw new Error('Describí el repuesto o accesorio.');
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) throw new Error('La cantidad tiene que estar entre 1 y 999.');
    if (input.appointmentId && !this.state.appointments.some((a) => a.id === input.appointmentId && a.organizationId === input.organizationId)) throw new Error('El turno no pertenece a la organización');
    const now = new Date().toISOString();
    const p: PartsRequest = { id: uid(), ...input, customerName: input.customerName.trim(), description: input.description.trim(), partNumber: input.partNumber?.trim() || undefined, notes: input.notes?.trim() || undefined, currency: 'ARS', status: 'requested', createdAt: now, updatedAt: now };
    this.state.parts.unshift(p);
    this.commit();
    return clone(p);
  }

  async transitionParts(id: string, action: PartsAction, step: PartsStepInput) {
    const p = this.state.parts.find((x) => x.id === id);
    if (!p) throw new Error('Pedido inexistente');
    if (!partsActions(p).includes(action)) throw new Error('Ese paso no corresponde al estado actual del pedido');
    const err = validatePartsStep(action, step, this.today);
    if (err) throw new Error(err);
    p.status = nextPartsStatus(action);
    if (step.unitPrice !== undefined) p.unitPrice = step.unitPrice;
    if (action === 'order' && step.eta) p.eta = step.eta;
    if (action === 'cancel') p.statusReason = step.reason!.trim();
    p.updatedAt = new Date().toISOString();
    this.commit();
    return clone(p);
  }

  async listKnowledge() {
    return clone(this.state.knowledge);
  }

  async createKnowledgeDraft(input: NewKnowledgeInput) {
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(input.articleKey)) throw new Error('La clave del artículo usa minúsculas, números y guiones.');
    if (input.title.trim().length < 3) throw new Error('El título es muy corto.');
    if (input.body.trim().length < 10) throw new Error('El contenido es muy corto.');
    if (input.validTo && input.validTo < input.validFrom) throw new Error('La vigencia termina antes de empezar.');
    const a: KnowledgeArticle = {
      id: uid(),
      ...input,
      title: input.title.trim(),
      body: input.body.trim(),
      model: input.model?.trim() || undefined,
      version: nextArticleVersion(this.state.knowledge.filter((k) => k.organizationId === input.organizationId), input.articleKey),
      status: 'draft',
      createdBy: DEMO_USER_ID,
      createdByName: 'Usuario demo',
      createdAt: new Date().toISOString(),
    };
    this.state.knowledge.push(a);
    this.commit();
    return clone(a);
  }

  async updateKnowledgeDraft(id: string, patch: Pick<KnowledgeArticle, 'title' | 'body' | 'validFrom' | 'validTo'>) {
    const a = this.state.knowledge.find((k) => k.id === id);
    if (!a) throw new Error('Artículo inexistente');
    if (a.status !== 'draft' || a.createdBy !== DEMO_USER_ID) throw new Error('Solo el autor edita su borrador');
    if (patch.title.trim().length < 3 || patch.body.trim().length < 10) throw new Error('Completá título y contenido.');
    if (patch.validTo && patch.validTo < patch.validFrom) throw new Error('La vigencia termina antes de empezar.');
    Object.assign(a, { ...patch, title: patch.title.trim(), body: patch.body.trim() });
    this.commit();
    return clone(a);
  }

  /** Estados y "nadie aprueba lo que escribió" como knowledge_transition(); el rol lo valida AppContext. */
  async transitionKnowledge(id: string, action: KnowledgeAction, note?: string) {
    const a = this.state.knowledge.find((k) => k.id === id);
    if (!a) throw new Error('Artículo inexistente');
    const n = note?.trim() || undefined;
    if (action === 'submit') {
      if (a.status !== 'draft') throw new Error('Solo un borrador se envía a revisión');
      a.reviewNote = undefined;
    } else if (action === 'approve' || action === 'reject') {
      if (a.status !== 'in_review') throw new Error('Solo se decide sobre un artículo en revisión');
      if (a.createdBy === DEMO_USER_ID) throw new Error('Nadie aprueba lo que escribió');
      if (action === 'reject' && !n) throw new Error('Explicá qué hay que cambiar');
      if (action === 'approve') {
        for (const o of this.state.knowledge) if (o.organizationId === a.organizationId && o.articleKey === a.articleKey && o.status === 'published') o.status = 'archived';
        a.approvedByName = 'Usuario demo';
        a.approvedAt = new Date().toISOString();
      }
      a.reviewNote = n;
    } else if (a.status !== 'published') throw new Error('Solo se archiva un artículo publicado');
    a.status = nextKnowledgeStatus(action);
    this.commit();
    return clone(a);
  }

  async listConsents() {
    return clone(this.state.consents);
  }

  async recordConsent(input: NewConsentInput) {
    const lead = this.state.leads.find((l) => l.id === input.leadId && l.organizationId === input.organizationId);
    if (!lead) throw new Error('El lead no pertenece a la organización');
    if (input.source.trim().length < 2) throw new Error('Indicá cómo se obtuvo (formulario, verbal, firma…).');
    const e: ConsentEvent = { id: uid(), ...input, source: input.source.trim(), evidence: input.evidence?.trim() || undefined, actorName: 'Usuario demo', createdAt: new Date().toISOString() };
    this.state.consents.push(e);
    this.log(lead, 'consent', `Consentimiento ${e.granted ? 'otorgado' : 'revocado'} para ${CHANNEL_LABEL[e.channel]} (${e.source})`);
    this.commit();
    return clone(e);
  }

  async listMessages() {
    return clone(this.state.messages);
  }

  async logMessage(input: NewMessageInput) {
    const lead = this.state.leads.find((l) => l.id === input.leadId && l.organizationId === input.organizationId);
    if (!lead) throw new Error('El lead no pertenece a la organización');
    const body = input.body.trim();
    if (!body || body.length > 4000) throw new Error('El mensaje no puede quedar vacío ni superar 4.000 caracteres.');
    const when = new Date(input.occurredAt);
    if (!Number.isFinite(when.getTime())) throw new Error('Fecha inválida');
    if (when.getTime() > Date.now() + 5 * 60_000) throw new Error('El mensaje no puede ser futuro');
    if (input.direction === 'out') {
      const chk = outboundCheck(input.channel, input.leadId, this.state.consents, this.state.messages, when);
      if (!chk.ok) throw new Error(chk.reason);
    }
    const m: ConversationMessage = { id: uid(), ...input, body, occurredAt: when.toISOString(), loggedByName: 'Usuario demo', createdAt: new Date().toISOString() };
    this.state.messages.push(m);
    this.log(lead, 'message', `Mensaje ${m.direction === 'in' ? 'recibido' : 'enviado'} por ${CHANNEL_LABEL[m.channel]} (registro manual)`);
    this.commit();
    return clone(m);
  }

  async resetDemo() {
    this.state = this.fresh();
    this.commit();
  }
}
