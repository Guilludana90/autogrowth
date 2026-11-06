import { describe, expect, it } from 'vitest';
import { detectPlatform, parseLocaleNumber, parseMetricDate, previewMetricImport, type MetricImportPreview } from '@/lib/domain/metricImport';
import type { CampaignMetricsDaily } from '@/lib/domain/types';

const base = { organizationId: 'cardys_fiat' as const, existing: [] as CampaignMetricsDaily[], knownCampaignIds: new Set<string>(), today: '2026-11-06' };
const ok = (r: ReturnType<typeof previewMetricImport>) => {
  if ('fatal' in r) throw new Error(r.fatal);
  return r as MetricImportPreview;
};

const META_ES = [
  'Nombre de la campaña,Identificador de la campaña,Día,Importe gastado (ARS),Impresiones,Clics en el enlace,Clientes potenciales',
  'Cronos Leads,120001,2026-10-01,"15.000,50",12000,300,25',
  'Cronos Leads,120001,2026-10-02,"14.000",11000,280,',
  'Pulse Tráfico,120002,2026-10-01,"8.000,00",9000,150,3',
].join('\n');

describe('parseo de valores', () => {
  it('lee números en formato argentino y estadounidense, con 0 permitido', () => {
    expect(parseLocaleNumber('15.000,50')).toBe(15000.5);
    expect(parseLocaleNumber('1,234.5')).toBe(1234.5);
    expect(parseLocaleNumber('12.000')).toBe(12000);
    expect(parseLocaleNumber('0')).toBe(0);
    expect(parseLocaleNumber('')).toBe(0);
    expect(parseLocaleNumber('--')).toBe(0);
    expect(parseLocaleNumber('abc')).toBeUndefined();
    expect(parseLocaleNumber('-5')).toBe(-5);
  });
  it('lee fechas ISO y DD/MM/AAAA', () => {
    expect(parseMetricDate('2026-10-01')).toBe('2026-10-01');
    expect(parseMetricDate('1/10/2026')).toBe('2026-10-01');
    expect(parseMetricDate('31/02/2026')).toBeUndefined();
    expect(parseMetricDate('octubre')).toBeUndefined();
  });
  it('detecta Meta y Google por encabezados', () => {
    expect(detectPlatform(['Nombre de la campaña', 'Importe gastado (ARS)'])).toBe('meta');
    expect(detectPlatform(['Campaign', 'Day', 'Cost', 'Impr.', 'Clicks'])).toBe('google');
    expect(detectPlatform(['a', 'b'])).toBeUndefined();
  });
});

describe('vista previa de importación de métricas', () => {
  it('normaliza una exportación de Meta en español', () => {
    const p = ok(previewMetricImport(META_ES, base));
    expect(p.platform).toBe('meta');
    expect(p.counts).toMatchObject({ create: 3, update: 0, unchanged: 0, error: 0 });
    const first = p.outcomes[0]!.metric;
    expect(first).toMatchObject({ campaignId: '120001', date: '2026-10-01', currency: 'ARS', spend: 15000.5, impressions: 12000, clicks: 300, platformLeads: 25 });
    expect(p.newCampaigns.map((c) => c.name)).toEqual(['Cronos Leads', 'Pulse Tráfico']);
    expect(p.range).toEqual({ from: '2026-10-01', to: '2026-10-02' });
  });

  it('es idempotente: lo ya importado queda sin cambios y las correcciones se marcan', () => {
    const first = ok(previewMetricImport(META_ES, base));
    const existing = first.outcomes.map((o) => o.metric);
    existing[1] = { ...existing[1]!, spend: 1 };
    const again = ok(previewMetricImport(META_ES, { ...base, existing, knownCampaignIds: new Set(['120001', '120002']) }));
    expect(again.counts).toMatchObject({ create: 0, update: 1, unchanged: 2 });
    expect(again.newCampaigns).toEqual([]);
  });

  it('suma filas de la misma campaña y día (exportación por anuncio)', () => {
    const csv = ['Campaign ID,Campaign name,Day,Amount spent (USD),Impressions,Link clicks,Leads', '9,A,2026-10-01,10,100,5,1', '9,A,2026-10-01,5.5,50,2,1'].join('\n');
    const p = ok(previewMetricImport(csv, base));
    expect(p.outcomes).toHaveLength(1);
    expect(p.outcomes[0]!.metric).toMatchObject({ spend: 15.5, impressions: 150, clicks: 7, platformLeads: 2, currency: 'USD' });
    expect(p.counts.merged).toBe(1);
  });

  it('marca errores por fila sin frenar el resto', () => {
    const csv = [
      'Campaign ID,Campaign name,Day,Amount spent (ARS),Impressions,Link clicks,Leads',
      '1,A,2026-10-01,10,100,5,1',
      '1,A,fecha,10,100,5,1',
      '1,A,2026-12-31,10,100,5,1',
      '1,A,2026-10-02,-3,100,5,1',
      '1,A,2026-10-03,10,10.5,5,1',
      ',,2026-10-04,10,100,5,1',
    ].join('\n');
    const p = ok(previewMetricImport(csv, base));
    expect(p.counts.create).toBe(1);
    expect(p.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(p.errors[1]!.message).toMatch(/futura/);
    expect(p.errors[2]!.message).toMatch(/inversión inválido/);
  });

  it('rechaza filas que cubren varios días', () => {
    const csv = ['Reporting starts,Reporting ends,Campaign ID,Campaign name,Amount spent (ARS),Impressions,Link clicks,Leads', '2026-10-01,2026-10-31,1,A,10,100,5,1'].join('\n');
    const p = ok(previewMetricImport(csv, base));
    expect(p.errors[0]!.message).toMatch(/desglose por día/);
  });

  it('lee Google Ads e ignora la fila de total', () => {
    const csv = ['Campaign,Campaign ID,Day,Currency code,Cost,Impr.,Clicks,Conversions', 'Search Fiat,555,2026-10-01,ARS,"1,200.00","3,000",90,4', 'Total: Campaigns,,,,"1,200.00","3,000",90,4'].join('\n');
    const p = ok(previewMetricImport(csv, base));
    expect(p.platform).toBe('google');
    expect(p.outcomes).toHaveLength(1);
    expect(p.outcomes[0]!.metric).toMatchObject({ spend: 1200, impressions: 3000, clicks: 90, platformLeads: 4 });
  });

  it('identifica por nombre cuando no hay ID y avisa', () => {
    const csv = ['Campaign name,Day,Amount spent (ARS),Impressions,Link clicks', 'Mi Campaña Ñandú,2026-10-01,10,100,5'].join('\n');
    const p = ok(previewMetricImport(csv, { ...base, platform: 'meta' }));
    expect(p.outcomes[0]!.metric.campaignId).toBe('name:mi-campana-nandu');
    expect(p.warnings.join(' ')).toMatch(/sin ID/);
    expect(p.warnings.join(' ')).toMatch(/leads/);
  });

  it('errores fatales: archivo vacío o columnas faltantes', () => {
    expect(previewMetricImport('', base)).toEqual({ fatal: 'El archivo no tiene filas de datos.' });
    const r = previewMetricImport('Campaign ID,Day\n1,2026-10-01', { ...base, platform: 'meta' });
    expect('fatal' in r && r.fatal).toMatch(/inversión, impresiones, clics/);
  });
});
