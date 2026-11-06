'use client';

import { useMemo, useState } from 'react';
import { LeadDrawer } from '@/components/LeadDrawer';
import { TaskFormDialog } from '@/components/TaskFormDialog';
import { downloadFile, PageHead, Stat } from '@/components/ui';
import { toCsv } from '@/lib/domain/csv';
import { formatDay } from '@/lib/domain/dates';
import { detectOpportunities, OPPORTUNITY_LABEL, type OpportunityKind } from '@/lib/domain/opportunities';
import { orgName, type Lead } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const PRIORITY = { high: ['Alta', 'red'], medium: ['Media', 'gold'], low: ['Baja', 'green'] } as const;

/** Oportunidades detectadas solo con lo registrado en el CRM (leads, tareas, cotizaciones y listas de precios). */
export default function OpportunitiesPage() {
  const app = useApp();
  const { org } = useFilters();
  const { leads, tasks, quotes, priceDocs } = useScoped(org);
  const [kind, setKind] = useState<OpportunityKind | 'all'>('all');
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [taskFor, setTaskFor] = useState<Lead | null>(null);
  const [limit, setLimit] = useState(50);

  const all = useMemo(() => detectOpportunities({ leads, tasks, quotes, priceDocs, now: new Date() }), [leads, priceDocs, quotes, tasks]);
  const shown = all.filter((o) => kind === 'all' || o.kind === kind);
  const count = (k: OpportunityKind) => all.filter((o) => o.kind === k).length;
  const leadById = new Map(leads.map((l) => [l.id, l]));

  function exportCsv() {
    downloadFile(
      `oportunidades-${org}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([['Tipo', 'Prioridad', 'Concesionario', 'Lead', 'Detalle', 'Evidencia', 'Desde'], ...shown.map((o) => [o.title, o.priority, orgName(o.organizationId), o.leadName, o.detail, o.evidence.join(' | '), o.since.slice(0, 10)])]),
    );
  }

  return (
    <>
      <PageHead
        eyebrow="AI Intelligence"
        title="Oportunidades detectadas"
        sub="Reglas sobre lo que ya está registrado en el CRM, ordenadas por prioridad. No se infieren conversaciones, turnos ni cierres que no estén cargados."
        actions={<button className="btn secondary" onClick={exportCsv} disabled={!shown.length}>↓ Exportar CSV</button>}
      />
      <div className="stats">
        <Stat label="Leads calientes sin contactar" value={count('hot_uncontacted')} hint="Score ≥ 70, nuevos hace entre 24 h y 30 días" />
        <Stat label="Negociaciones quietas" value={count('stalled_negotiation')} hint="7 días sin cambios y sin tarea abierta" />
        <Stat label="Cotizaciones por cerrar o renovar" value={count('approved_quote_open') + count('expired_quote')} hint="Aprobadas con el lead abierto" />
        <Stat label="Reactivables por precio" value={count('price_reactivation')} hint="Perdidos por precio con lista nueva" />
      </div>
      <section className="panel" aria-labelledby="ops">
        <div className="panel-head">
          <h2 id="ops">Oportunidades ({shown.length})</h2>
          <div className="tabs" role="group" aria-label="Filtrar por tipo">
            <button aria-pressed={kind === 'all'} onClick={() => { setKind('all'); setLimit(50); }}>Todas</button>
            {(Object.keys(OPPORTUNITY_LABEL) as OpportunityKind[]).map((k) => (
              <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setLimit(50); }}>
                {OPPORTUNITY_LABEL[k]} ({count(k)})
              </button>
            ))}
          </div>
        </div>
        {!shown.length ? (
          <div className="empty">No hay oportunidades de este tipo con los datos actuales. Es una buena noticia o faltan datos: revisá Alertas de datos faltantes.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Prioridad</th><th>Oportunidad</th><th>Lead</th><th>Detalle y evidencia</th><th>Desde</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((o) => {
                  const lead = leadById.get(o.leadId);
                  return (
                    <tr key={o.id}>
                      <td><span className={`tag ${PRIORITY[o.priority][1]}`}>{PRIORITY[o.priority][0]}</span></td>
                      <td>{o.title}{org === 'all' && <div className="faint">{orgName(o.organizationId)}</div>}</td>
                      <td>
                        {lead ? <button className="linklike" onClick={() => setOpenLead(lead)}>{o.leadName}</button> : o.leadName}
                      </td>
                      <td>
                        {o.detail}
                        <div className="faint">{o.evidence.join(' · ')}</div>
                      </td>
                      <td>{formatDay(o.since.slice(0, 10))}</td>
                      <td>
                        {lead && app.allowed('task:write', lead.organizationId) ? (
                          <button className="btn secondary sm" onClick={() => setTaskFor(lead)}>+ Tarea</button>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length > limit && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <button className="btn secondary sm" onClick={() => setLimit((n) => n + 50)}>Mostrar más ({shown.length - limit} restantes)</button>
              </div>
            )}
          </div>
        )}
      </section>
      <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} />
      {taskFor && <TaskFormDialog open lead={taskFor} onClose={() => setTaskFor(null)} />}
    </>
  );
}
