import type { ImportPreview } from '../domain/leadImport';
import type { Advisor, Campaign, CampaignMetricsDaily, Lead, LeadStatus, OrganizationId, Role } from '../domain/types';

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

export interface Session {
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
  resetDemo?(): Promise<void>;
}
