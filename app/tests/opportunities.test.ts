import { describe, expect, it } from 'vitest';
import { detectDataAlerts, detectOpportunities } from '@/lib/domain/opportunities';
import type { Campaign, Lead, PriceDocument, Quote, Task } from '@/lib/domain/types';

const now = new Date('2026-11-06T12:00:00Z');
const lead = (over: Partial<Lead>): Lead => ({
  id: Math.random().toString(36).slice(2),
  organizationId: 'cardys_fiat',
  name: 'Lead',
  phoneE164: '+5492392000000',
  source: 'Salón',
  status: 'new',
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: '2026-11-06T10:00:00Z',
  ...over,
});
const quote = (over: Partial<Quote>): Quote => ({
  id: Math.random().toString(36).slice(2),
  organizationId: 'cardys_fiat',
  number: 7,
  kind: 'financing',
  vehicle: 'Cronos',
  input: {},
  result: {},
  status: 'approved',
  validUntil: '2026-11-08',
  createdBy: 'u',
  createdAt: '2026-11-01T00:00:00Z',
  ...over,
});
const base = { tasks: [] as Task[], quotes: [] as Quote[], priceDocs: [] as PriceDocument[], now };

describe('oportunidades', () => {
  it('lead caliente sin contactar después de 24 h', () => {
    const ops = detectOpportunities({ ...base, leads: [lead({ score: 85, createdAt: '2026-11-04T10:00:00Z' }), lead({ score: 85 }), lead({ score: 40, createdAt: '2026-11-01T00:00:00Z' })] });
    expect(ops.map((o) => o.kind)).toEqual(['hot_uncontacted']);
    expect(ops[0]!.detail).toMatch(/2 días sin primer contacto, sin asesor/);
    expect(detectOpportunities({ ...base, leads: [lead({ score: 90, createdAt: '2026-09-20T10:00:00Z' })] })).toEqual([]);
  });
  it('negociación quieta sin tarea abierta, pero no si hay tarea', () => {
    const l = lead({ status: 'negotiation', updatedAt: '2026-10-20T00:00:00Z' });
    expect(detectOpportunities({ ...base, leads: [l] }).map((o) => o.kind)).toEqual(['stalled_negotiation']);
    const t: Task = { id: 't', organizationId: 'cardys_fiat', leadId: l.id, title: 'llamar', priority: 'normal', status: 'pending', createdAt: '' };
    expect(detectOpportunities({ ...base, leads: [l], tasks: [t] })).toEqual([]);
  });
  it('cotización aprobada sin cierre y cotización vencida', () => {
    const l = lead({ status: 'contacted' });
    const ops = detectOpportunities({ ...base, leads: [l], quotes: [quote({ leadId: l.id }), quote({ leadId: l.id, validUntil: '2026-11-01', number: 3 })] });
    expect(ops.map((o) => o.kind).sort()).toEqual(['approved_quote_open', 'expired_quote']);
    expect(ops.find((o) => o.kind === 'approved_quote_open')!.priority).toBe('high'); // vence en 2 días
    const won = lead({ status: 'won' });
    expect(detectOpportunities({ ...base, leads: [won], quotes: [quote({ leadId: won.id })] })).toEqual([]);
  });
  it('perdido por precio con lista de precios nueva', () => {
    const l = lead({ status: 'lost', lostReason: 'Precio alto', updatedAt: '2026-10-10T00:00:00Z' });
    const doc: PriceDocument = { id: 'd', organizationId: 'cardys_fiat', category: 'price_list', title: 'Lista noviembre', fileName: 'x.csv', validFrom: '2026-11-01', rows: [], status: 'active', createdAt: '' };
    expect(detectOpportunities({ ...base, leads: [l], priceDocs: [doc] }).map((o) => o.kind)).toEqual(['price_reactivation']);
    expect(detectOpportunities({ ...base, leads: [{ ...l, lostReason: 'Compró otra marca' }], priceDocs: [doc] })).toEqual([]);
  });
});

describe('alertas de datos faltantes', () => {
  const campaign: Campaign = { id: 'c1', organizationId: 'cardys_fiat', platform: 'meta', name: 'Cronos', objective: '', status: 'active', currency: 'ARS' };
  it('detecta cada faltante con conteo y ejemplos', () => {
    const alerts = detectDataAlerts({
      leads: [
        lead({ phoneE164: undefined, email: undefined }),
        lead({ source: 'Meta Ads', createdAt: '2026-11-01T00:00:00Z' }),
      ],
      quotes: [quote({ status: 'draft', createdAt: '2026-10-20T00:00:00Z' })],
      campaigns: [campaign],
      metrics: [{ organizationId: 'cardys_fiat', platform: 'meta', campaignId: 'c1', date: '2026-10-25', currency: 'ARS', spend: 1, impressions: 1, clicks: 1, platformLeads: 4 }],
      now,
    });
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['no_contact_channel', 'unassigned_new', 'missing_attribution', 'stale_metrics', 'ads_without_crm', 'stale_quote_draft']));
    expect(alerts.find((a) => a.kind === 'stale_metrics')!.samples[0]!.label).toMatch(/último dato 2026-10-25/);
  });
  it('sin faltantes no inventa alertas', () => {
    expect(detectDataAlerts({ leads: [lead({ advisorId: 'a' })], quotes: [], campaigns: [], metrics: [], now })).toEqual([]);
  });
});
