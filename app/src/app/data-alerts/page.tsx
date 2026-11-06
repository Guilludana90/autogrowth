'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LeadDrawer } from '@/components/LeadDrawer';
import { downloadFile, PageHead } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { detectDataAlerts } from '@/lib/domain/opportunities';
import { orgName, type Lead } from '@/lib/domain/types';
import { useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const SEVERITY = { high: ['Alta', 'red'], medium: ['Media', 'gold'], low: ['Baja', 'green'] } as const;

/** Faltantes que hacen que los diagnósticos sean menos confiables, con cuántos casos y cómo corregirlos. */
export default function DataAlertsPage() {
  const { org, hrefWithFilters } = useFilters();
  const { leads, quotes, campaigns, metrics } = useScoped(org);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const alerts = useMemo(() => detectDataAlerts({ leads, quotes, campaigns, metrics, now: new Date() }), [campaigns, leads, metrics, quotes]);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  function exportCsv() {
    downloadFile(
      `alertas-datos-${org}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([['Alerta', 'Severidad', 'Casos', 'Por qué importa', 'Cómo corregir', 'Ejemplos'], ...alerts.map((a) => [a.title, a.severity, a.count, a.why, a.fix, a.samples.map((s) => s.label).join(' | ')])]),
    );
  }

  return (
    <>
      <PageHead
        eyebrow="AI Intelligence"
        title="Alertas de datos faltantes"
        sub="Lo que falta cargar para que la conciliación, el CPL real y las recomendaciones sean confiables. Cada alerta indica cuántos casos hay y cómo resolverla."
        actions={<button className="btn secondary" onClick={exportCsv} disabled={!alerts.length}>↓ Exportar CSV</button>}
      />
      {!alerts.length ? (
        <div className="panel empty">No se detectan datos faltantes con las reglas actuales para este concesionario.</div>
      ) : (
        <div className="cards">
          {alerts.map((a) => (
            <section key={a.kind} className="card alert-card" aria-labelledby={`al-${a.kind}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <h3 id={`al-${a.kind}`} style={{ margin: 0 }}>{a.title}</h3>
                <span className={`tag ${SEVERITY[a.severity][1]}`}>Severidad {SEVERITY[a.severity][0].toLowerCase()}</span>
              </div>
              <div className="count">{a.count} {a.count === 1 ? 'caso' : 'casos'}</div>
              <p className="muted" style={{ margin: 0 }}>{a.why}</p>
              <p style={{ margin: 0 }}><strong>Cómo corregir:</strong> {a.fix}</p>
              <ul>
                {a.samples.map((s) => {
                  const lead = a.target === 'lead' ? leadById.get(s.id) : undefined;
                  return (
                    <li key={s.id}>
                      {lead ? (
                        <button className="linklike" onClick={() => setOpenLead(lead)}>{s.label}</button>
                      ) : a.target === 'campaign' ? (
                        <Link className="cell-link" href={hrefWithFilters('/campaigns/view', { id: s.id, corg: s.organizationId })}><strong>{s.label}</strong></Link>
                      ) : (
                        <Link className="cell-link" href={hrefWithFilters('/quotes/view', { id: s.id })}><strong>{s.label}</strong></Link>
                      )}
                      {org === 'all' && <span className="faint"> · {orgName(s.organizationId)}</span>}
                    </li>
                  );
                })}
                {a.count > a.samples.length && <li className="faint">y {a.count - a.samples.length} más</li>}
              </ul>
            </section>
          ))}
        </div>
      )}
      <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} />
    </>
  );
}
