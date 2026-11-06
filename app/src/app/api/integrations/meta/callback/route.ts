import { readMetaConfig } from '@/lib/integrations/meta';
import { exchangeCode, serviceClient, testAdAccount, verifyState } from '@/lib/integrations/meta.server';

export const dynamic = 'force-dynamic';

/**
 * Callback de OAuth: valida el state firmado, canjea el código del lado servidor, prueba la cuenta
 * y recién entonces marca la integración como conectada. El token queda en integration_secrets
 * (solo service role); nunca vuelve al navegador.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: 'connected' | 'error', msg?: string) => {
    const to = new URL('/integrations', url.origin);
    to.searchParams.set('meta', status);
    if (msg) to.searchParams.set('msg', msg.slice(0, 200));
    return Response.redirect(to, 303);
  };
  const c = readMetaConfig(process.env);
  if (!c.ok) return back('error', c.reason);
  if (url.searchParams.get('error')) return back('error', url.searchParams.get('error_description') ?? 'Conexión cancelada en Meta');
  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state');
  if (!code || !rawState) return back('error', 'Faltan parámetros de Meta');

  let state;
  try {
    state = verifyState(rawState, c.config.stateSecret);
  } catch (e) {
    return back('error', e instanceof Error ? e.message : 'state inválido');
  }
  const db = serviceClient(c.config);
  try {
    if (!c.config.allowedAdAccounts.includes(state.adAccountId)) throw new Error('Cuenta no autorizada');
    const { token, expiresAt } = await exchangeCode(code, c.config);
    const account = await testAdAccount(state.adAccountId, token, c.config);
    const now = new Date().toISOString();
    const s = await db.from('integration_secrets').upsert({
      organization_id: state.org,
      provider: 'meta',
      access_token: token,
      token_expires_at: expiresAt,
      updated_at: now,
    });
    if (s.error) throw new Error(s.error.message);
    const i = await db.from('integrations').upsert({
      organization_id: state.org,
      provider: 'meta',
      status: 'connected',
      external_account_id: state.adAccountId,
      external_account_name: account.name ?? null,
      currency: account.currency ?? null,
      last_tested_at: now,
      last_error: null,
      connected_by: state.userId,
      updated_at: now,
    });
    if (i.error) throw new Error(i.error.message);
    return back('connected');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('integrations').upsert({ organization_id: state.org, provider: 'meta', status: 'error', last_error: msg, updated_at: new Date().toISOString() });
    return back('error', msg);
  }
}
