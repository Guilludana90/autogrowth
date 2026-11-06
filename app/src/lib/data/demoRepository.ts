import { toDay } from '../domain/dates';
import type { ImportPreview } from '../domain/leadImport';
import { scoreLead } from '../domain/scoring';
import type { Lead } from '../domain/types';
import { DEMO_ADVISORS, DEMO_CAMPAIGNS, demoLeads, demoMetrics } from '../demo/seed';
import type { ImportJob, LeadPatch, NewLeadInput, Repository, Session } from './repository';

const KEY = 'autogrowth:demo:v2';

interface DemoState {
  seededOn: string;
  leads: Lead[];
  imports: ImportJob[];
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

/**
 * Repositorio de DEMO_MODE: datos ficticios en el navegador. No hace ninguna llamada de red.
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
    return { seededOn: this.today, leads: demoLeads(this.today), imports: [] };
  }

  private commit() {
    writeStorage(this.state);
  }

  async getSession(): Promise<Session> {
    return { userName: 'Usuario demo', roles: { cardys_fiat: 'super_admin', overland_motors: 'super_admin' } };
  }

  async listLeads() {
    return structuredClone(this.state.leads);
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
    this.commit();
    return structuredClone(lead);
  }

  async updateLead(id: string, patch: LeadPatch) {
    const lead = this.state.leads.find((l) => l.id === id);
    if (!lead) throw new Error('Lead inexistente');
    if (patch.status === 'lost' && !patch.lostReason?.trim()) throw new Error('Indicá el motivo de pérdida');
    if (patch.status !== undefined) lead.status = patch.status;
    if (patch.status !== undefined && patch.status !== 'lost') delete lead.lostReason;
    if (patch.lostReason) lead.lostReason = patch.lostReason.trim();
    if (patch.advisorId !== undefined) {
      if (patch.advisorId === null) delete lead.advisorId;
      else if (!DEMO_ADVISORS.some((a) => a.id === patch.advisorId && a.organizationId === lead.organizationId)) {
        throw new Error('El asesor no pertenece a este concesionario');
      } else lead.advisorId = patch.advisorId;
    }
    lead.updatedAt = new Date().toISOString();
    this.commit();
    return structuredClone(lead);
  }

  async applyImport(preview: ImportPreview, fileName: string) {
    const job: ImportJob = { id: uid(), fileName, createdAt: new Date().toISOString(), counts: preview.counts, createdLeadIds: [], previous: {}, rolledBack: false };
    for (const o of preview.outcomes) {
      if (o.kind === 'create') {
        this.state.leads.unshift(o.lead);
        job.createdLeadIds.push(o.lead.id);
      } else if (o.kind === 'update') {
        const lead = this.state.leads.find((l) => l.id === o.leadId);
        if (!lead) continue;
        job.previous[lead.id] ??= Object.fromEntries(Object.keys(o.changes).map((k) => [k, lead[k as keyof Lead]]));
        Object.assign(lead, o.changes, { updatedAt: job.createdAt });
      }
    }
    this.state.imports.unshift(job);
    this.commit();
    return structuredClone(job);
  }

  async rollbackImport(jobId: string) {
    const job = this.state.imports.find((j) => j.id === jobId);
    if (!job || job.rolledBack) return;
    const created = new Set(job.createdLeadIds);
    this.state.leads = this.state.leads.filter((l) => !created.has(l.id));
    for (const [id, prev] of Object.entries(job.previous)) {
      const lead = this.state.leads.find((l) => l.id === id);
      if (lead) Object.assign(lead, prev);
    }
    job.rolledBack = true;
    this.commit();
  }

  async listImportJobs() {
    return structuredClone(this.state.imports);
  }

  async listAdvisors() {
    return DEMO_ADVISORS;
  }

  async listCampaigns() {
    return DEMO_CAMPAIGNS;
  }

  async listMetrics() {
    return demoMetrics(this.today);
  }

  async resetDemo() {
    this.state = this.fresh();
    this.commit();
  }
}
