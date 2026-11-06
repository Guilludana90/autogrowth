'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { MetricImportDialog } from '@/components/MetricImportDialog';
import { RecommendationCard } from '@/components/RecommendationCard';
import { downloadFile, PageHead } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { inRange } from '@/lib/domain/dates';
import { crmFunnel, derive, formatMoney, formatNumber, formatPercent, metricsInRange, sumMetrics } from '@/lib/domain/metrics';
import { analyzeCampaign } from '@/lib/domain/recommendations';
import { GAP_LABEL, reconcile } from '@/lib/domain/reconcile';
import { PLATFORM_LABEL, orgName } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

type SortKey = 'name' | 'spend' | 'platformLeads' | 'crmLeads' | 'gap' | 'cpl' | 'ctr';
const PRIORITY_LABEL = { high: ['Alta', 'red'], medium: ['Media', 'gold'], low: ['Baja', 'green'] } as const;

export default function CampaignsPage() {
  const app = useApp();
  const { org, range, channel, hrefWithFilters } = useFilters();
  const { campaigns, metrics, leads } = useScoped(org, channel);
  const [importing, setImporting] = useState(false);
  const canImport = app.allowed('campaign:import', org);
  const [status, setStatus] = useState<'all' | 'active' | 'paused'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 });
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const now = new Date().toISOString();
    const inPeriod = metricsInRange(metrics, range);
    const leadsInPeriod = leads.filter((l) => inRange(l.createdAt, range));
    return campaigns
      .filter((c) => status === 'all' || c.status === status)
      .map((c) => {
        const mrows = inPeriod.filter((m) => m.campaignId === c.id);
        const cl = leadsInPeriod.filter((l) => l.campaignId === c.id);
        const m = derive(sumMetrics(mrows));
        const f = crmFunnel(cl);
        return { c, m, f, gap: reconcile(m.platformLeads, f.crmLeads), rec: analyzeCampaign(c, mrows, cl, now, range) };
      })
      .sort((a, b) => {
        const v = (x: typeof a) =>
          sort.key === 'name' ? x.c.name : sort.key === 'crmLeads' ? x.f.crmLeads : sort.key === 'gap' ? (x.gap.gapPct ?? -Infinity) : (x.m[sort.key] ?? -Infinity);
        const av = v(a);
        const bv = v(b);
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
  }, [campaigns, leads, metrics, range, sort, status]);

  const total = derive(sumMetrics(metricsInRange(metrics, range).filter((m) => rows.some((r) => r.c.id === m.campaignId))));
  const open = rows.find((r) => r.c.id === openId);

  const th = (key: SortKey, label: string, num = true) => (
    <th className={num ? 'num' : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
        {label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}
      </button>
    </th>
  );

  function exportCsv() {
    downloadFile(
      `campanias-${org}-${range.from}_${range.to}.csv`,
      toCsv([
        ['Campaña', 'ID', 'Concesionario', 'Plataforma', 'Estado', 'Moneda', 'Desde', 'Hasta', 'Inversión', 'Impresiones', 'Clics', 'Leads plataforma', 'Leads CRM', 'Diferencia Ads-CRM', 'Diferencia %', 'Conciliación', 'Contactados', 'Ganados', 'CPL', 'CTR %', 'CPC', 'CPM', 'Prioridad'],
        ...rows.map(({ c, m, f, gap, rec }) => [c.name, c.id, orgName(c.organizationId), PLATFORM_LABEL[c.platform], c.status, c.currency, range.from, range.to, m.spend, m.impressions, m.clicks, m.platformLeads, f.crmLeads, gap.gap, gap.gapPct?.toFixed(1), GAP_LABEL[gap.level][0], f.contacted, f.won, m.cpl?.toFixed(2), m.ctr?.toFixed(2), m.cpc?.toFixed(2), m.cpm?.toFixed(2), rec.priority]),
      ]),
    );
  }

  const currency = campaigns[0]?.currency ?? 'ARS';

  return (
    <>
      <PageHead
        eyebrow="Campaign ledger"
        title="Campaign Intelligence"
        sub="Métricas de plataforma y resultados del CRM en la misma ventana de tiempo"
        actions={
          <>
            {canImport && <button className="btn secondary" onClick={() => setImporting(true)}>↑ Importar métricas</button>}
            <button className="btn secondary" onClick={exportCsv} disabled={!rows.length}>↓ Exportar métricas</button>
          </>
        }
      />
      <div className="notice">
        {app.demo
          ? 'Datos de demostración generados localmente. No hay conexión activa con Meta ni Google Ads: las métricas entran por CSV.'
          : 'Las métricas vienen de los lotes importados (CSV o sincronización de Meta). Revisá el estado en Canales conectados.'}{' '}
        <Link className="star" href={hrefWithFilters('/integrations')}>Ver fuentes de datos →</Link>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="field" aria-label="Estado de campaña" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">Activas y pausadas</option>
              <option value="active">Activas</option>
              <option value="paused">Pausadas</option>
            </select>
          </div>
          <span className="faint">
            {rows.length} campañas · {formatMoney(total.spend, currency)} · CPL {formatMoney(total.cpl, currency)}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {th('name', 'Campaña', false)}
                <th>Plataforma</th>
                {th('spend', 'Inversión')}
                {th('platformLeads', 'Leads Ads')}
                {th('crmLeads', 'Leads CRM')}
                {th('gap', 'Ads vs CRM')}
                {th('cpl', 'CPL')}
                {th('ctr', 'CTR')}
                <th>Prioridad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, m, f, gap, rec }) => {
                const [pl, tone] = PRIORITY_LABEL[rec.priority];
                const [gl, gt] = GAP_LABEL[gap.level];
                return (
                  <tr key={c.id}>
                    <td>
                      <Link className="cell-link" href={hrefWithFilters('/campaigns/view', { id: c.id, corg: c.organizationId })}><strong>{c.name}</strong></Link>
                      <div className="faint">{orgName(c.organizationId)} · {c.objective} · {c.status === 'active' ? 'Activa' : 'Pausada'}</div>
                    </td>
                    <td><span className="tag">{PLATFORM_LABEL[c.platform]}</span></td>
                    <td className="num">{formatMoney(m.spend, c.currency)}</td>
                    <td className="num">{formatNumber(m.platformLeads)}</td>
                    <td className="num">{formatNumber(f.crmLeads)}</td>
                    <td title={gap.message}>
                      <span className={`tag ${gt}`}>{gl}</span>
                      {gap.gapPct !== null && gap.level !== 'ok' && <div className="faint">{gap.gap > 0 ? '−' : '+'}{formatNumber(Math.abs(gap.gap))} ({formatPercent(Math.abs(gap.gapPct), 0)})</div>}
                    </td>
                    <td className="num">{formatMoney(m.cpl, c.currency)}</td>
                    <td className="num">{formatPercent(m.ctr, 2)}</td>
                    <td><span className={`tag ${tone}`}>{pl}</span></td>
                    <td className="num"><button className="btn secondary sm" onClick={() => setOpenId(c.id)}>Analizar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No hay campañas con estos filtros.</div>}
        </div>
      </section>
      <MetricImportDialog open={importing} onClose={() => setImporting(false)} org={org} />
      <Dialog open={!!open} title="Diagnóstico de campaña" onClose={() => setOpenId(null)} wide>
        {open && <RecommendationCard campaign={open.c} rec={open.rec} />}
      </Dialog>
    </>
  );
}
