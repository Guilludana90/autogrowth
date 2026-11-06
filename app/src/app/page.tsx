'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { RecommendationCard } from '@/components/RecommendationCard';
import { TrendChart } from '@/components/TrendChart';
import { PageHead, ScoreBadge, Stat, StatusTag } from '@/components/ui';
import { formatDay, inRange } from '@/lib/domain/dates';
import { crmFunnel, derive, formatMoney, formatNumber, formatPercent, metricsInRange, sumMetrics } from '@/lib/domain/metrics';
import { analyzeCampaign } from '@/lib/domain/recommendations';
import { dailyBreakdown, missingMetricDays, reconcile } from '@/lib/domain/reconcile';
import { taskCounts } from '@/lib/domain/tasks';
import { orgName, PLATFORM_LABEL } from '@/lib/domain/types';
import { useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export default function CommandCenter() {
  const { org, range, channel, hrefWithFilters } = useFilters();
  const { leads, campaigns, metrics, tasks, quotes } = useScoped(org, channel);
  const tc = taskCounts(tasks);
  const pendingQuotes = quotes.filter((q) => q.status === 'pending_approval').length;

  const view = useMemo(() => {
    const rows = metricsInRange(metrics, range);
    const ads = derive(sumMetrics(rows));
    const leadsInRange = leads.filter((l) => inRange(l.createdAt, range));
    const funnel = crmFunnel(leadsInRange);
    const attributed = leadsInRange.filter((l) => l.campaignId).length;
    const now = new Date().toISOString();
    const recs = campaigns
      .map((c) => ({
        campaign: c,
        rec: analyzeCampaign(c, rows.filter((r) => r.campaignId === c.id), leadsInRange.filter((l) => l.campaignId === c.id), now),
      }))
      .filter((x) => x.rec.evidence.some((e) => e.metric === 'spend' && Number(e.value) > 0))
      .sort((a, b) => PRIORITY_RANK[a.rec.priority] - PRIORITY_RANK[b.rec.priority]);
    const unassigned = leadsInRange.filter((l) => !l.advisorId && l.status === 'new');
    const perCampaign = campaigns.map((c) => {
      const mr = rows.filter((r) => r.organizationId === c.organizationId && r.campaignId === c.id);
      const cl = leadsInRange.filter((l) => l.organizationId === c.organizationId && l.campaignId === c.id);
      return { c, gap: reconcile(sumMetrics(mr).platformLeads, cl.length), missing: missingMetricDays(dailyBreakdown(range, mr, [])).length };
    });
    const leaking = perCampaign.filter((x) => x.gap.level === 'alert');
    const missingDays = perCampaign.reduce((a, x) => a + x.missing, 0);
    const lastMetric = metrics.map((m) => m.date).sort().pop();
    const hot = [...leadsInRange].filter((l) => l.status !== 'won' && l.status !== 'lost').sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6);
    return { rows, ads, leadsInRange, funnel, attributed, recs, unassigned, hot, leaking, missingDays, lastMetric };
  }, [campaigns, leads, metrics, range]);

  const top = view.recs[0];
  const currency = campaigns[0]?.currency ?? 'ARS';
  const gap = view.ads.platformLeads - view.attributed;

  return (
    <>
      <PageHead
        eyebrow="The genetics of your strategy"
        title={org === 'all' ? 'Command Center' : orgName(org)}
        sub={`Del ${formatDay(range.from)} al ${formatDay(range.to)}${channel === 'all' ? '' : ` · solo ${PLATFORM_LABEL[channel]}`} · pauta, leads y resultados comerciales en la misma ventana`}
      />
      <div className="stats">
        <Stat
          label="Inversión en Ads"
          value={formatMoney(view.ads.spend, currency)}
          hint={`${view.rows.length} filas diarias · métricas hasta ${view.lastMetric ? formatDay(view.lastMetric) : '—'}`}
        />
        <Stat label="Leads informados por Ads" value={formatNumber(view.ads.platformLeads)} hint={`CPL ${formatMoney(view.ads.cpl, currency)} · CTR ${formatPercent(view.ads.ctr, 2)}`} />
        <Stat
          label="Leads en CRM"
          value={formatNumber(view.funnel.crmLeads)}
          hint={`${view.attributed} atribuidos a campañas${gap > 0 ? ` · ${gap} de Ads sin registrar` : ''}`}
        />
        <Stat
          label="Contactados / ganados"
          value={`${view.funnel.contacted} / ${view.funnel.won}`}
          hint={`Contacto ${formatPercent(view.funnel.contactRate, 0)} · cierre ${formatPercent(view.funnel.closeRate, 0)}`}
        />
      </div>

      <div className="grid-2">
        <section className="panel" aria-labelledby="trend">
          <div className="panel-head">
            <h2 id="trend">Ads vs. CRM</h2>
            <span className="faint">La diferencia entre barras es la fuga de leads a medir</span>
          </div>
          <TrendChart range={range} metrics={view.rows} leads={view.leadsInRange} />
        </section>
        <section className="panel" aria-labelledby="recs">
          <div className="panel-head">
            <h2 id="recs">AI Growth Recommendations</h2>
            <Link className="btn secondary sm" href={hrefWithFilters('/campaigns')}>Ver todas →</Link>
          </div>
          {top ? <RecommendationCard campaign={top.campaign} rec={top.rec} compact /> : <div className="empty">Sin campañas con inversión en el período.</div>}
        </section>
      </div>

      <div className="grid-2">
        <section className="panel" aria-labelledby="hot">
          <div className="panel-head">
            <h2 id="hot">Leads prioritarios abiertos</h2>
            <Link className="btn secondary sm" href={hrefWithFilters('/leads')}>Ver todos →</Link>
          </div>
          {view.hot.length === 0 ? (
            <div className="empty">No hay leads abiertos en el período.</div>
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: 520 }}>
                <thead><tr><th>Contacto</th><th>Interés</th><th>Score</th><th>Estado</th></tr></thead>
                <tbody>
                  {view.hot.map((l) => (
                    <tr key={l.id}>
                      <td><strong>{l.name}</strong><div className="faint">{orgName(l.organizationId)}</div></td>
                      <td>{l.modelInterest ?? '—'}</td>
                      <td><ScoreBadge score={l.score} reason={l.scoreReason} /></td>
                      <td><StatusTag status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="alerts">
          <div className="panel-head"><h2 id="alerts">Alertas operativas</h2></div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10 }}>
            <li>
              <b>{view.unassigned.length}</b> leads nuevos sin asesor asignado.{' '}
              {view.unassigned.length > 0 && <Link className="star" href={hrefWithFilters('/leads') + (hrefWithFilters('/leads').includes('?') ? '&' : '?') + 'advisor=none'}>Asignar →</Link>}
            </li>
            <li>
              <b>{gap > 0 ? gap : 0}</b> leads informados por Ads no tienen correspondencia en el CRM
              {view.leaking.length > 0 && (
                <>
                  {' '}· <b className="due-overdue">{view.leaking.length}</b> {view.leaking.length === 1 ? 'campaña' : 'campañas'} con fuga (&gt;25%): {view.leaking.slice(0, 2).map((x) => x.c.name).join(', ')}
                  {view.leaking.length > 2 ? '…' : ''}{' '}
                  <Link className="star" href={hrefWithFilters('/campaigns')}>Ver →</Link>
                </>
              )}
              .
            </li>
            <li>
              <b>{view.missingDays}</b> días sin métricas importadas dentro del período en campañas con datos.{' '}
              {view.missingDays > 0 && <Link className="star" href={hrefWithFilters('/integrations')}>Importar →</Link>}
            </li>
            <li>
              <b>{view.leadsInRange.filter((l) => !l.phoneE164).length}</b> leads sin teléfono válido.
            </li>
            <li>
              <b className={tc.overdue ? 'due-overdue' : undefined}>{tc.overdue}</b> tareas vencidas y <b>{tc.today}</b> para hoy.{' '}
              <Link className="star" href={hrefWithFilters('/tasks')}>Ver tareas →</Link>
            </li>
            <li>
              <b>{pendingQuotes}</b> cotizaciones esperando aprobación de gerencia.{' '}
              {pendingQuotes > 0 && <Link className="star" href={hrefWithFilters('/quotes')}>Revisar →</Link>}
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
