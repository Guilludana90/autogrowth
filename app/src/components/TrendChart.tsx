'use client';

import { eachDay, inRange, parseDay } from '@/lib/domain/dates';
import type { CampaignMetricsDaily, DateRange, Lead } from '@/lib/domain/types';

interface Bucket {
  label: string;
  from: string;
  platform: number;
  crm: number;
}

/** Agrupa por día (≤ 31 días) o por semana para que el gráfico siga legible en rangos largos. */
export function bucketize(range: DateRange, metrics: readonly CampaignMetricsDaily[], leads: readonly Lead[]): Bucket[] {
  const days = eachDay(range);
  const step = days.length <= 31 ? 1 : 7;
  const buckets: Bucket[] = [];
  for (let i = 0; i < days.length; i += step) {
    const from = days[i]!;
    const to = days[Math.min(i + step - 1, days.length - 1)]!;
    const r = { from, to };
    const d = parseDay(from);
    buckets.push({
      label: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
      from,
      platform: metrics.filter((m) => inRange(m.date, r)).reduce((a, m) => a + m.platformLeads, 0),
      crm: leads.filter((l) => inRange(l.createdAt, r)).length,
    });
  }
  return buckets;
}

export function TrendChart({ range, metrics, leads }: { range: DateRange; metrics: readonly CampaignMetricsDaily[]; leads: readonly Lead[] }) {
  const data = bucketize(range, metrics, leads);
  const max = Math.max(1, ...data.flatMap((b) => [b.platform, b.crm]));
  const W = 640;
  const H = 200;
  const pad = 22;
  const bw = (W - pad) / data.length;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const labelEvery = Math.ceil(data.length / 12);
  const totalP = data.reduce((a, b) => a + b.platform, 0);
  const totalC = data.reduce((a, b) => a + b.crm, 0);

  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Leads de plataforma (${totalP}) y leads registrados en CRM (${totalC}) entre ${range.from} y ${range.to}`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="1" />
        ))}
        <text x="0" y={y(max) + 4} fill="var(--faint)" fontSize="10">{max}</text>
        {data.map((b, i) => {
          const x = pad + i * bw;
          const w = Math.max(1.5, bw * 0.38);
          return (
            <g key={b.from}>
              <title>{`${b.label}: ${b.platform} leads plataforma · ${b.crm} en CRM`}</title>
              <rect x={x + bw * 0.1} y={y(b.platform)} width={w} height={H - pad - y(b.platform)} rx="2" fill="var(--indigo)" />
              <rect x={x + bw * 0.1 + w + 1} y={y(b.crm)} width={w} height={H - pad - y(b.crm)} rx="2" fill="var(--champagne)" />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} fill="var(--faint)" fontSize="10" textAnchor="middle">{b.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        <span><i style={{ background: 'var(--indigo)' }} />Leads informados por Ads ({totalP})</span>
        <span><i style={{ background: 'var(--champagne)' }} />Leads registrados en CRM ({totalC})</span>
        <span>{eachDay(range).length > 31 ? 'Agrupado por semana' : 'Por día'}</span>
      </figcaption>
    </figure>
  );
}
