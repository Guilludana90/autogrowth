'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { downloadFile, PageHead } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { formatDay, inRange } from '@/lib/domain/dates';
import { crmFunnel, derive, formatMoney, formatNumber, formatPercent, metricsInRange, safeRatio, sumMetrics } from '@/lib/domain/metrics';
import { GAP_LABEL, leadsByChannel, reconcile } from '@/lib/domain/reconcile';
import { ORGANIZATIONS, PLATFORM_LABEL, orgName, type Platform } from '@/lib/domain/types';
import { useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

/** Comparativa por canal y concesionario en la misma ventana: pauta, leads de plataforma, leads del CRM y ventas. */
export default function ChannelsPage() {
  const { org, range, hrefWithFilters } = useFilters();
  const { campaigns, metrics, leads } = useScoped(org);

  const rows = useMemo(() => {
    const inPeriod = metricsInRange(metrics, range);
    const leadsIn = leads.filter((l) => inRange(l.createdAt, range));
    const platforms = [...new Set(campaigns.map((c) => c.platform))] as Platform[];
    const out = [];
    for (const o of ORGANIZATIONS) {
      if (org !== 'all' && o.id !== org) continue;
      for (const p of platforms) {
        const cs = campaigns.filter((c) => c.organizationId === o.id && c.platform === p);
        if (!cs.length) continue;
        const m = derive(sumMetrics(inPeriod.filter((x) => x.organizationId === o.id && x.platform === p)));
        const f = crmFunnel(leadsByChannel(leadsIn.filter((l) => l.organizationId === o.id), cs, p));
        out.push({ org: o.id, platform: p, currency: cs[0]!.currency, campaigns: cs.length, m, f, gap: reconcile(m.platformLeads, f.crmLeads), crmCpl: safeRatio(m.spend, f.crmLeads), perWon: safeRatio(m.spend, f.won) });
      }
    }
    return out;
  }, [campaigns, leads, metrics, org, range]);

  const unattributed = leads.filter((l) => inRange(l.createdAt, range) && !l.campaignId).length;

  function exportCsv() {
    downloadFile(
      `canales-${org}-${range.from}_${range.to}.csv`,
      toCsv([
        ['Concesionario', 'Canal', 'Campañas', 'Inversión', 'Impresiones', 'Clics', 'CTR %', 'Leads Ads', 'Leads CRM', 'Diferencia', 'Conciliación', 'CPL plataforma', 'CPL real', 'Ganados', 'Costo por venta'],
        ...rows.map((r) => [orgName(r.org), PLATFORM_LABEL[r.platform], r.campaigns, r.m.spend.toFixed(2), r.m.impressions, r.m.clicks, r.m.ctr?.toFixed(2), r.m.platformLeads, r.f.crmLeads, r.gap.gap, GAP_LABEL[r.gap.level][0], r.m.cpl?.toFixed(2), r.crmCpl?.toFixed(2), r.f.won, r.perWon?.toFixed(2)]),
      ]),
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Campañas"
        title="Métricas por canal"
        sub={`Del ${formatDay(range.from)} al ${formatDay(range.to)} · cada concesionario por separado, sin mezclar monedas ni cuentas`}
        actions={<button className="btn secondary" onClick={exportCsv} disabled={!rows.length}>↓ Exportar</button>}
      />
      <section className="panel">
        {rows.length === 0 ? (
          <div className="empty">
            No hay campañas para este filtro. <Link className="star" href={hrefWithFilters('/integrations')}>Importar métricas →</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Concesionario</th><th>Canal</th><th className="num">Inversión</th><th className="num">CTR</th><th className="num">Leads Ads</th>
                  <th className="num">Leads CRM</th><th>Ads vs CRM</th><th className="num">CPL plataforma</th><th className="num">CPL real</th><th className="num">Ganados</th><th className="num">Costo por venta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [gl, gt] = GAP_LABEL[r.gap.level];
                  return (
                    <tr key={`${r.org}|${r.platform}`}>
                      <td>{orgName(r.org)}</td>
                      <td>
                        <Link className="cell-link" href={hrefWithFilters('/campaigns', { org: r.org, ch: r.platform })}><strong>{PLATFORM_LABEL[r.platform]}</strong></Link>
                        <div className="faint">{r.campaigns} campañas</div>
                      </td>
                      <td className="num">{formatMoney(r.m.spend, r.currency)}</td>
                      <td className="num">{formatPercent(r.m.ctr, 2)}</td>
                      <td className="num">{formatNumber(r.m.platformLeads)}</td>
                      <td className="num">{formatNumber(r.f.crmLeads)}</td>
                      <td title={r.gap.message}><span className={`tag ${gt}`}>{gl}</span></td>
                      <td className="num">{formatMoney(r.m.cpl, r.currency)}</td>
                      <td className="num">{formatMoney(r.crmCpl, r.currency)}</td>
                      <td className="num">{formatNumber(r.f.won)}</td>
                      <td className="num">{formatMoney(r.perWon, r.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint" style={{ marginBottom: 0 }}>
          CPL real = inversión ÷ leads que llegaron al CRM. {unattributed} leads del período no tienen campaña asignada y no se cuentan en ningún canal.
        </p>
      </section>
    </>
  );
}
