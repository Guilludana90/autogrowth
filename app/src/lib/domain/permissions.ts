import type { Role } from './types';

export type Action =
  | 'lead:read'
  | 'lead:write'
  | 'lead:assign'
  | 'lead:import'
  | 'campaign:read'
  | 'campaign:import'
  | 'integration:manage'
  | 'prompt:read'
  | 'service:read'
  | 'service:manage'
  | 'parts:request'
  | 'parts:manage'
  | 'knowledge:edit'
  | 'knowledge:approve'
  | 'conversation:log'
  | 'prompt:draft'
  | 'recommendation:run'
  | 'recommendation:feedback'
  | 'prompt:approve'
  | 'note:write'
  | 'task:write'
  | 'quote:read'
  | 'quote:write'
  | 'quote:approve'
  | 'pricedoc:manage'
  | 'member:read'
  | 'member:manage';

/**
 * Permisos de UI por rol. Las escrituras además las valida RLS en supabase/migrations;
 * acá se agregan reglas más finas (p. ej. solo admins asignan asesores).
 */
const MATRIX: Record<Action, readonly Role[]> = {
  'lead:read': ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales', 'read_only'],
  'lead:write': ['super_admin', 'dealership_admin', 'sales_advisor'],
  'lead:assign': ['super_admin', 'dealership_admin'],
  'lead:import': ['super_admin', 'dealership_admin'],
  'campaign:read': ['super_admin', 'dealership_admin', 'sales_advisor', 'read_only'],
  'campaign:import': ['super_admin', 'dealership_admin'],
  'integration:manage': ['super_admin', 'dealership_admin'],
  'prompt:read': ['super_admin', 'dealership_admin', 'sales_advisor', 'read_only'],
  'service:read': ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales', 'read_only'],
  'service:manage': ['super_admin', 'dealership_admin', 'post_sales'],
  'parts:request': ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales'],
  'parts:manage': ['super_admin', 'dealership_admin', 'post_sales'],
  'knowledge:edit': ['super_admin', 'dealership_admin', 'post_sales'],
  'knowledge:approve': ['super_admin', 'dealership_admin'],
  'conversation:log': ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales'],
  'prompt:draft': ['super_admin', 'dealership_admin'],
  'recommendation:run': ['super_admin', 'dealership_admin', 'sales_advisor'],
  'recommendation:feedback': ['super_admin', 'dealership_admin', 'sales_advisor'],
  'prompt:approve': ['super_admin'],
  'note:write': ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales'],
  'task:write': ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales'],
  'quote:read': ['super_admin', 'dealership_admin', 'sales_advisor', 'read_only'],
  'quote:write': ['super_admin', 'dealership_admin', 'sales_advisor'],
  'quote:approve': ['super_admin', 'dealership_admin'],
  'pricedoc:manage': ['super_admin', 'dealership_admin'],
  'member:read': ['super_admin', 'dealership_admin'],
  'member:manage': ['super_admin', 'dealership_admin'],
};

/** Roles que un rol puede otorgar (espejo de memberships_insert y add_member_by_email). */
export function grantableRoles(role: Role): Role[] {
  if (role === 'super_admin') return ['super_admin', 'dealership_admin', 'sales_advisor', 'post_sales', 'read_only'];
  if (role === 'dealership_admin') return ['sales_advisor', 'post_sales', 'read_only'];
  return [];
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}
