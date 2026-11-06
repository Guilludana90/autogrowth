import { describe, expect, it } from 'vitest';
import { analyzeCampaign } from '@/lib/domain/recommendations';
import type { Campaign, CampaignMetricsDaily, Lead } from '@/lib/domain/types';

const campaign: Campaign = { id: 'c1', organizationId: 'cardys_fiat', platform: 'meta', name: 'Cronos', objective: 'LEADS', status: 'active', currency: 'ARS' };
const rows = (leads: number, spend = 10000): CampaignMetricsDaily[] => [
  { organizationId: 'cardys_fiat', platform: 'meta', campaignId: 'c1', date: '2026-11-01', currency: 'ARS', spend, impressions: 1000, clicks: 20, platformLeads: leads },
];
const lead = (status: Lead['status']): Lead => ({ id: Math.random().toString(), organizationId: 'cardys_fiat', name: 'x', source: 'Meta', campaignId: 'c1', status, createdAt: '', updatedAt: '' });
const now = '2026-11-06T00:00:00Z';

describe('analyzeCampaign', () => {
  it('fuga de leads plataforma → CRM es prioridad alta', () => {
    const r = analyzeCampaign(campaign, rows(10), [lead('contacted')], now);
    expect(r.priority).toBe('high');
    expect(r.mainIssue).toContain('90%');
  });
  it('leads sin contactar es prioridad alta', () => {
    const r = analyzeCampaign(campaign, rows(2), [lead('new'), lead('new')], now);
    expect(r.priority).toBe('high');
    expect(r.dataGaps).toContain('No hay contactos registrados en el CRM');
  });
  it('inversión sin leads es prioridad media', () => {
    expect(analyzeCampaign(campaign, rows(0), [], now).priority).toBe('medium');
  });
  it('sin métricas no inventa resultados', () => {
    const r = analyzeCampaign(campaign, [], [], now);
    expect(r.dataGaps).toContain('No hay métricas importadas para el período');
    expect(r.evidence.find((e) => e.metric === 'cpl')?.value).toBe('N/A');
  });
  it('embudo sano → prioridad baja', () => {
    const r = analyzeCampaign(campaign, rows(2), [lead('contacted'), lead('won')], now);
    expect(r.priority).toBe('low');
  });
});
