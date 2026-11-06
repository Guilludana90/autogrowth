export type OrganizationId = 'cardys_fiat' | 'overland_motors';
export type Role = 'super_admin' | 'dealership_admin' | 'sales_advisor' | 'post_sales' | 'read_only';
export type LeadStatus = 'new' | 'contacted' | 'negotiation' | 'won' | 'lost';

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
  advisorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMetrics {
  organizationId: OrganizationId;
  platform: 'meta' | 'google' | 'tiktok' | 'linkedin';
  externalCampaignId: string;
  campaignName: string;
  date: string; // YYYY-MM-DD
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  platformLeads: number;
  crmLeads?: number;
  contacted?: number;
  appointments?: number;
  closed?: number;
}

export type AnalysisEngine = 'rules' | 'ai';
export interface CampaignRecommendation {
  campaignId: string;
  organizationId: OrganizationId;
  engine: AnalysisEngine;
  priority: 'low' | 'medium' | 'high';
  diagnosis: string;
  mainIssue: string;
  recommendedAction: string;
  marketingActions: string[];
  salesActions: string[];
  evidence: Array<{ metric: string; value: number | string }>;
  dataGaps: string[];
  version: string;
}
