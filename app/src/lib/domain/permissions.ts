import type { Role } from './types';

export type Action =
  | 'lead:read'
  | 'lead:write'
  | 'lead:assign'
  | 'lead:import'
  | 'campaign:read'
  | 'campaign:import'
  | 'integration:manage'
  | 'prompt:draft'
  | 'prompt:approve';

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
  'prompt:draft': ['super_admin', 'dealership_admin'],
  'prompt:approve': ['super_admin'],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}
