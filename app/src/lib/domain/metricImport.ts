import { parseCsv } from './csv';
import { isValidDay } from './dates';
import type { CampaignMetricsDaily, OrganizationId, Platform } from './types';
import { PLATFORMS } from './types';

/**
 * Importador de métricas diarias de pauta (exportaciones CSV de Meta Ads Manager y Google Ads,
 * en español o inglés). Normaliza a una fila por organización + plataforma + campaña + día,
 * que es la clave única de public.campaign_metrics_daily. Es un dry-run: no escribe nada.
 */

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

export const METRIC_ALIASES = {
  campaignId: ['campaign id', 'id de la campana', 'identificador de la campana', 'campaign_id', 'id campana'],
  campaignName: ['campaign name', 'nombre de la campana', 'campaign', 'campana', 'campaign_name'],
  date: ['day', 'dia', 'date', 'fecha', 'reporting starts', 'inicio del informe', 'metric_date'],
  reportEnd: ['reporting ends', 'fin del informe'],
  spend: ['amount spent', 'importe gastado', 'cost', 'costo', 'coste', 'spend', 'inversion', 'gasto'],
  impressions: ['impressions', 'impresiones', 'impr.', 'impr'],
  clicks: ['link clicks', 'clics en el enlace', 'clicks', 'clics', 'clic'],
  leads: ['leads', 'clientes potenciales', 'resultados', 'results', 'conversions', 'conversiones', 'platform_leads', 'leads plataforma'],
  currency: ['currency', 'moneda', 'currency code', 'codigo de moneda'],
  platform: ['platform', 'plataforma', 'canal'],
} as const;

export type MetricField = keyof typeof METRIC_ALIASES;
export type MetricMapping = Partial<Record<MetricField, number>>;

/** Quita el sufijo de moneda de encabezados como "Importe gastado (ARS)". */
function headerCurrency(h: string): string | undefined {
  return h.match(/\(([A-Z]{3})\)\s*$/)?.[1];
}
const stripSuffix = (h: string) => norm(h.replace(/\([^)]*\)\s*$/, ''));

export function detectMetricMapping(headers: readonly string[]): MetricMapping {
  const hs = headers.map(stripSuffix);
  const m: MetricMapping = {};
  for (const field of Object.keys(METRIC_ALIASES) as MetricField[]) {
    // Preferimos coincidencia exacta; "clicks" no debe ganarle a "link clicks" si ambas existen.
    const aliases = METRIC_ALIASES[field] as readonly string[];
    for (const a of aliases) {
      const idx = hs.findIndex((h, i) => h === a && !Object.values(m).includes(i));
      if (idx >= 0) {
        m[field] = idx;
        break;
      }
    }
  }
  return m;
}

/** Detecta la plataforma por los encabezados típicos de cada exportación. */
export function detectPlatform(headers: readonly string[]): Platform | undefined {
  const hs = headers.map(stripSuffix);
  if (hs.some((h) => ['importe gastado', 'amount spent', 'clientes potenciales', 'inicio del informe', 'reporting starts'].includes(h))) return 'meta';
  if (hs.some((h) => ['impr.', 'cost', 'conversions', 'conversiones'].includes(h)) && hs.includes('campaign')) return 'google';
  return undefined;
}

