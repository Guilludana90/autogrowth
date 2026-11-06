import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isOrganizationId, type OrganizationId, type Role } from '../domain/types';
import { HttpError } from '../integrations/meta.server';

/** Cliente de Supabase que actúa como el usuario (RLS y auditoría con su identidad). */
export const userDb = (url: string, anonKey: string, accessToken: string): SupabaseClient =>
  createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });

/** Verifica el JWT y que el usuario tenga uno de los roles en la organización. */
export async function requireMember(
  cfg: { supabaseUrl: string; supabaseAnonKey: string },
  accessToken: string | undefined,
  org: unknown,
  roles: readonly Role[],
  deniedMessage: string,
): Promise<{ userId: string; org: OrganizationId; role: Role; db: SupabaseClient }> {
  if (!accessToken) throw new HttpError(401, 'Iniciá sesión');
  if (!isOrganizationId(org)) throw new HttpError(400, 'Organización inválida');
  const db = userDb(cfg.supabaseUrl, cfg.supabaseAnonKey, accessToken);
  const { data: u, error } = await db.auth.getUser(accessToken);
  if (error || !u.user) throw new HttpError(401, 'Sesión inválida');
  const { data: m } = await db.from('memberships').select('role').eq('organization_id', org).eq('user_id', u.user.id).maybeSingle();
  const role = (m as { role: Role } | null)?.role;
  if (!role || !roles.includes(role)) throw new HttpError(403, deniedMessage);
  return { userId: u.user.id, org, role, db };
}
