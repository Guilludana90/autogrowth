'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ImportDialog } from '@/components/ImportDialog';
import { LeadFormDialog } from '@/components/LeadFormDialog';
import { downloadFile, PageHead, ScoreBadge, StatusTag } from '@/components/ui';
import { useStatusChange } from '@/components/useStatusChange';
import { toCsv } from '@/lib/domain/csv';
import { formatDay, inRange } from '@/lib/domain/dates';
import { formatArPhone } from '@/lib/domain/phone';
import { LEAD_STATUSES, STATUS_LABEL, orgName, type Lead } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

type SortKey = 'createdAt' | 'name' | 'score' | 'status';

export default function LeadsPage() {
  const app = useApp();
  const { org, range, update } = useFilters();
  const params = useSearchParams();
  const { leads, advisors } = useScoped(org);
  const status = params.get('status') ?? 'all';
  const advisor = params.get('advisor') ?? 'all';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'createdAt', dir: -1 });
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { change, dialog } = useStatusChange();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return leads
      .filter((l) => inRange(l.createdAt, range))
      .filter((l) => status === 'all' || l.status === status)
      .filter((l) => advisor === 'all' || (advisor === 'none' ? !l.advisorId : l.advisorId === advisor))
      .filter(
        (l) =>
          !needle ||
          [l.name, l.email, l.modelInterest, l.source].some((v) => v?.toLowerCase().includes(needle)) ||
          (digits.length >= 3 && l.phoneE164?.includes(digits)),
      )
      .sort((a, b) => {
        const k = sort.key;
        const av = k === 'score' ? (a.score ?? -1) : a[k];
        const bv = k === 'score' ? (b.score ?? -1) : b[k];
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
  }, [advisor, leads, q, range, sort, status]);

  const advisorName = (id?: string) => advisors.find((a) => a.id === id)?.name ?? 'Sin asignar';
  const canCreate = app.allowed('lead:write', org);
  const canImport = app.allowed('lead:import', org);
  const imports = app.imports.slice(0, 5);

  const sortBtn = (key: SortKey, label: string) => (
    <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'name' ? 1 : -1 }))} aria-label={`Ordenar por ${label}`}>
      {label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}
    </button>
  );

  function exportCsv() {
    downloadFile(
      `leads-${org}-${range.from}_${range.to}.csv`,
      toCsv([
        ['Nombre', 'Teléfono', 'Email', 'Concesionario', 'Modelo', 'Origen', 'Campaña', 'Score', 'Estado', 'Motivo pérdida', 'Asesor', 'Creado'],
        ...rows.map((l) => [l.name, l.phoneE164, l.email, orgName(l.organizationId), l.modelInterest, l.source, l.campaignId, l.score, STATUS_LABEL[l.status], l.lostReason, advisorName(l.advisorId), l.createdAt]),
      ]),
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Ventas"
        title="Leads & CRM"
        sub="Contactos, scoring explicable, estado y asesor responsable"
        actions={
          <>
            <button className="btn secondary" onClick={exportCsv} disabled={!rows.length}>↓ Exportar CSV</button>
            {canImport && <button className="btn secondary" onClick={() => setImporting(true)}>↑ Importar CSV</button>}
            {canCreate && <button className="btn" onClick={() => setCreating(true)}>+ Nuevo lead</button>}
          </>
        }
      />
      {!canCreate && <div className="notice">Tu rol es de solo lectura en esta vista: no podés crear ni modificar leads.</div>}

      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <input className="field" style={{ flex: '1 1 240px' }} type="search" placeholder="Buscar por nombre, teléfono, email, modelo…" aria-label="Buscar leads" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="field" aria-label="Estado" value={status} onChange={(e) => update({ status: e.target.value === 'all' ? null : e.target.value })}>
              <option value="all">Todos los estados</option>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select className="field" aria-label="Asesor" value={advisor} onChange={(e) => update({ advisor: e.target.value === 'all' ? null : e.target.value })}>
              <option value="all">Todos los asesores</option>
              <option value="none">Sin asignar</option>
              {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <span className="faint" aria-live="polite">{rows.length} de {leads.length} leads</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{sortBtn('name', 'Contacto')}</th>
                <th>Concesionario</th>
                <th>Interés / origen</th>
                <th>{sortBtn('score', 'Score')}</th>
                <th>{sortBtn('status', 'Estado')}</th>
                <th>Asesor</th>
                <th>{sortBtn('createdAt', 'Alta')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <LeadRow key={l.id} lead={l} advisorName={advisorName} onStatus={change} />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No hay leads con estos filtros en el período seleccionado.</div>}
        </div>
      </section>

      {canImport && imports.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h2>Historial de importaciones</h2></div>
          <div className="table-wrap">
            <table style={{ minWidth: 560 }}>
              <thead><tr><th>Archivo</th><th>Fecha</th><th>Resultado</th><th></th></tr></thead>
              <tbody>
                {imports.map((j) => (
                  <tr key={j.id}>
                    <td>{j.fileName}</td>
                    <td>{formatDay(j.createdAt)}</td>
                    <td className="faint">{j.counts.create} creados · {j.counts.update} actualizados · {j.counts.duplicate} duplicados · {j.counts.error} errores</td>
                    <td className="num">
                      {j.rolledBack ? (
                        <span className="tag gray">Revertido</span>
                      ) : (
                        <button
                          className="btn danger sm"
                          onClick={async () => {
                            if (!confirm(`¿Revertir la importación de ${j.fileName}? Se borran los leads creados y se restauran los datos actualizados.`)) return;
                            try {
                              await app.rollbackImport(j.id);
                              app.notify('Importación revertida');
                            } catch (e) {
                              app.notify(e instanceof Error ? e.message : String(e), 'error');
                            }
                          }}
                        >
                          Revertir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {creating && <LeadFormDialog open onClose={() => setCreating(false)} defaultOrg={org === 'all' ? undefined : org} />}
      {importing && <ImportDialog open onClose={() => setImporting(false)} org={org} />}
      {dialog}
    </>
  );
}

function LeadRow({ lead: l, advisorName, onStatus }: { lead: Lead; advisorName: (id?: string) => string; onStatus: (l: Lead, s: Lead['status']) => void }) {
  const app = useApp();
  const { advisors } = useScoped(l.organizationId);
  const canWrite = app.allowed('lead:write', l.organizationId);
  const canAssign = app.allowed('lead:assign', l.organizationId);
  return (
    <tr>
      <td>
        <strong>{l.name}</strong>
        <div className="faint">{formatArPhone(l.phoneE164)}{l.email ? ` · ${l.email}` : ''}</div>
      </td>
      <td>{orgName(l.organizationId)}</td>
      <td>
        {l.modelInterest ?? <span className="faint">Sin modelo</span>}
        <div className="faint">{l.source}</div>
      </td>
      <td><ScoreBadge score={l.score} reason={l.scoreReason} /></td>
      <td>
        {canWrite ? (
          <select className="field" aria-label={`Estado de ${l.name}`} value={l.status} onChange={(e) => onStatus(l, e.target.value as Lead['status'])}>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        ) : (
          <StatusTag status={l.status} />
        )}
        {l.status === 'lost' && l.lostReason && <div className="faint">{l.lostReason}</div>}
      </td>
      <td>
        {canAssign ? (
          <select
            className="field"
            aria-label={`Asesor de ${l.name}`}
            value={l.advisorId ?? ''}
            onChange={async (e) => {
              try {
                await app.updateLead(l.id, { advisorId: e.target.value || null });
                app.notify(`${l.name} asignado a ${advisorName(e.target.value || undefined)}`);
              } catch (err) {
                app.notify(err instanceof Error ? err.message : String(err), 'error');
              }
            }}
          >
            <option value="">Sin asignar</option>
            {advisors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          advisorName(l.advisorId)
        )}
      </td>
      <td className="faint">{formatDay(l.createdAt)}</td>
    </tr>
  );
}
