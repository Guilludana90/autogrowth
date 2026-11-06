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
