import { describe, expect, it } from 'vitest';
import { byChannel, dailyBreakdown, leadsByChannel, missingMetricDays, reconcile } from '@/lib/domain/reconcile';
import type { Campaign, CampaignMetricsDaily, Lead } from '@/lib/domain/types';

const lead = (over: Partial<Lead>): Lead => ({
  id: Math.random().toString(36),
  organizationId: 'cardys_fiat',
  name: 'X',
  source: 'Meta',
  status: 'new',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  ...over,
});
const metric = (date: string, over: Partial<CampaignMetricsDaily> = {}): CampaignMetricsDaily => ({
  organizationId: 'cardys_fiat',
  platform: 'meta',
  campaignId: 'c1',
  date,
  currency: 'ARS',
  spend: 100,
  impressions: 1000,
  clicks: 10,
  platformLeads: 5,
  ...over,
});

describe('conciliación Ads ↔ CRM', () => {
  it('niveles según la brecha', () => {
    expect(reconcile(0, 0).level).toBe('no_data');
    expect(reconcile(100, 95).level).toBe('ok');
    expect(reconcile(10, 8).level).toBe('ok'); // dentro del ruido absoluto
    expect(reconcile(100, 80).level).toBe('warn');
    expect(reconcile(100, 60).level).toBe('alert');
    expect(reconcile(40, 0).level).toBe('alert');
    expect(reconcile(0, 7).level).toBe('warn');
  });
  it('explica la brecha en ambas direcciones', () => {
    expect(reconcile(100, 60)).toMatchObject({ gap: 40, gapPct: 40 });
    expect(reconcile(100, 60).message).toMatch(/40 leads de Ads/);
    expect(reconcile(50, 80).message).toMatch(/30 leads más/);
  });
});

describe('desglose diario', () => {
  const range = { from: '2026-10-01', to: '2026-10-05' };
  it('suma por día y cuenta leads del CRM por fecha de alta', () => {
    const rows = dailyBreakdown(range, [metric('2026-10-01'), metric('2026-10-01', { campaignId: 'c2' }), metric('2026-10-04')], [lead({}), lead({ createdAt: '2026-10-04T08:00:00.000Z' })]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ spend: 200, adsLeads: 10, crmLeads: 1, hasMetrics: true });
    expect(rows[1]).toMatchObject({ hasMetrics: false, crmLeads: 0 });
  });
  it('detecta días sin métricas entre el primero y el último con datos', () => {
    const rows = dailyBreakdown(range, [metric('2026-10-02'), metric('2026-10-04')], []);
    expect(missingMetricDays(rows)).toEqual(['2026-10-03']);
    expect(missingMetricDays(dailyBreakdown(range, [], []))).toEqual([]);
  });
});

describe('filtro de canal', () => {
  const campaigns: Campaign[] = [
    { id: 'c1', organizationId: 'cardys_fiat', platform: 'meta', name: 'M', objective: '', status: 'active', currency: 'ARS' },
    { id: 'g1', organizationId: 'cardys_fiat', platform: 'google', name: 'G', objective: '', status: 'active', currency: 'ARS' },
  ];
  it('filtra filas por plataforma', () => {
    expect(byChannel(campaigns, 'google').map((c) => c.id)).toEqual(['g1']);
    expect(byChannel(campaigns, 'all')).toHaveLength(2);
  });
  it('los leads toman el canal de su campaña; sin campaña quedan fuera al filtrar', () => {
    const leads = [lead({ campaignId: 'c1' }), lead({ campaignId: 'g1' }), lead({}), lead({ campaignId: 'c1', organizationId: 'overland_motors' })];
    expect(leadsByChannel(leads, campaigns, 'meta')).toHaveLength(1);
    expect(leadsByChannel(leads, campaigns, 'all')).toHaveLength(4);
  });
});
