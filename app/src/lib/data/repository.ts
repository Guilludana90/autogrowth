import type { ImportPreview } from '../domain/leadImport';
import type { MetricImportPreview } from '../domain/metricImport';
import type { QuoteAction } from '../domain/quotes';
import type { CampaignRecommendation } from '../domain/recommendations';
import type { AppointmentAction, KnowledgeAction, PartsAction } from '../domain/postventa';
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
  Platform,
  PriceDocCategory,
  PromptAction,
  PromptEvent,
  PromptVersion,
  AnalyzerName,
  AppointmentEvent,
  Channel,
  ConsentChannel,
  ConsentEvent,
  ConversationMessage,
  KnowledgeArticle,
  KnowledgeCategory,
  PartsRequest,
  ServiceAppointment,
  ServiceType,
  RecommendationFeedback,
  RecommendationRun,
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

export interface NewPromptDraftInput {
  organizationId: OrganizationId;
  name: AnalyzerName;
  version: string;
  promptText: string;
  changeNote?: string;
}

export interface AiStatus {
  enabled: boolean;
  /** Motivo legible cuando está deshabilitada (demo, falta la clave, etc.). */
  reason?: string;
  model?: string;
}

export interface AiAnalysisResult {
  run: RecommendationRun;
  rec: CampaignRecommendation;
}

export interface NewAppointmentInput {
  organizationId: OrganizationId;
  leadId?: string;
  customerName: string;
  phoneE164?: string;
  vehicle: string;
  plate?: string;
  mileage?: number;
  serviceType: ServiceType;
  scheduledAt: string;
  durationMin: number;
  bay: string;
  advisorId?: string;
  notes?: string;
}

export interface NewPartsInput {
  organizationId: OrganizationId;
  kind: PartsRequest['kind'];
  appointmentId?: string;
  leadId?: string;
  customerName: string;
  partNumber?: string;
  description: string;
  quantity: number;
  notes?: string;
}

export interface PartsStepInput {
  unitPrice?: number;
  eta?: string;
  reason?: string;
}

export interface NewKnowledgeInput {
  organizationId: OrganizationId;
  articleKey: string;
  title: string;
  body: string;
  language: KnowledgeArticle['language'];
  category: KnowledgeCategory;
  model?: string;
  validFrom: string;
  validTo?: string;
}

export interface NewConsentInput {
  organizationId: OrganizationId;
  leadId: string;
  channel: ConsentChannel;
  granted: boolean;
  source: string;
  evidence?: string;
}

export interface NewMessageInput {
  organizationId: OrganizationId;
  leadId: string;
  channel: Channel;
  direction: ConversationMessage['direction'];
  body: string;
  occurredAt: string;
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
  // P3
  listPromptVersions(): Promise<PromptVersion[]>;
  listPromptEvents(): Promise<PromptEvent[]>;
  createPromptDraft(input: NewPromptDraftInput): Promise<PromptVersion>;
  updatePromptDraft(id: string, promptText: string, changeNote?: string): Promise<PromptVersion>;
  transitionPrompt(id: string, action: PromptAction, reason?: string): Promise<PromptVersion>;
  listRecommendationRuns(): Promise<RecommendationRun[]>;
  /** Guarda una corrida del motor de reglas (las de IA las guarda el servidor). */
  saveRulesRun(organizationId: OrganizationId, platform: Platform, rec: CampaignRecommendation): Promise<RecommendationRun>;
  listFeedback(): Promise<RecommendationFeedback[]>;
  /** Alta o cambio del feedback propio sobre una corrida. */
  submitFeedback(runId: string, useful: boolean, comment?: string): Promise<RecommendationFeedback>;
  aiStatus(): Promise<AiStatus>;
  runAiAnalysis(organizationId: OrganizationId, platform: Platform, campaignId: string, range: DateRange): Promise<AiAnalysisResult>;
  // P4
  listAppointments(): Promise<ServiceAppointment[]>;
  listAppointmentEvents(): Promise<AppointmentEvent[]>;
  createAppointment(input: NewAppointmentInput): Promise<ServiceAppointment>;
  transitionAppointment(id: string, action: AppointmentAction, reason?: string): Promise<ServiceAppointment>;
  listParts(): Promise<PartsRequest[]>;
  createPartsRequest(input: NewPartsInput): Promise<PartsRequest>;
  transitionParts(id: string, action: PartsAction, step: PartsStepInput): Promise<PartsRequest>;
  listKnowledge(): Promise<KnowledgeArticle[]>;
  createKnowledgeDraft(input: NewKnowledgeInput): Promise<KnowledgeArticle>;
  updateKnowledgeDraft(id: string, patch: Pick<KnowledgeArticle, 'title' | 'body' | 'validFrom' | 'validTo'>): Promise<KnowledgeArticle>;
  transitionKnowledge(id: string, action: KnowledgeAction, note?: string): Promise<KnowledgeArticle>;
  listConsents(): Promise<ConsentEvent[]>;
  recordConsent(input: NewConsentInput): Promise<ConsentEvent>;
  listMessages(): Promise<ConversationMessage[]>;
  logMessage(input: NewMessageInput): Promise<ConversationMessage>;
  resetDemo?(): Promise<void>;
}
