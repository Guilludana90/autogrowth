import type { Campaign, CampaignMetricsDaily, DateRange, OrganizationId } from '../domain/types';

/**
 * Meta Marketing API: funciones puras (sin red ni secretos) para armar URLs y normalizar respuestas.
 * Las llamadas reales viven en meta.server.ts y solo corren del lado servidor, fuera de DEMO_MODE.
 */

/** Permiso mínimo para leer métricas. Lead Ads (leads_retrieval) se pide recién cuando se integre esa parte. */
export const META_SCOPES = ['ads_read'] as const;
export const DEFAULT_GRAPH_VERSION = 'v23.0';
export const MAX_SYNC_DAYS = 90;

export function normalizeAdAccountId(raw: string): string | undefined {
  const t = raw.trim();
  const m = t.match(/^(?:act_)?(\d{5,20})$/);
  return m ? `act_${m[1]}` : undefined;
}

export function buildAuthUrl(p: { appId: string; redirectUri: string; state: string; version?: string }): string {
  const u = new URL(`https://www.facebook.com/${p.version ?? DEFAULT_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', p.appId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('state', p.state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', META_SCOPES.join(','));
  return u.toString();
}

export function buildInsightsUrl(p: { adAccountId: string; range: DateRange; version?: string }): string {
  const u = new URL(`https://graph.facebook.com/${p.version ?? DEFAULT_GRAPH_VERSION}/${p.adAccountId}/insights`);
  u.searchParams.set('level', 'campaign');
  u.searchParams.set('time_increment', '1');
  u.searchParams.set('time_range', JSON.stringify({ since: p.range.from, until: p.range.to }));
  u.searchParams.set('fields', 'campaign_id,campaign_name,objective,spend,impressions,inline_link_clicks,actions,account_currency,date_start,date_stop');
  u.searchParams.set('limit', '500');
  return u.toString();
}

/** Un rango válido para sincronizar: ordenado, sin días futuros y de hasta MAX_SYNC_DAYS. */
export function validateSyncRange(range: DateRange, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return 'Rango inválido';
  if (range.from > range.to) return 'El rango está invertido';
  if (range.to > today) return 'El rango incluye días futuros';
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  if (days > MAX_SYNC_DAYS) return `Máximo ${MAX_SYNC_DAYS} días por sincronización`;
  return undefined;
}

interface InsightAction {
  action_type?: string;
  value?: string;
}
interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: InsightAction[];
  account_currency?: string;
  date_start?: string;
  date_stop?: string;
}
export interface InsightsPage {
  data?: InsightRow[];
  paging?: { next?: string };
  error?: { message?: string; code?: number; type?: string };
}

/**
 * Tipos de acción que cuentan como lead, en orden de preferencia. Se toma el primero presente
 * para no contar dos veces el mismo lead (Meta informa varios alias del mismo evento).
 */
export const LEAD_ACTION_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'leadgen_grouped', 'offsite_conversion.fb_pixel_lead'] as const;

export function leadsFromActions(actions: readonly InsightAction[] | undefined): number {
  for (const t of LEAD_ACTION_TYPES) {
    const a = actions?.find((x) => x.action_type === t);
    if (a) return Math.max(0, Math.round(Number(a.value) || 0));
  }
  return 0;
}

export interface MappedInsights {
  metrics: CampaignMetricsDaily[];
  campaigns: Campaign[];
  skipped: Array<{ reason: string; row: InsightRow }>;
}

/** Normaliza páginas de /insights (level=campaign, time_increment=1) al modelo diario del CRM. */
export function mapInsights(pages: readonly InsightsPage[], organizationId: OrganizationId): MappedInsights {
  const metrics: CampaignMetricsDaily[] = [];
  const campaigns = new Map<string, Campaign>();
  const skipped: MappedInsights['skipped'] = [];
  for (const page of pages) {
    if (page.error) throw new Error(`Meta respondió un error: ${page.error.message ?? 'desconocido'}`);
    for (const row of page.data ?? []) {
      if (!row.campaign_id || !row.date_start) {
        skipped.push({ reason: 'sin campaña o fecha', row });
        continue;
      }
      if (row.date_stop && row.date_stop !== row.date_start) {
        skipped.push({ reason: 'fila de varios días', row });
        continue;
      }
      const currency = (row.account_currency ?? 'ARS').toUpperCase();
      const spend = Number(row.spend ?? 0);
      const impressions = Number(row.impressions ?? 0);
      const clicks = Number(row.inline_link_clicks ?? 0);
      if (![spend, impressions, clicks].every((n) => Number.isFinite(n) && n >= 0)) {
        skipped.push({ reason: 'valores inválidos', row });
        continue;
      }
      metrics.push({
        organizationId,
        platform: 'meta',
        campaignId: row.campaign_id,
        date: row.date_start,
        currency,
        spend: Math.round(spend * 100) / 100,
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        platformLeads: leadsFromActions(row.actions),
      });
      if (!campaigns.has(row.campaign_id))
        campaigns.set(row.campaign_id, {
          id: row.campaign_id,
          organizationId,
          platform: 'meta',
          name: row.campaign_name ?? row.campaign_id,
          objective: row.objective ?? '',
          status: 'active',
          currency,
        });
    }
  }
  return { metrics, campaigns: [...campaigns.values()], skipped };
}

/** Filas para la RPC import_campaign_metrics. */
export function toRpcRows(metrics: readonly CampaignMetricsDaily[], names: ReadonlyMap<string, string>) {
  return metrics.map((m) => ({
    campaign_id: m.campaignId,
    campaign_name: names.get(m.campaignId) ?? m.campaignId,
    date: m.date,
    currency: m.currency,
    spend: m.spend,
    impressions: m.impressions,
    clicks: m.clicks,
    platform_leads: m.platformLeads,
  }));
}

/** Configuración del servidor. Devuelve qué falta para no fallar a medias. */
export interface MetaServerConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  version: string;
  allowedAdAccounts: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  stateSecret: string;
}

export function readMetaConfig(env: Record<string, string | undefined>): { ok: true; config: MetaServerConfig } | { ok: false; reason: string } {
  if (env.NEXT_PUBLIC_DEMO_MODE !== 'false') return { ok: false, reason: 'Modo demo: las integraciones externas están desactivadas.' };
  const required = ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI', 'META_ALLOWED_AD_ACCOUNTS', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'INTEGRATION_STATE_SECRET'];
  const missing = required.filter((k) => !env[k]?.trim());
  if (missing.length) return { ok: false, reason: `Falta configurar en el servidor: ${missing.join(', ')}.` };
  const allowed = env.META_ALLOWED_AD_ACCOUNTS!.split(',').map((s) => normalizeAdAccountId(s)).filter((s): s is string => !!s);
  if (!allowed.length) return { ok: false, reason: 'META_ALLOWED_AD_ACCOUNTS no tiene cuentas válidas (act_…).' };
  if (env.INTEGRATION_STATE_SECRET!.length < 32) return { ok: false, reason: 'INTEGRATION_STATE_SECRET debe tener al menos 32 caracteres.' };
  return {
    ok: true,
    config: {
      appId: env.META_APP_ID!,
      appSecret: env.META_APP_SECRET!,
      redirectUri: env.META_REDIRECT_URI!,
      version: env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
      allowedAdAccounts: allowed,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
      stateSecret: env.INTEGRATION_STATE_SECRET!,
    },
  };
}
