import { eachDay, inRange } from './dates';
import { safeRatio } from './metrics';
import type { Campaign, CampaignMetricsDaily, DateRange, Lead, Platform } from './types';

/**
 * Conciliación Ads ↔ CRM: compara los leads que informa la plataforma con los leads que llegaron
 * al CRM atribuidos a la misma campaña y en la misma ventana. La diferencia es la "fuga" a explicar
 * (carga manual pendiente, formulario sin integrar, duplicados o atribución incorrecta).
 */
export type GapLevel = 'ok' | 'warn' | 'alert' | 'no_data';

export interface Reconciliation {
  adsLeads: number;
  crmLeads: number;
  gap: number; // ads - crm (positivo = leads de Ads que no llegaron)
  gapPct: number | null; // % sobre leads de Ads
  level: GapLevel;
  message: string;
}

/** Diferencias de hasta este valor absoluto no se marcan (ruido de atribución diaria). */
export const GAP_NOISE = 2;
export const GAP_WARN_PCT = 10;
export const GAP_ALERT_PCT = 25;

export function reconcile(adsLeads: number, crmLeads: number): Reconciliation {
  const gap = adsLeads - crmLeads;
  const gapPct = safeRatio(gap * 100, adsLeads);
  const base = { adsLeads, crmLeads, gap, gapPct };
  if (adsLeads === 0 && crmLeads === 0) return { ...base, level: 'no_data', message: 'Sin leads en Ads ni en el CRM en el período.' };
  if (crmLeads === 0) return { ...base, level: 'alert', message: `Ads informa ${adsLeads} leads y ninguno figura en el CRM: revisar carga o integración del formulario.` };
  if (adsLeads === 0)
    return { ...base, level: 'warn', message: `${crmLeads} leads del CRM atribuidos a la campaña sin registro en Ads: faltan métricas o la atribución es incorrecta.` };
  const abs = Math.abs(gapPct ?? 0);
  if (Math.abs(gap) <= GAP_NOISE || abs <= GAP_WARN_PCT) return { ...base, level: 'ok', message: 'Ads y CRM coinciden dentro del margen esperado.' };
  const level: GapLevel = abs > GAP_ALERT_PCT ? 'alert' : 'warn';
  return gap > 0
    ? { ...base, level, message: `${gap} leads de Ads (${abs.toFixed(0)}%) no llegaron al CRM.` }
    : { ...base, level, message: `El CRM tiene ${-gap} leads más que Ads: posibles duplicados o atribución de otra fuente.` };
}

export const GAP_LABEL: Record<GapLevel, [string, 'green' | 'gold' | 'red' | 'gray']> = {
  ok: ['Concilia', 'green'],
  warn: ['Revisar', 'gold'],
  alert: ['Fuga', 'red'],
  no_data: ['Sin datos', 'gray'],
};

export interface DailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  adsLeads: number;
  crmLeads: number;
  hasMetrics: boolean;
}

/** Desglose por día de una campaña (o de un conjunto de filas). Los días sin fila importada quedan marcados. */
export function dailyBreakdown(range: DateRange, metrics: readonly CampaignMetricsDaily[], leads: readonly Lead[]): DailyRow[] {
  const byDay = new Map<string, DailyRow>();
  for (const d of eachDay(range)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, adsLeads: 0, crmLeads: 0, hasMetrics: false });
  for (const m of metrics) {
    const row = byDay.get(m.date);
    if (!row) continue;
    row.spend += m.spend;
    row.impressions += m.impressions;
    row.clicks += m.clicks;
    row.adsLeads += m.platformLeads;
    row.hasMetrics = true;
  }
  for (const l of leads) {
    const row = byDay.get(l.createdAt.slice(0, 10));
    if (row) row.crmLeads++;
  }
  return [...byDay.values()];
}

/**
 * Días sin métricas importadas dentro del período, contando solo desde el primer día con datos
 * de la campaña (una campaña nueva no tiene "huecos" antes de existir).
 */
export function missingMetricDays(rows: readonly DailyRow[]): string[] {
  const first = rows.findIndex((r) => r.hasMetrics);
  const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r.hasMetrics);
  if (first < 0) return [];
  return rows.slice(first, last + 1).filter((r) => !r.hasMetrics).map((r) => r.date);
}

/** Aplica el filtro global de canal. Los leads sin campaña no tienen canal: se excluyen al filtrar. */
export function byChannel<T extends { platform: Platform }>(rows: readonly T[], channel: Platform | 'all'): T[] {
  return channel === 'all' ? [...rows] : rows.filter((r) => r.platform === channel);
}

export function leadsByChannel(leads: readonly Lead[], campaigns: readonly Campaign[], channel: Platform | 'all'): Lead[] {
  if (channel === 'all') return [...leads];
  const ids = new Set(campaigns.filter((c) => c.platform === channel).map((c) => `${c.organizationId}|${c.id}`));
  return leads.filter((l) => l.campaignId && ids.has(`${l.organizationId}|${l.campaignId}`));
}

export function leadsInRangeFor(leads: readonly Lead[], range: DateRange) {
  return leads.filter((l) => inRange(l.createdAt, range));
}
