'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { RecommendationCard } from '@/components/RecommendationCard';
import { TrendChart } from '@/components/TrendChart';
import { downloadFile, PageHead, Stat } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { formatDay, inRange } from '@/lib/domain/dates';
import { crmFunnel, derive, formatMoney, formatNumber, formatPercent, metricsInRange, safeRatio, sumMetrics } from '@/lib/domain/metrics';
import { analyzeCampaign } from '@/lib/domain/recommendations';
import { dailyBreakdown, GAP_LABEL, missingMetricDays, reconcile } from '@/lib/domain/reconcile';
import { isOrganizationId, orgName, PLATFORM_LABEL } from '@/lib/domain/types';
import { useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

/** Detalle de campaña: KPIs reproducibles, conciliación Ads/CRM y desglose diario exportable. */
export default function CampaignView() {
  const params = useSearchParams();
  const id = params.get('id');
  const corg = params.get('corg');
  const { org, range, hrefWithFilters } = useFilters();
  const { campaigns, metrics, leads } = useScoped(org);
  const c = campaigns.find((x) => x.id === id && (!isOrganizationId(corg) || x.organizationId === corg));

  const view = useMemo(() => {
    if (!c) return null;
    const rows = metricsInRange(metrics, range).filter((m) => m.organizationId === c.organizationId && m.platform === c.platform && m.campaignId === c.id);
    const cl = leads.filter((l) => l.organizationId === c.organizationId && l.campaignId === c.id && inRange(l.createdAt, range));
    const m = derive(sumMetrics(rows));
    const f = crmFunnel(cl);
    const daily = dailyBreakdown(range, rows, cl);
    const lastData = [...metrics].filter((x) => x.organizationId === c.organizationId && x.campaignId === c.id).map((x) => x.date).sort().pop();
    return {
      rows,
      cl,
      m,
      f,
      gap: reconcile(m.platformLeads, f.crmLeads),
      daily,
      missing: missingMetricDays(daily),
      crmCpl: safeRatio(m.spend, f.crmLeads),
      costPerWon: safeRatio(m.spend, f.won),
      lastData,
      rec: analyzeCampaign(c, rows, cl, new Date().toISOString(), range),
    };
  }, [c, leads, metrics, range]);

  if (!c || !view) {
    return (
      <div className="notice warn">
        No encontramos la campaña o no tenés acceso con el concesionario elegido. <Link href={hrefWithFilters('/campaigns')}>Volver a campañas</Link>
      </div>
    );
  }

  const [gl, gt] = GAP_LABEL[view.gap.level];

  function exportDaily() {
    downloadFile(
      `campania-${c!.id}-${range.from}_${range.to}.csv`,
      toCsv([
        ['Día', 'Campaña', 'ID', 'Plataforma', 'Moneda', 'Inversión', 'Impresiones', 'Clics', 'Leads Ads', 'Leads CRM', 'Diferencia', 'Métricas importadas'],
        ...view!.daily.map((d) => [d.date, c!.name, c!.id, PLATFORM_LABEL[c!.platform], c!.currency, d.spend.toFixed(2), d.impressions, d.clicks, d.adsLeads, d.crmLeads, d.adsLeads - d.crmLeads, d.hasMetrics ? 'sí' : 'no']),
      ]),
    );
  }

  return (
    <>
      <PageHead
        eyebrow={`${PLATFORM_LABEL[c.platform]} · ${orgName(c.organizationId)}`}
        title={c.name}
        sub={`ID ${c.id} · ${c.objective || 'sin objetivo informado'} · ${c.status === 'active' ? 'Activa' : 'Pausada'} · del ${formatDay(range.from)} al ${formatDay(range.to)}`}
        actions={
          <>
            <Link className="btn ghost" href={hrefWithFilters('/campaigns')}>← Campañas</Link>
            <button className="btn secondary" onClick={exportDaily}>↓ Exportar desglose diario</button>
          </>
        }
      />
      <div className="stats">
        <Stat label="Inversión" value={formatMoney(view.m.spend, c.currency)} hint={`${view.rows.length} días con métricas · CTR ${formatPercent(view.m.ctr, 2)}`} />
        <Stat label="Leads Ads" value={formatNumber(view.m.platformLeads)} hint={`CPL plataforma ${formatMoney(view.m.cpl, c.currency)}`} />
        <Stat label="Leads CRM" value={formatNumber(view.f.crmLeads)} hint={`CPL real ${formatMoney(view.crmCpl, c.currency)}`} />
        <Stat label="Ganados" value={formatNumber(view.f.won)} hint={`Costo por venta ${formatMoney(view.costPerWon, c.currency)}`} />
      </div>

      <div className={`notice ${view.gap.level === 'alert' ? 'error' : view.gap.level === 'warn' ? 'warn' : ''}`} role="status">
        <span className={`tag ${gt}`}>{gl}</span> {view.gap.message}
        {view.missing.length > 0 && (
          <> · Faltan métricas de {view.missing.length} {view.missing.length === 1 ? 'día' : 'días'} dentro del período ({view.missing.slice(0, 3).map(formatDay).join(', ')}{view.missing.length > 3 ? '…' : ''}).</>
        )}
        {view.lastData ? <> · Última métrica importada: {formatDay(view.lastData)}.</> : <> · Sin métricas importadas.</>}
      </div>

      <div className="grid-2">
        <section className="panel" aria-labelledby="ctrend">
          <div className="panel-head">
            <h2 id="ctrend">Ads vs. CRM por día</h2>
          </div>
          <TrendChart range={range} metrics={view.rows} leads={view.cl} />
        </section>
        <section className="panel" aria-labelledby="cdiag">
          <div className="panel-head"><h2 id="cdiag">Diagnóstico</h2></div>
          <RecommendationCard campaign={c} rec={view.rec} compact />
        </section>
      </div>

      <section className="panel" aria-labelledby="cdaily">
        <div className="panel-head">
          <h2 id="cdaily">Desglose diario</h2>
          <span className="faint">Los días sin fila importada se marcan; no se completan con estimaciones.</span>
        </div>
        <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>Día</th><th className="num">Inversión</th><th className="num">Impr.</th><th className="num">Clics</th><th className="num">Leads Ads</th><th className="num">Leads CRM</th><th className="num">Diferencia</th></tr>
            </thead>
            <tbody>
              {[...view.daily].reverse().map((d) => (
                <tr key={d.date} className={d.hasMetrics ? undefined : 'row-muted'}>
                  <td>{formatDay(d.date)}{!d.hasMetrics && <span className="faint"> · sin métricas</span>}</td>
                  <td className="num">{d.hasMetrics ? formatMoney(d.spend, c.currency) : '—'}</td>
                  <td className="num">{d.hasMetrics ? formatNumber(d.impressions) : '—'}</td>
                  <td className="num">{d.hasMetrics ? formatNumber(d.clicks) : '—'}</td>
                  <td className="num">{d.hasMetrics ? formatNumber(d.adsLeads) : '—'}</td>
                  <td className="num">{formatNumber(d.crmLeads)}</td>
                  <td className="num">{d.hasMetrics ? formatNumber(d.adsLeads - d.crmLeads) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
