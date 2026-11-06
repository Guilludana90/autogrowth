import { describe, expect, it } from 'vitest';
import { can } from '@/lib/domain/permissions';
import { ROLES } from '@/lib/domain/types';

describe('permisos', () => {
  it('Read Only no puede escribir nada', () => {
    for (const a of ['lead:write', 'lead:assign', 'lead:import', 'campaign:import', 'integration:manage', 'prompt:approve'] as const) {
      expect(can('read_only', a)).toBe(false);
    }
  });
  it('Sales Advisor no administra integraciones ni aprueba prompts', () => {
    expect(can('sales_advisor', 'lead:write')).toBe(true);
    expect(can('sales_advisor', 'integration:manage')).toBe(false);
    expect(can('sales_advisor', 'prompt:approve')).toBe(false);
  });
  it('solo Super Admin aprueba prompts', () => {
    expect(ROLES.filter((r) => can(r, 'prompt:approve'))).toEqual(['super_admin']);
  });
});
