import { toDay } from '@/lib/domain/dates';
import { buildInsightsUrl, mapInsights, readMetaConfig, toRpcRows, validateSyncRange } from '@/lib/integrations/meta';
import { bearer, fetchAllInsights, HttpError, jsonError, requireOrgAdmin, serviceClient } from '@/lib/integrations/meta.server';

export const dynamic = 'force-dynamic';

/**
 * Sincroniza métricas diarias de la cuenta conectada para un rango. Lee el token con service role,
 * pero escribe con la identidad del usuario vía la RPC import_campaign_metrics (lote reversible y auditado).
 */
export async function POST(req: Request) {
  const c = readMetaConfig(process.env);
  if (!c.ok) return Response.json({ error: c.reason }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as { organizationId?: unknown; from?: unknown; to?: unknown };
    const { org, db } = await requireOrgAdmin(c.config, bearer(req), body.organizationId);
    const range = { from: String(body.from ?? ''), to: String(body.to ?? '') };
    const invalid = validateSyncRange(range, toDay(new Date()));
    if (invalid) throw new HttpError(400, invalid);

    const svc = serviceClient(c.config);
    const { data: integ } = await svc.from('integrations').select('status, external_account_id').eq('organization_id', org).eq('provider', 'meta').maybeSingle();
    const i = integ as { status: string; external_account_id: string | null } | null;
    if (!i || i.status !== 'connected' || !i.external_account_id) throw new HttpError(409, 'Meta no está conectada para esta organización');
    if (!c.config.allowedAdAccounts.includes(i.external_account_id)) throw new HttpError(403, 'La cuenta conectada ya no está autorizada');
    const { data: sec } = await svc.from('integration_secrets').select('access_token, token_expires_at').eq('organization_id', org).eq('provider', 'meta').maybeSingle();
    const secret = sec as { access_token: string; token_expires_at: string | null } | null;
    if (!secret) throw new HttpError(409, 'Falta el token: volvé a conectar Meta');
    if (secret.token_expires_at && Date.parse(secret.token_expires_at) < Date.now()) throw new HttpError(409, 'El token venció: volvé a conectar Meta');

    try {
      const pages = await fetchAllInsights(buildInsightsUrl({ adAccountId: i.external_account_id, range, version: c.config.version }), secret.access_token, c.config);
      const mapped = mapInsights(pages, org);
      if (!mapped.metrics.length) {
        await svc.from('integrations').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('organization_id', org).eq('provider', 'meta');
        return Response.json({ jobId: null, rows: 0, skipped: mapped.skipped.length });
      }
      const names = new Map(mapped.campaigns.map((x) => [x.id, x.name]));
      const { data: jobId, error } = await db.rpc('import_campaign_metrics', {
        p_org: org,
        p_platform: 'meta',
        p_source: 'meta_api',
        p_file_name: `Meta API ${i.external_account_id} ${range.from}→${range.to}`,
        p_rows: toRpcRows(mapped.metrics, names),
        p_campaigns: mapped.campaigns.map((x) => ({ id: x.id, name: x.name })),
      });
      if (error) throw new Error(error.message);
      await svc.from('integrations').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('organization_id', org).eq('provider', 'meta');
      return Response.json({ jobId, rows: mapped.metrics.length, skipped: mapped.skipped.length });
    } catch (e) {
      await svc.from('integrations').update({ last_error: e instanceof Error ? e.message : String(e), updated_at: new Date().toISOString() }).eq('organization_id', org).eq('provider', 'meta');
      throw e;
    }
  } catch (e) {
    return jsonError(e);
  }
}
