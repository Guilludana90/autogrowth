import { describe, expect, it } from 'vitest';
import { demoLeads, demoMetrics } from '@/lib/demo/seed';
import { normalizeArPhone } from '@/lib/domain/phone';

describe('datos demo', () => {
  const metrics = demoMetrics('2026-11-06');
  const leads = demoLeads('2026-11-06', metrics);

  it('son deterministas', () => {
    expect(demoLeads('2026-11-06', metrics)).toEqual(leads);
  });
  it('el CRM tiene menos leads de campaña que la plataforma (fuga visible)', () => {
    const platform = metrics.reduce((a, m) => a + m.platformLeads, 0);
    const attributed = leads.filter((l) => l.campaignId).length;
    expect(attributed).toBeGreaterThan(platform * 0.5);
    expect(attributed).toBeLessThan(platform);
  });
  it('todos los leads cumplen las reglas de la base (contacto válido, perdido con motivo)', () => {
    for (const l of leads) {
      expect(l.phoneE164 || l.email).toBeTruthy();
      if (l.phoneE164) expect(normalizeArPhone(l.phoneE164)).toBe(l.phoneE164);
      if (l.status === 'lost') expect(l.lostReason).toBeTruthy();
    }
  });
  it('no hay teléfonos duplicados dentro de una organización', () => {
    const keys = leads.filter((l) => l.phoneE164).map((l) => `${l.organizationId}|${l.phoneE164}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
