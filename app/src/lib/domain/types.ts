export const ORGANIZATIONS = [
  { id: 'cardys_fiat', name: 'Cardys · FIAT', brands: ['FIAT'] },
  { id: 'overland_motors', name: 'Overland Motors · Jeep/RAM', brands: ['Jeep', 'RAM'] },
] as const;

export type OrganizationId = (typeof ORGANIZATIONS)[number]['id'];
export type OrgFilter = OrganizationId | 'all';

export const ROLES = ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales', 'read_only'] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'negotiation', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PLATFORMS = ['meta', 'google', 'tiktok', 'linkedin'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface Advisor {
  id: string;
  name: string;
  organizationId: OrganizationId;
}

export interface Lead {
  id: string;
  organizationId: OrganizationId;
  name: string;
  phoneE164?: string;
  email?: string;
  source: string;
  campaignId?: string;
  modelInterest?: string;
  score?: number;
  scoreReason?: string;
  status: LeadStatus;
  lostReason?: string;
  advisorId?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Campaign {
  id: string; // external campaign id
  organizationId: OrganizationId;
  platform: Platform;
  name: string;
  objective: string;
  status: 'active' | 'paused';
  currency: string;
}

/** Una fila por campaña y día, igual que public.campaign_metrics_daily. */
export interface CampaignMetricsDaily {
  organizationId: OrganizationId;
  platform: Platform;
  campaignId: string;
  date: string; // YYYY-MM-DD
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  platformLeads: number;
}

export interface DateRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  negotiation: 'Negociación',
  won: 'Ganado',
  lost: 'Perdido',
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  dealership_admin: 'Dealership Admin',
  sales_advisor: 'Sales Advisor',
  post_sales: 'Postventa & Repuestos',
  read_only: 'Solo lectura',
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
};

export function orgName(id: OrganizationId): string {
  return ORGANIZATIONS.find((o) => o.id === id)?.name ?? id;
}

export function isOrganizationId(v: unknown): v is OrganizationId {
  return ORGANIZATIONS.some((o) => o.id === v);
}

// ───────────── P1: operación comercial ─────────────

export const TASK_PRIORITIES = ['high', 'normal', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  organizationId: OrganizationId;
  leadId?: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt?: string; // ISO
  assigneeId?: string;
  createdAt: string;
  completedAt?: string;
}

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'Alta', normal: 'Normal', low: 'Baja' };
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { pending: 'Pendiente', in_progress: 'En curso', done: 'Completada' };

export type ActivityKind = 'created' | 'status' | 'assigned' | 'note' | 'task' | 'quote' | 'import';
export interface LeadActivity {
  id: string;
  organizationId: OrganizationId;
  leadId: string;
  kind: ActivityKind;
  body: string;
  actorName?: string;
  createdAt: string;
}

export const PRICE_DOC_CATEGORIES = ['price_list', 'savings_plan', 'factory_financing', 'agreement', 'other'] as const;
export type PriceDocCategory = (typeof PRICE_DOC_CATEGORIES)[number];
export const PRICE_DOC_CATEGORY_LABEL: Record<PriceDocCategory, string> = {
  price_list: 'Lista de precios',
  savings_plan: 'Plan de ahorro (PDA)',
  factory_financing: 'Financiación de fábrica',
  agreement: 'Acuerdo / convenio',
  other: 'Otro',
};

export interface PriceRow {
  model: string;
  version: string;
  price: number;
}

export interface PriceDocument {
  id: string;
  organizationId: OrganizationId;
  category: PriceDocCategory;
  title: string;
  fileName: string;
  validFrom: string; // YYYY-MM-DD
  validTo?: string;
  rows: PriceRow[];
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
}

export type QuoteKind = 'used' | 'savings' | 'financing';
export type QuoteStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export const QUOTE_KIND_LABEL: Record<QuoteKind, string> = {
  used: 'Toma de usado',
  savings: 'Plan de ahorro',
  financing: 'Financiación',
};
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

