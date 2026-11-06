'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_MODE, getRepository } from '../data';
import type {
  AiAnalysisResult,
  AiStatus,
  NewPromptDraftInput,
  ImportJob,
  LeadPatch,
  NewLeadInput,
  NewPriceDocumentInput,
  NewQuoteInput,
  NewTaskInput,
  Repository,
  Session,
  TaskPatch,
} from '../data/repository';
import type { ImportPreview } from '../domain/leadImport';
import type { MetricImportPreview } from '../domain/metricImport';
import { byChannel, leadsByChannel } from '../domain/reconcile';
import { can, grantableRoles, type Action } from '../domain/permissions';
import { canTransition, type QuoteAction } from '../domain/quotes';
import { canPrompt } from '../domain/governance';
import type { CampaignRecommendation } from '../domain/recommendations';
import type {
  Advisor,
  Campaign,
  CampaignMetricsDaily,
  DateRange,
  Integration,
  Lead,
  LeadActivity,
  Member,
  MetricImportJob,
  OrganizationId,
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
import { ROLES } from '../domain/types';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface AppState {
  demo: boolean;
  status: 'loading' | 'ready' | 'error' | 'signed_out';
  error?: string;
  session: Session | null;
  leads: Lead[];
  advisors: Advisor[];
  campaigns: Campaign[];
  metrics: CampaignMetricsDaily[];
  imports: ImportJob[];
  tasks: Task[];
  quotes: Quote[];
  priceDocs: PriceDocument[];
  members: Member[];
  metricJobs: MetricImportJob[];
  integrations: Integration[];
  prompts: PromptVersion[];
  promptEvents: PromptEvent[];
  runs: RecommendationRun[];
  feedback: RecommendationFeedback[];
  ai: AiStatus;
  /** Rol elegido en el selector de la demo (solo DEMO_MODE). */
  demoRole: Role;
  setDemoRole: (r: Role) => void;
  roleFor: (org: OrganizationId) => Role | undefined;
  /** Permiso para una acción en una org; con 'all' exige el permiso en alguna org visible. */
  allowed: (action: Action, org: OrganizationId | 'all') => boolean;
  canQuote: (q: Quote, action: QuoteAction) => boolean;
  canPromptAction: (v: PromptVersion, action: PromptAction) => boolean;
  createPromptDraft: (input: NewPromptDraftInput) => Promise<PromptVersion>;
  updatePromptDraft: (v: PromptVersion, text: string, note?: string) => Promise<PromptVersion>;
  transitionPrompt: (v: PromptVersion, action: PromptAction, reason?: string) => Promise<PromptVersion>;
  /** Corrida guardada para esta recomendación (la crea si hace falta, p. ej. para dejar feedback). */
  ensureRun: (org: OrganizationId, platform: Platform, rec: CampaignRecommendation, existing?: RecommendationRun) => Promise<RecommendationRun>;
  submitFeedback: (run: RecommendationRun, useful: boolean, comment?: string) => Promise<RecommendationFeedback>;
  runAiAnalysis: (org: OrganizationId, platform: Platform, campaignId: string, range: DateRange) => Promise<AiAnalysisResult>;
  createLead: (input: NewLeadInput) => Promise<Lead>;
  updateLead: (id: string, patch: LeadPatch) => Promise<Lead>;
  applyImport: (p: ImportPreview, fileName: string) => Promise<ImportJob>;
  rollbackImport: (jobId: string) => Promise<void>;
  listActivities: (leadId: string) => Promise<LeadActivity[]>;
  addNote: (lead: Lead, body: string) => Promise<LeadActivity>;
  createTask: (input: NewTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: TaskPatch) => Promise<Task>;
  createQuote: (input: NewQuoteInput) => Promise<Quote>;
  transitionQuote: (q: Quote, action: QuoteAction, reason?: string) => Promise<Quote>;
  createPriceDocument: (input: NewPriceDocumentInput) => Promise<PriceDocument>;
  activatePriceDocument: (d: PriceDocument) => Promise<PriceDocument>;
  addMember: (org: OrganizationId, email: string, role: Role) => Promise<Member>;
  removeMember: (m: Member) => Promise<void>;
  applyMetricImport: (p: MetricImportPreview, fileName: string) => Promise<MetricImportJob>;
  rollbackMetricImport: (job: MetricImportJob) => Promise<void>;
  connectMeta: (org: OrganizationId, adAccountId: string) => Promise<string>;
  syncMeta: (org: OrganizationId, range: DateRange) => Promise<{ jobId: string | null; rows: number; skipped: number }>;
  disconnectIntegration: (i: Integration) => Promise<void>;
  resetDemo: () => Promise<void>;
  /** Cambia cada vez que el historial de algún lead puede haber cambiado. */
  activityVersion: number;
  toasts: Toast[];
  notify: (text: string, kind?: Toast['kind']) => void;
}

const Ctx = createContext<AppState | null>(null);

const ROLE_KEY = 'autogrowth:demo:role';

export function AppProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [status, setStatus] = useState<AppState['status']>('loading');
  const [error, setError] = useState<string>();
  const [session, setSession] = useState<Session | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetricsDaily[]>([]);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [priceDocs, setPriceDocs] = useState<PriceDocument[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [metricJobs, setMetricJobs] = useState<MetricImportJob[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [promptEvents, setPromptEvents] = useState<PromptEvent[]>([]);
  const [runs, setRuns] = useState<RecommendationRun[]>([]);
  const [feedback, setFeedback] = useState<RecommendationFeedback[]>([]);
  const [ai, setAi] = useState<AiStatus>({ enabled: false, reason: 'Consultando…' });
  const [demoRole, setDemoRoleState] = useState<Role>('super_admin');
  const [activityVersion, setActivityVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const load = useCallback(async (r: Repository) => {
    setStatus('loading');
    try {
      const s = await r.getSession();
      if (!s) {
        setSession(null);
        setStatus('signed_out');
        return;
      }
      const isAdminSomewhere = DEMO_MODE || Object.values(s.roles).some((x) => x === 'super_admin' || x === 'dealership_admin');
      const [l, a, c, m, i, t, q, d, mem, mj, integ, pv, pe, rr, fb, st] = await Promise.all([
        r.listLeads(),
        r.listAdvisors(),
        r.listCampaigns(),
        r.listMetrics(),
        r.listImportJobs(),
        r.listTasks(),
        r.listQuotes(),
        r.listPriceDocuments(),
        isAdminSomewhere ? r.listMembers() : Promise.resolve([]),
        isAdminSomewhere ? r.listMetricImports() : Promise.resolve([]),
        isAdminSomewhere ? r.listIntegrations() : Promise.resolve([]),
        r.listPromptVersions(),
        r.listPromptEvents(),
        r.listRecommendationRuns(),
        r.listFeedback(),
        r.aiStatus().catch((e: unknown) => ({ enabled: false, reason: e instanceof Error ? e.message : String(e) })),
      ]);
      setPrompts(pv);
      setPromptEvents(pe);
      setRuns(rr);
      setFeedback(fb);
      setAi(st);
      setMetricJobs(mj);
      setIntegrations(integ);
      setSession(s);
      setLeads(l);
      setAdvisors(a);
      setCampaigns(c);
      setMetrics(m);
      setImports(i);
      setTasks(t);
      setQuotes(q);
      setPriceDocs(d);
      setMembers(mem);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROLE_KEY);
      if (saved && (ROLES as readonly string[]).includes(saved)) setDemoRoleState(saved as Role);
    } catch {
      /* sin storage: queda Super Admin */
    }
    try {
      const r = getRepository();
      setRepo(r);
      void load(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [load]);

  const setDemoRole = useCallback((r: Role) => {
    setDemoRoleState(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  }, []);

  const roleFor = useCallback((org: OrganizationId) => (DEMO_MODE ? demoRole : session?.roles[org]), [demoRole, session]);

  const allowed = useCallback(
    (action: Action, org: OrganizationId | 'all') => {
      if (org !== 'all') {
        const r = roleFor(org);
        return r ? can(r, action) : false;
      }
      if (DEMO_MODE) return can(demoRole, action);
      return Object.values(session?.roles ?? {}).some((r) => r && can(r, action));
    },
    [demoRole, roleFor, session],
  );

  const canQuote = useCallback(
    (q: Quote, action: QuoteAction) => {
      const role = roleFor(q.organizationId);
      if (!role) return false;
      // En la demo, el usuario actúa como autor de lo que creó y como gerencia del resto.
      const isAuthor = q.createdBy === session?.userId;
      return canTransition(action, q.status, role, isAuthor);
    },
    [roleFor, session],
  );

  const canPromptAction = useCallback(
    (v: PromptVersion, action: PromptAction) => canPrompt(action, v.status, roleFor(v.organizationId), v.createdBy === session?.userId),
    [roleFor, session],
  );

  const guard = <T,>(fn: (r: Repository) => Promise<T>) => {
    if (!repo) return Promise.reject(new Error('Datos no disponibles'));
    return fn(repo);
  };
  const deny = (msg: string) => Promise.reject(new Error(msg));
  const bump = () => setActivityVersion((v) => v + 1);
  const refreshCampaignData = async (r: Repository) => {
    const [c, m, mj, integ] = await Promise.all([r.listCampaigns(), r.listMetrics(), r.listMetricImports(), r.listIntegrations()]);
    setCampaigns(c);
    setMetrics(m);
    setMetricJobs(mj);
    setIntegrations(integ);
  };

  const refreshPrompts = async (r: Repository) => {
    const [pv, pe] = await Promise.all([r.listPromptVersions(), r.listPromptEvents()]);
    setPrompts(pv);
    setPromptEvents(pe);
  };

  const value: AppState = {
    prompts,
    promptEvents,
    runs,
    feedback,
    ai,
    canPromptAction,
    createPromptDraft: (input) =>
      allowed('prompt:draft', input.organizationId)
        ? guard(async (r) => {
            const v = await r.createPromptDraft(input);
            await refreshPrompts(r);
            return v;
          })
        : deny('Solo Super Admin o Gerente crean borradores de prompt'),
    updatePromptDraft: (v, text, note) =>
      v.status === 'draft' && v.createdBy === session?.userId
        ? guard(async (r) => {
            const next = await r.updatePromptDraft(v.id, text, note);
            await refreshPrompts(r);
            return next;
          })
        : deny('Solo el autor edita su borrador'),
    transitionPrompt: (v, action, reason) =>
      canPromptAction(v, action)
        ? guard(async (r) => {
            const next = await r.transitionPrompt(v.id, action, reason);
            await refreshPrompts(r);
            return next;
          })
        : deny(action === 'submit' ? 'Solo el autor envía su borrador a revisión' : 'Solo Super Admin aprueba, rechaza, publica o vuelve atrás'),
    ensureRun: (org, platform, rec, existing) => {
      if (existing) return Promise.resolve(existing);
      if (!allowed('recommendation:run', org)) return deny('Tu rol no puede guardar diagnósticos');
      return guard(async (r) => {
        const run = await r.saveRulesRun(org, platform, rec);
        setRuns((rs) => [run, ...rs]);
        return run;
      });
    },
    submitFeedback: (run, useful, comment) =>
      allowed('recommendation:feedback', run.organizationId)
        ? guard(async (r) => {
            const f = await r.submitFeedback(run.id, useful, comment);
            setFeedback(await r.listFeedback());
            return f;
          })
        : deny('Tu rol no puede calificar recomendaciones'),
    runAiAnalysis: (org, platform, campaignId, range) =>
      !allowed('recommendation:run', org)
        ? deny('Tu rol no puede ejecutar análisis')
        : !ai.enabled
          ? deny(ai.reason ?? 'La IA está deshabilitada')
          : guard(async (r) => {
              const res = await r.runAiAnalysis(org, platform, campaignId, range);
              setRuns((rs) => [res.run, ...rs]);
              return res;
            }),
    demo: DEMO_MODE,
    status,
    error,
    session,
    leads,
    advisors,
    campaigns,
    metrics,
    imports,
    tasks,
    quotes,
    priceDocs,
    members,
    metricJobs,
    integrations,
    demoRole,
    setDemoRole,
    roleFor,
    allowed,
    canQuote,
    activityVersion,
    toasts,
    notify,
    createLead: (input) =>
      allowed('lead:write', input.organizationId)
        ? guard(async (r) => {
            const lead = await r.createLead(input);
            setLeads((ls) => [lead, ...ls]);
            bump();
            return lead;
          })
        : deny('Tu rol no puede crear leads'),
    updateLead: (id, patch) =>
      guard(async (r) => {
        const current = leads.find((l) => l.id === id);
        if (!current) throw new Error('Lead inexistente');
        const action: Action = patch.advisorId !== undefined ? 'lead:assign' : 'lead:write';
        if (!allowed(action, current.organizationId)) throw new Error('Tu rol no puede modificar este lead');
        const lead = await r.updateLead(id, patch);
        setLeads((ls) => ls.map((l) => (l.id === id ? lead : l)));
        bump();
        return lead;
      }),
    applyImport: (p, fileName) =>
      guard(async (r) => {
        const job = await r.applyImport(p, fileName);
        setLeads(await r.listLeads());
        setImports(await r.listImportJobs());
        bump();
        return job;
      }),
    rollbackImport: (jobId) =>
      guard(async (r) => {
        await r.rollbackImport(jobId);
        setLeads(await r.listLeads());
        setImports(await r.listImportJobs());
        bump();
      }),
    listActivities: (leadId) => guard((r) => r.listActivities(leadId)),
    addNote: (lead, body) =>
      allowed('note:write', lead.organizationId)
        ? guard(async (r) => {
            const a = await r.addNote(lead.id, body);
            bump();
            return a;
          })
        : deny('Tu rol no puede agregar notas'),
    createTask: (input) =>
      allowed('task:write', input.organizationId)
        ? guard(async (r) => {
            const t = await r.createTask(input);
            setTasks(await r.listTasks());
            bump();
            return t;
          })
        : deny('Tu rol no puede crear tareas'),
    updateTask: (id, patch) =>
      guard(async (r) => {
        const current = tasks.find((t) => t.id === id);
        if (!current || !allowed('task:write', current.organizationId)) throw new Error('Tu rol no puede modificar tareas');
        const t = await r.updateTask(id, patch);
        setTasks((ts) => ts.map((x) => (x.id === id ? t : x)));
        bump();
        return t;
      }),
    createQuote: (input) =>
      allowed('quote:write', input.organizationId)
        ? guard(async (r) => {
            const q = await r.createQuote(input);
            setQuotes((qs) => [q, ...qs]);
            return q;
          })
        : deny('Tu rol no puede crear cotizaciones'),
    transitionQuote: (q, action, reason) =>
      canQuote(q, action)
        ? guard(async (r) => {
            const next = await r.transitionQuote(q.id, action, reason);
            setQuotes((qs) => qs.map((x) => (x.id === q.id ? next : x)));
            bump();
            return next;
          })
        : deny('Tu rol no puede realizar esta acción sobre la cotización'),
    createPriceDocument: (input) =>
      allowed('pricedoc:manage', input.organizationId)
        ? guard(async (r) => {
            const d = await r.createPriceDocument(input);
            setPriceDocs(await r.listPriceDocuments());
            return d;
          })
        : deny('Solo administradores cargan documentos'),
    activatePriceDocument: (d) =>
      allowed('pricedoc:manage', d.organizationId)
        ? guard(async (r) => {
            const next = await r.activatePriceDocument(d.id);
            setPriceDocs(await r.listPriceDocuments());
            return next;
          })
        : deny('Solo administradores activan documentos'),
    addMember: (org, email, role) => {
      const mine = roleFor(org);
      if (!mine || !grantableRoles(mine).includes(role)) return deny('No podés otorgar ese rol');
      return guard(async (r) => {
        const m = await r.addMember(org, email, role);
        setMembers(await r.listMembers());
        setAdvisors(await r.listAdvisors());
        return m;
      });
    },
    removeMember: (m) =>
      roleFor(m.organizationId) === 'super_admin' || (roleFor(m.organizationId) === 'dealership_admin' && grantableRoles('dealership_admin').includes(m.role))
        ? guard(async (r) => {
            await r.removeMember(m.organizationId, m.userId);
            setMembers(await r.listMembers());
            setAdvisors(await r.listAdvisors());
            setLeads(await r.listLeads());
            setTasks(await r.listTasks());
          })
        : deny('No podés quitar a este usuario'),
    applyMetricImport: (p, fileName) =>
      allowed('campaign:import', p.organizationId)
        ? guard(async (r) => {
            const job = await r.applyMetricImport(p, fileName);
            await refreshCampaignData(r);
            return job;
          })
        : deny('Solo Super Admin o Gerente importan métricas'),
    rollbackMetricImport: (job) =>
      allowed('campaign:import', job.organizationId)
        ? guard(async (r) => {
            await r.rollbackMetricImport(job.id);
            await refreshCampaignData(r);
          })
        : deny('Solo Super Admin o Gerente revierten lotes'),
    connectMeta: (org, adAccountId) =>
      allowed('integration:manage', org) ? guard((r) => r.connectMeta(org, adAccountId)) : deny('Solo Super Admin o Gerente conectan integraciones'),
    syncMeta: (org, range) =>
      allowed('integration:manage', org)
        ? guard(async (r) => {
            const res = await r.syncMeta(org, range);
            await refreshCampaignData(r);
            return res;
          })
        : deny('Solo Super Admin o Gerente sincronizan'),
    disconnectIntegration: (i) =>
      allowed('integration:manage', i.organizationId)
        ? guard(async (r) => {
            await r.disconnectIntegration(i.organizationId, i.provider);
            setIntegrations(await r.listIntegrations());
          })
        : deny('Solo Super Admin o Gerente desconectan integraciones'),
    resetDemo: () =>
      guard(async (r) => {
        await r.resetDemo?.();
        await load(r);
        bump();
      }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera de AppProvider');
  return v;
}

/** Datos ya filtrados por organización (tenant) para la vista actual. */
/** Con `channel`, campañas, métricas y leads se limitan a esa plataforma (los leads sin campaña quedan fuera). */
export function useScoped(org: OrganizationId | 'all', channel: Platform | 'all' = 'all') {
  const app = useApp();
  return useMemo(() => {
    const visible = (o: OrganizationId) => (org === 'all' || o === org) && (app.demo || app.session?.roles[o] !== undefined);
    const campaigns = app.campaigns.filter((c) => visible(c.organizationId));
    return {
      leads: leadsByChannel(app.leads.filter((l) => visible(l.organizationId)), campaigns, channel),
      campaigns: byChannel(campaigns, channel),
      metrics: byChannel(app.metrics.filter((m) => visible(m.organizationId)), channel),
      metricJobs: app.metricJobs.filter((j) => visible(j.organizationId)),
      integrations: app.integrations.filter((i) => visible(i.organizationId)),
      advisors: app.advisors.filter((a) => visible(a.organizationId)),
      tasks: app.tasks.filter((t) => visible(t.organizationId)),
      quotes: app.quotes.filter((q) => visible(q.organizationId)),
      priceDocs: app.priceDocs.filter((d) => visible(d.organizationId)),
      members: app.members.filter((m) => visible(m.organizationId)),
      prompts: app.prompts.filter((p) => visible(p.organizationId)),
      runs: app.runs.filter((r) => visible(r.organizationId)),
      feedback: app.feedback.filter((f) => visible(f.organizationId)),
    };
  }, [app.prompts, app.runs, app.feedback, app.advisors, app.campaigns, app.demo, app.integrations, app.leads, app.members, app.metricJobs, app.metrics, app.priceDocs, app.quotes, app.session, app.tasks, channel, org]);
}
