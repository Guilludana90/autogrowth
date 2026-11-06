import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isOrganizationId, type OrganizationId } from '../domain/types';
import type { InsightsPage, MetaServerConfig } from './meta';

/** Solo servidor: firma de state OAuth, llamadas a Graph API y clientes de Supabase. Nunca importar desde el navegador. */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface OAuthState {
  org: OrganizationId;
  userId: string;
  adAccountId: string;
  exp: number; // epoch ms
  nonce: string;
}

export function signState(p: Omit<OAuthState, 'nonce'>, secret: string): string {
  const payload = b64url(JSON.stringify({ ...p, nonce: randomBytes(12).toString('hex') }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): OAuthState {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) throw new Error('state inválido');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('state con firma inválida');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthState;
  if (!isOrganizationId(data.org) || typeof data.userId !== 'string' || typeof data.adAccountId !== 'string') throw new Error('state incompleto');
  if (typeof data.exp !== 'number' || data.exp < now) throw new Error('state vencido: volvé a iniciar la conexión');
  return data;
}

/** appsecret_proof: Meta lo exige para que un token robado no sirva sin el secreto de la app. */
export function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function graphJson<T>(url: string, token: string, cfg: MetaServerConfig, fetchImpl: FetchLike): Promise<T> {
  const u = new URL(url);
  u.searchParams.set('appsecret_proof', appSecretProof(token, cfg.appSecret));
  const res = await fetchImpl(u.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(`Meta: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return body;
}

export async function exchangeCode(code: string, cfg: MetaServerConfig, fetchImpl: FetchLike = fetch) {
  const short = new URL(`https://graph.facebook.com/${cfg.version}/oauth/access_token`);
  short.searchParams.set('client_id', cfg.appId);
  short.searchParams.set('client_secret', cfg.appSecret);
  short.searchParams.set('redirect_uri', cfg.redirectUri);
  short.searchParams.set('code', code);
  const r1 = await fetchImpl(short.toString(), { cache: 'no-store' });
  const t1 = (await r1.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!r1.ok || !t1.access_token) throw new Error(`Meta no entregó el token: ${t1.error?.message ?? `HTTP ${r1.status}`}`);
  // Token de larga duración (~60 días).
  const long = new URL(`https://graph.facebook.com/${cfg.version}/oauth/access_token`);
  long.searchParams.set('grant_type', 'fb_exchange_token');
  long.searchParams.set('client_id', cfg.appId);
  long.searchParams.set('client_secret', cfg.appSecret);
  long.searchParams.set('fb_exchange_token', t1.access_token);
  const r2 = await fetchImpl(long.toString(), { cache: 'no-store' });
  const t2 = (await r2.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  const token = t2.access_token ?? t1.access_token;
  const expiresAt = t2.expires_in ? new Date(Date.now() + t2.expires_in * 1000).toISOString() : null;
  return { token, expiresAt };
}

/** Prueba real de la conexión: sin esta respuesta la integración no se marca como conectada. */
export async function testAdAccount(adAccountId: string, token: string, cfg: MetaServerConfig, fetchImpl: FetchLike = fetch) {
  const u = new URL(`https://graph.facebook.com/${cfg.version}/${adAccountId}`);
  u.searchParams.set('fields', 'id,name,currency,account_status');
  return graphJson<{ id: string; name?: string; currency?: string; account_status?: number }>(u.toString(), token, cfg, fetchImpl);
}

export async function fetchAllInsights(url: string, token: string, cfg: MetaServerConfig, fetchImpl: FetchLike = fetch, maxPages = 50) {
  const pages: InsightsPage[] = [];
  let next: string | undefined = url;
  while (next && pages.length < maxPages) {
    const page: InsightsPage = await graphJson<InsightsPage>(next, token, cfg, fetchImpl);
    pages.push(page);
    next = page.paging?.next;
  }
  if (next) throw new Error(`La respuesta tiene más de ${maxPages} páginas: acotá el rango`);
  return pages;
}

export const serviceClient = (cfg: MetaServerConfig): SupabaseClient =>
  createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Cliente que actúa como el usuario: RLS, roles y auditoría con su identidad. */
export const userClient = (cfg: MetaServerConfig, accessToken: string): SupabaseClient =>
  createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

export function bearer(req: Request): string | undefined {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : undefined;
}

/** Verifica el JWT del usuario y que sea Super Admin o Gerente de la organización. */
export async function requireOrgAdmin(cfg: MetaServerConfig, accessToken: string | undefined, org: unknown) {
  if (!accessToken) throw new HttpError(401, 'Iniciá sesión');
  if (!isOrganizationId(org)) throw new HttpError(400, 'Organización inválida');
  const db = userClient(cfg, accessToken);
  const { data: u, error } = await db.auth.getUser(accessToken);
  if (error || !u.user) throw new HttpError(401, 'Sesión inválida');
  const { data: m } = await db.from('memberships').select('role').eq('organization_id', org).eq('user_id', u.user.id).maybeSingle();
  if (!m || !['super_admin', 'dealership_admin'].includes((m as { role: string }).role))
    throw new HttpError(403, 'Solo Super Admin o Gerente gestionan integraciones');
  return { userId: u.user.id, org, db };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(e: unknown) {
  const status = e instanceof HttpError ? e.status : 502;
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}
