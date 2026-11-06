import { describe, expect, it } from 'vitest';
import { crmFunnel, derive, metricsInRange, sumMetrics } from '@/lib/domain/metrics';
import { presetRange, sanitizeRange } from '@/lib/domain/dates';
import type { CampaignMetricsDaily, Lead } from '@/lib/domain/types';

const row = (date: string, spend: number, impressions: number, clicks: number, platformLeads: number): CampaignMetricsDaily => ({
  organizationId: 'cardys_fiat', platform: 'meta', campaignId: 'c1', date, currency: 'ARS', spend, impressions, clicks, platformLeads,
});

describe('métricas derivadas', () => {
  it('CTR, CPC, CPM y CPL con división por cero → null', () => {
    const d = derive(sumMetrics([row('2026-11-01', 1000, 2000, 40, 4), row('2026-11-02', 1000, 2000, 60, 0)]));
    expect(d.ctr).toBe(2.5);
    expect(d.cpc).toBe(20);
    expect(d.cpm).toBe(500);
    expect(d.cpl).toBe(500);
    expect(derive(sumMetrics([])).cpl).toBeNull();
  });

  it('cambiar el rango recalcula los totales', () => {
    const rows = [row('2026-10-01', 100, 0, 0, 1), row('2026-11-05', 300, 0, 0, 2)];
    expect(sumMetrics(metricsInRange(rows, { from: '2026-11-01', to: '2026-11-06' })).spend).toBe(300);
    expect(sumMetrics(metricsInRange(rows, { from: '2026-09-01', to: '2026-11-06' })).spend).toBe(400);
  });
});

describe('rangos', () => {
  it('presets', () => {
    expect(presetRange('7d', '2026-11-06')).toEqual({ from: '2026-10-31', to: '2026-11-06' });
    expect(presetRange('last_month', '2026-11-06')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('this_month', '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-06' });
  });
  it('sanitiza valores de la URL', () => {
    expect(sanitizeRange('2026-11-01', '2026-11-05', '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-05' });
    expect(sanitizeRange('2026-02-30', 'x', '2026-11-06')).toEqual(presetRange('30d', '2026-11-06'));
    expect(sanitizeRange('2026-11-05', '2026-11-01', '2026-11-06')).toEqual(presetRange('30d', '2026-11-06'));
  });
});

describe('crmFunnel', () => {
  it('tasas de contacto y cierre', () => {
    const mk = (status: Lead['status']): Lead => ({ id: status, organizationId: 'cardys_fiat', name: 'x', source: 's', status, createdAt: '', updatedAt: '' });
    const f = crmFunnel([mk('new'), mk('contacted'), mk('won'), mk('lost')]);
    expect(f.contacted).toBe(3);
    expect(f.contactRate).toBe(75);
    expect(f.closeRate).toBe(25);
    expect(crmFunnel([]).contactRate).toBeNull();
  });
});
