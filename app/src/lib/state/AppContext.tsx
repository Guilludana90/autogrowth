'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_MODE, getRepository } from '../data';
import type { ImportJob, LeadPatch, NewLeadInput, Repository, Session } from '../data/repository';
import type { ImportPreview } from '../domain/leadImport';
import { can, type Action } from '../domain/permissions';
import type { Advisor, Campaign, CampaignMetricsDaily, Lead, OrganizationId, Role } from '../domain/types';
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
  /** Rol elegido en el selector de la demo (solo DEMO_MODE). */
  demoRole: Role;
  setDemoRole: (r: Role) => void;
  roleFor: (org: OrganizationId) => Role | undefined;
  /** Permiso para una acción en una org; con 'all' exige el permiso en alguna org visible. */
  allowed: (action: Action, org: OrganizationId | 'all') => boolean;
  createLead: (input: NewLeadInput) => Promise<Lead>;
  updateLead: (id: string, patch: LeadPatch) => Promise<Lead>;
  applyImport: (p: ImportPreview, fileName: string) => Promise<ImportJob>;
  rollbackImport: (jobId: string) => Promise<void>;
  resetDemo: () => Promise<void>;
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
  const [demoRole, setDemoRoleState] = useState<Role>('super_admin');
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
      const [l, a, c, m, i] = await Promise.all([r.listLeads(), r.listAdvisors(), r.listCampaigns(), r.listMetrics(), r.listImportJobs()]);
      setSession(s);
      setLeads(l);
      setAdvisors(a);
      setCampaigns(c);
      setMetrics(m);
      setImports(i);
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

  const roleFor = useCallback(
    (org: OrganizationId) => (DEMO_MODE ? demoRole : session?.roles[org]),
    [demoRole, session],
  );

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

  const guard = <T,>(fn: (r: Repository) => Promise<T>) => {
    if (!repo) return Promise.reject(new Error('Datos no disponibles'));
    return fn(repo);
  };

  const value: AppState = {
    demo: DEMO_MODE,
    status,
    error,
    session,
    leads,
    advisors,
    campaigns,
    metrics,
    imports,
    demoRole,
    setDemoRole,
    roleFor,
    allowed,
    toasts,
    notify,
    createLead: (input) =>
      guard(async (r) => {
        if (!allowed('lead:write', input.organizationId)) throw new Error('Tu rol no puede crear leads');
        const lead = await r.createLead(input);
        setLeads((ls) => [lead, ...ls]);
        return lead;
      }),
    updateLead: (id, patch) =>
      guard(async (r) => {
        const current = leads.find((l) => l.id === id);
        if (!current) throw new Error('Lead inexistente');
        const action: Action = patch.advisorId !== undefined ? 'lead:assign' : 'lead:write';
        if (!allowed(action, current.organizationId)) throw new Error('Tu rol no puede modificar este lead');
        const lead = await r.updateLead(id, patch);
        setLeads((ls) => ls.map((l) => (l.id === id ? lead : l)));
        return lead;
      }),
    applyImport: (p, fileName) =>
      guard(async (r) => {
        const job = await r.applyImport(p, fileName);
        setLeads(await r.listLeads());
        setImports(await r.listImportJobs());
        return job;
      }),
    rollbackImport: (jobId) =>
      guard(async (r) => {
        await r.rollbackImport(jobId);
        setLeads(await r.listLeads());
        setImports(await r.listImportJobs());
      }),
    resetDemo: () =>
      guard(async (r) => {
        await r.resetDemo?.();
        await load(r);
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
export function useScoped(org: OrganizationId | 'all') {
  const app = useApp();
  return useMemo(() => {
    const visible = (o: OrganizationId) =>
      (org === 'all' || o === org) && (app.demo || app.session?.roles[o] !== undefined);
    return {
      leads: app.leads.filter((l) => visible(l.organizationId)),
      campaigns: app.campaigns.filter((c) => visible(c.organizationId)),
      metrics: app.metrics.filter((m) => visible(m.organizationId)),
      advisors: app.advisors.filter((a) => visible(a.organizationId)),
    };
  }, [app.advisors, app.campaigns, app.demo, app.leads, app.metrics, app.session, org]);
}
