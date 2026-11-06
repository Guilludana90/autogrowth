import type { ImportPreview } from '../domain/leadImport';
import type { MetricImportPreview } from '../domain/metricImport';
import type { QuoteAction } from '../domain/quotes';
import type {
  Advisor,
  Campaign,
  DateRange,
  Integration,
  MetricImportJob,
  CampaignMetricsDaily,
  Lead,
  LeadActivity,
  LeadStatus,
  Member,
  OrganizationId,
  PriceDocCategory,
  PriceDocument,
  PriceRow,
  Quote,
  QuoteKind,
  Role,
  Task,
  TaskPriority,
  TaskStatus,
} from '../domain/types';

export interface NewLeadInput {
  organizationId: OrganizationId;
  name: string;
  phoneE164?: string;
  email?: string;
  source: string;
  modelInterest?: string;
  campaignId?: string;
}

export interface LeadPatch {
  status?: LeadStatus;
  lostReason?: string | null;
  advisorId?: string | null;
}

export interface ImportJob {
  id: string;
  fileName: string;
  createdAt: string;
  counts: ImportPreview['counts'];
  createdLeadIds: string[];
  /** Valores anteriores de los leads actualizados, para poder revertir el lote. */
  previous: Record<string, Partial<Lead>>;
  rolledBack: boolean;
}

export interface NewTaskInput {
  organizationId: OrganizationId;
  leadId?: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  dueAt?: string;
  assigneeId?: string;
}

export interface TaskPatch {
  status?: TaskStatus;
  assigneeId?: string | null;
  dueAt?: string | null;
  priority?: TaskPriority;
}

export interface NewQuoteInput {
  organizationId: OrganizationId;
  leadId?: string;
  kind: QuoteKind;
  vehicle: string;
  input: Record<string, number | string>;
  result: Record<string, number | undefined>;
  priceDocumentId?: string;
}

export interface NewPriceDocumentInput {
  organizationId: OrganizationId;
  category: PriceDocCategory;
  title: string;
  fileName: string;
  validFrom: string;
  validTo?: string;
  rows: PriceRow[];
}

export interface Session {
  userId: string;
  userName: string;
  /** Rol por organización. En demo se elige desde el header. */
  roles: Partial<Record<OrganizationId, Role>>;
}

export interface Repository {
  readonly mode: 'demo' | 'supabase';
  getSession(): Promise<Session | null>;
  listLeads(): Promise<Lead[]>;
  createLead(input: NewLeadInput): Promise<Lead>;
  updateLead(id: string, patch: LeadPatch): Promise<Lead>;
  applyImport(preview: ImportPreview, fileName: string): Promise<ImportJob>;
  rollbackImport(jobId: string): Promise<void>;
  listImportJobs(): Promise<ImportJob[]>;
  listAdvisors(): Promise<Advisor[]>;
  listCampaigns(): Promise<Campaign[]>;
  listMetrics(): Promise<CampaignMetricsDaily[]>;
  // P1
  listActivities(leadId: string): Promise<LeadActivity[]>;
  addNote(leadId: string, body: string): Promise<LeadActivity>;
  listTasks(): Promise<Task[]>;
  createTask(input: NewTaskInput): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  listQuotes(): Promise<Quote[]>;
  createQuote(input: NewQuoteInput): Promise<Quote>;
  transitionQuote(id: string, action: QuoteAction, reason?: string): Promise<Quote>;
  listPriceDocuments(): Promise<PriceDocument[]>;
  createPriceDocument(input: NewPriceDocumentInput): Promise<PriceDocument>;
  activatePriceDocument(id: string): Promise<PriceDocument>;
  listMembers(): Promise<Member[]>;
  addMember(organizationId: OrganizationId, email: string, role: Role): Promise<Member>;
  removeMember(organizationId: OrganizationId, userId: string): Promise<void>;
  // P2
  listMetricImports(): Promise<MetricImportJob[]>;
  applyMetricImport(preview: MetricImportPreview, fileName: string): Promise<MetricImportJob>;
  rollbackMetricImport(jobId: string): Promise<void>;
  listIntegrations(): Promise<Integration[]>;
  /** Devuelve la URL del diálogo OAuth de Meta (la arma el servidor). */
  connectMeta(organizationId: OrganizationId, adAccountId: string): Promise<string>;
  syncMeta(organizationId: OrganizationId, range: DateRange): Promise<{ jobId: string | null; rows: number; skipped: number }>;
  disconnectIntegration(organizationId: OrganizationId, provider: Integration['provider']): Promise<void>;
  resetDemo?(): Promise<void>;
}
