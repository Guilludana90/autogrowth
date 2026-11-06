import { buildAuthUrl, normalizeAdAccountId, readMetaConfig } from '@/lib/integrations/meta';
import { bearer, HttpError, jsonError, requireOrgAdmin, signState } from '@/lib/integrations/meta.server';

export const dynamic = 'force-dynamic';

/**
 * Inicia OAuth con Meta para una cuenta publicitaria de la lista autorizada (META_ALLOWED_AD_ACCOUNTS).
 * Devuelve la URL del diálogo; el navegador redirige. El state va firmado y vence en 10 minutos.
 */
export async function POST(req: Request) {
  const c = readMetaConfig(process.env);
  if (!c.ok) return Response.json({ error: c.reason }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as { organizationId?: unknown; adAccountId?: unknown };
    const { userId, org } = await requireOrgAdmin(c.config, bearer(req), body.organizationId);
    const adAccountId = normalizeAdAccountId(String(body.adAccountId ?? ''));
    if (!adAccountId) throw new HttpError(400, 'ID de cuenta publicitaria inválido (act_…)');
    if (!c.config.allowedAdAccounts.includes(adAccountId))
      throw new HttpError(403, 'Esa cuenta no está autorizada para pruebas. Agregala a META_ALLOWED_AD_ACCOUNTS con aprobación explícita.');
    const state = signState({ org, userId, adAccountId, exp: Date.now() + 10 * 60_000 }, c.config.stateSecret);
    return Response.json({ url: buildAuthUrl({ appId: c.config.appId, redirectUri: c.config.redirectUri, state, version: c.config.version }) });
  } catch (e) {
    return jsonError(e);
  }
}
