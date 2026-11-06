import type { CampaignMetricsDaily, DateRange, Lead } from './types';
import { inRange } from './dates';

export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  platformLeads: number;
}

export interface DerivedMetrics extends Totals {
  ctr: number | null; // %
  cpc: number | null;
  cpm: number | null;
  cpl: number | null;
}

export const safeRatio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export function sumMetrics(rows: readonly CampaignMetricsDaily[]): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      platformLeads: acc.platformLeads + r.platformLeads,
    }),
    { spend: 0, impressions: 0, clicks: 0, platformLeads: 0 },
  );
}

export function derive(t: Totals): DerivedMetrics {
  return {
    ...t,
    ctr: safeRatio(t.clicks * 100, t.impressions),
    cpc: safeRatio(t.spend, t.clicks),
    cpm: safeRatio(t.spend * 1000, t.impressions),
    cpl: safeRatio(t.spend, t.platformLeads),
  };
}

export function metricsInRange(rows: readonly CampaignMetricsDaily[], range: DateRange) {
  return rows.filter((r) => inRange(r.date, range));
}

/** Resultados comerciales registrados en el CRM (no en la plataforma de Ads). */
export interface CrmFunnel {
  crmLeads: number;
  contacted: number;
  negotiation: number;
  won: number;
  lost: number;
  contactRate: number | null; // %
  closeRate: number | null; // %
}

export function crmFunnel(leads: readonly Lead[]): CrmFunnel {
  const contacted = leads.filter((l) => l.status !== 'new').length;
  const negotiation = leads.filter((l) => l.status === 'negotiation').length;
  const won = leads.filter((l) => l.status === 'won').length;
  const lost = leads.filter((l) => l.status === 'lost').length;
  return {
    crmLeads: leads.length,
    contacted,
    negotiation,
    won,
    lost,
    contactRate: safeRatio(contacted * 100, leads.length),
    closeRate: safeRatio(won * 100, leads.length),
  };
}

export function formatMoney(n: number | null, currency = 'ARS'): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number | null, digits = 0): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(n: number | null, digits = 1): string {
  return n === null ? '—' : `${formatNumber(n, digits)}%`;
}