/** Número en formato es-AR (1.234,56) o en-US (1,234.56). Acepta 0. Vacío o "--" cuenta como 0. */
export function parseLocaleNumber(raw: string | undefined): number | undefined {
  const t = (raw ?? '').trim();
  if (t === '' || t === '-' || t === '--' || t === '—') return 0;
  let s = t.replace(/[^\d.,-]/g, '');
  if (!s || /-/.test(s.slice(1))) return undefined;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  // Un solo tipo de separador con grupos de 3 dígitos: es separador de miles ("3,000" o "12.000").
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** YYYY-MM-DD o DD/MM/YYYY (formato argentino). */
export function parseMetricDate(raw: string | undefined): string | undefined {
  const t = (raw ?? '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const ar = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const day = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : ar ? `${ar[3]}-${ar[2]!.padStart(2, '0')}-${ar[1]!.padStart(2, '0')}` : undefined;
  return day && isValidDay(day) ? day : undefined;
}

const slug = (s: string) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

export interface MetricRowError {
  row: number;
  message: string;
}

export type MetricOutcome =
  | { kind: 'create'; metric: CampaignMetricsDaily; campaignName: string }
  | { kind: 'update'; metric: CampaignMetricsDaily; campaignName: string; previous: CampaignMetricsDaily }
  | { kind: 'unchanged'; metric: CampaignMetricsDaily; campaignName: string };

export interface MetricImportPreview {
  platform: Platform;
  organizationId: OrganizationId;
  headers: string[];
  mapping: MetricMapping;
  outcomes: MetricOutcome[];
  errors: MetricRowError[];
  warnings: string[];
  newCampaigns: Array<{ id: string; name: string }>;
  range?: { from: string; to: string };
  counts: { create: number; update: number; unchanged: number; error: number; merged: number };
}

export interface MetricPreviewOptions {
  organizationId: OrganizationId;
  platform?: Platform; // si no se indica, se detecta por encabezados
  existing: readonly CampaignMetricsDaily[];
  knownCampaignIds: ReadonlySet<string>;
  today: string; // YYYY-MM-DD
  defaultCurrency?: string;
}

const key = (m: Pick<CampaignMetricsDaily, 'organizationId' | 'platform' | 'campaignId' | 'date'>) =>
  `${m.organizationId}|${m.platform}|${m.campaignId}|${m.date}`;

const same = (a: CampaignMetricsDaily, b: CampaignMetricsDaily) =>
  a.currency === b.currency &&
  Math.abs(a.spend - b.spend) < 0.005 &&
  a.impressions === b.impressions &&
  a.clicks === b.clicks &&
  a.platformLeads === b.platformLeads;

export function previewMetricImport(text: string, opts: MetricPreviewOptions): MetricImportPreview | { fatal: string } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) return { fatal: 'El archivo no tiene filas de datos.' };
  const headers = rows[0]!;
  const mapping = detectMetricMapping(headers);
  const platformCol = mapping.platform;
  const detected = opts.platform ?? detectPlatform(headers);
  if (!detected && platformCol === undefined) return { fatal: 'No se pudo detectar la plataforma. Elegila manualmente.' };
  const missing = (['date', 'spend', 'impressions', 'clicks'] as const).filter((f) => mapping[f] === undefined);
  if (mapping.campaignId === undefined && mapping.campaignName === undefined) missing.unshift('campaignName' as never);
  if (missing.length) {
    const label: Record<string, string> = { date: 'día', spend: 'inversión', impressions: 'impresiones', clicks: 'clics', campaignName: 'campaña' };
    return { fatal: `Faltan columnas obligatorias: ${missing.map((m) => label[m] ?? m).join(', ')}.` };
  }
  const spendHeader = headers[mapping.spend!] ?? '';
  const fileCurrency = headerCurrency(spendHeader) ?? opts.defaultCurrency ?? 'ARS';
  const errors: MetricRowError[] = [];
  const warnings: string[] = [];
  if (mapping.leads === undefined) warnings.push('No hay columna de leads/resultados: se importan como 0.');

  const merged = new Map<string, { metric: CampaignMetricsDaily; campaignName: string }>();
  let mergedCount = 0;
  let derivedIds = 0;
  let clickWarnings = 0;
  const cell = (r: string[], f: MetricField) => (mapping[f] === undefined ? undefined : r[mapping[f]!]);

  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const first = norm(r[0] ?? '');
    // Las exportaciones de Google traen filas de "Total: ..." al final.
    if (first.startsWith('total')) return;
    const platformRaw = norm(cell(r, 'platform') ?? '');
    const platform = (PLATFORMS as readonly string[]).includes(platformRaw)
      ? (platformRaw as Platform)
      : /facebook|instagram|meta/.test(platformRaw)
        ? 'meta'
        : /google/.test(platformRaw)
          ? 'google'
          : detected;
    if (!platform) return errors.push({ row, message: `plataforma desconocida: "${cell(r, 'platform') ?? ''}"` });
    const date = parseMetricDate(cell(r, 'date'));
    if (!date) return errors.push({ row, message: `fecha inválida: "${cell(r, 'date') ?? ''}"` });
    const end = mapping.reportEnd === undefined ? undefined : parseMetricDate(cell(r, 'reportEnd'));
    if (end && end !== date) return errors.push({ row, message: 'la fila cubre varios días: exportá con desglose por día' });
    if (date > opts.today) return errors.push({ row, message: `fecha futura: ${date}` });
    const name = (cell(r, 'campaignName') ?? '').trim();
    let id = (cell(r, 'campaignId') ?? '').trim();
    if (!id) {
      if (!name) return errors.push({ row, message: 'sin campaña' });
      id = `name:${slug(name)}`;
      derivedIds++;
    }
    const spend = parseLocaleNumber(cell(r, 'spend'));
    const impressions = parseLocaleNumber(cell(r, 'impressions'));
    const clicks = parseLocaleNumber(cell(r, 'clicks'));
    const leads = parseLocaleNumber(cell(r, 'leads'));
    const checks = [
      ['inversión', 'spend', spend],
      ['impresiones', 'impressions', impressions],
      ['clics', 'clicks', clicks],
      ['leads', 'leads', leads],
    ] as const;
    const bad = checks.find(([, , v]) => v === undefined || v < 0);
    if (bad) return errors.push({ row, message: `${bad[0]} inválido: "${cell(r, bad[1]) ?? ''}"` });
    if (!Number.isInteger(impressions) || !Number.isInteger(clicks) || !Number.isInteger(leads))
      return errors.push({ row, message: 'impresiones, clics y leads deben ser enteros' });
    const currency = (cell(r, 'currency') ?? '').trim().toUpperCase() || fileCurrency;
    if (!/^[A-Z]{3}$/.test(currency)) return errors.push({ row, message: `moneda inválida: "${currency}"` });
    const metric: CampaignMetricsDaily = {
      organizationId: opts.organizationId,
      platform,
      campaignId: id,
      date,
      currency,
      spend: Math.round(spend! * 100) / 100,
      impressions: impressions!,
      clicks: clicks!,
      platformLeads: leads!,
    };
    const k = key(metric);
    const prev = merged.get(k);
    if (prev) {
      // Exportaciones por conjunto de anuncios o anuncio: se suman al total diario de la campaña.
      if (prev.metric.currency !== currency) return errors.push({ row, message: 'misma campaña y día con monedas distintas' });
      prev.metric.spend = Math.round((prev.metric.spend + metric.spend) * 100) / 100;
      prev.metric.impressions += metric.impressions;
      prev.metric.clicks += metric.clicks;
      prev.metric.platformLeads += metric.platformLeads;
      mergedCount++;
    } else merged.set(k, { metric, campaignName: name || id });
  });

  for (const { metric } of merged.values()) if (metric.clicks > metric.impressions) clickWarnings++;
  if (clickWarnings) warnings.push(`${clickWarnings} días con más clics que impresiones: revisá la columna de clics.`);
  if (derivedIds) warnings.push(`${derivedIds} filas sin ID de campaña: se identifican por nombre. Si renombrás la campaña se crea otra.`);
  if (mergedCount) warnings.push(`${mergedCount} filas sumadas al total diario de su campaña (exportación por conjunto o anuncio).`);

  const existing = new Map(opts.existing.map((m) => [key(m), m]));
  const outcomes: MetricOutcome[] = [...merged.values()].map(({ metric, campaignName }) => {
    const prev = existing.get(key(metric));
    if (!prev) return { kind: 'create', metric, campaignName };
    return same(prev, metric) ? { kind: 'unchanged', metric, campaignName } : { kind: 'update', metric, campaignName, previous: prev };
  });
  const newCampaigns = new Map<string, string>();
  for (const o of outcomes) if (!opts.knownCampaignIds.has(o.metric.campaignId)) newCampaigns.set(o.metric.campaignId, o.campaignName);
  const days = outcomes.map((o) => o.metric.date).sort();
  const platforms = new Set(outcomes.map((o) => o.metric.platform));
  return {
    platform: platforms.size === 1 ? [...platforms][0]! : (detected ?? 'meta'),
    organizationId: opts.organizationId,
    headers,
    mapping,
    outcomes,
    errors,
    warnings,
    newCampaigns: [...newCampaigns].map(([id, name]) => ({ id, name })),
    range: days.length ? { from: days[0]!, to: days[days.length - 1]! } : undefined,
    counts: {
      create: outcomes.filter((o) => o.kind === 'create').length,
      update: outcomes.filter((o) => o.kind === 'update').length,
      unchanged: outcomes.filter((o) => o.kind === 'unchanged').length,
      error: errors.length,
      merged: mergedCount,
    },
  };
}