export interface Quote {
  id: string;
  organizationId: OrganizationId;
  number: number;
  leadId?: string;
  kind: QuoteKind;
  vehicle: string;
  input: Record<string, number | string>;
  result: Record<string, number | undefined>;
  priceDocumentId?: string;
  status: QuoteStatus;
  validUntil: string; // YYYY-MM-DD
  createdBy: string;
  createdByName?: string;
  decidedByName?: string;
  decidedAt?: string;
  decidedReason?: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email?: string;
  organizationId: OrganizationId;
  role: Role;
}

// ───────────── P2 ─────────────

export type MetricSource = 'csv' | 'meta_api';

export interface MetricImportJob {
  id: string;
  organizationId: OrganizationId;
  platform: Platform;
  source: MetricSource;
  fileName: string;
  rangeFrom?: string;
  rangeTo?: string;
  counts: { create: number; update: number; unchanged: number; campaigns: number };
  createdAt: string;
  createdByName?: string;
  rolledBack: boolean;
}

export type IntegrationStatus = 'not_connected' | 'connected' | 'error' | 'revoked';

export interface Integration {
  organizationId: OrganizationId;
  provider: Platform;
  status: IntegrationStatus;
  externalAccountId?: string;
  externalAccountName?: string;
  currency?: string;
  lastTestedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, [string, 'green' | 'gold' | 'red' | 'gray']> = {
  not_connected: ['No conectada', 'gray'],
  connected: ['Conectada y probada', 'green'],
  error: ['Error', 'red'],
  revoked: ['Desconectada', 'gray'],
};

// ───────────── P3 ─────────────

export const PROMPT_STATUSES = ['draft', 'in_review', 'approved', 'active', 'rejected', 'rolled_back'] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];
export type PromptAction = 'submit' | 'approve' | 'reject' | 'activate' | 'rollback';

export const PROMPT_STATUS_LABEL: Record<PromptStatus, [string, 'green' | 'gold' | 'red' | 'gray' | 'violet']> = {
  draft: ['Borrador', 'gray'],
  in_review: ['En revisión', 'gold'],
  approved: ['Aprobada', 'violet'],
  active: ['Activa', 'green'],
  rejected: ['Rechazada', 'red'],
  rolled_back: ['Retirada', 'gray'],
};

/** Analizadores gobernados. Cada uno tiene a lo sumo una versión activa por concesionario. */
export const ANALYZERS = { campaign_analyst: 'Analista de campañas' } as const;
export type AnalyzerName = keyof typeof ANALYZERS;

export interface PromptVersion {
  id: string;
  organizationId: OrganizationId;
  name: AnalyzerName;
  version: string;
  promptText: string;
  changeNote?: string;
  status: PromptStatus;
  createdBy: string;
  createdByName?: string;
  approvedByName?: string;
  approvedAt?: string;
  decidedReason?: string;
  submittedAt?: string;
  activatedAt?: string;
  createdAt: string;
}

export interface PromptEvent {
  id: string;
  versionId: string;
  fromStatus?: PromptStatus;
  toStatus: PromptStatus;
  actorName?: string;
  reason?: string;
  createdAt: string;
}

export interface RecommendationRun {
  id: string;
  organizationId: OrganizationId;
  platform: Platform;
  campaignId: string;
  windowFrom: string;
  windowTo: string;
  engine: 'rules' | 'ai';
  version: string;
  promptVersionId?: string;
  priority: 'low' | 'medium' | 'high';
  problemArea: 'media' | 'capture' | 'sales' | 'data' | 'none';
  confidence: number;
  payload: unknown;
  createdAt: string;
}

export interface RecommendationFeedback {
  id: string;
  organizationId: OrganizationId;
  runId: string;
  useful: boolean;
  comment?: string;
  userId: string;
  userName?: string;
  createdAt: string;
}
