'use client';

import { useMemo, useState } from 'react';
import { PageHead, ScoreBadge } from '@/components/ui';
import { useStatusChange } from '@/components/useStatusChange';
import { inRange } from '@/lib/domain/dates';
import { LEAD_STATUSES, STATUS_LABEL, orgName, type Lead, type LeadStatus } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

export default function PipelinePage() {
  const app = useApp();
  const { org, range } = useFilters();
  const { leads, advisors } = useScoped(org);
  const { change, dialog } = useStatusChange();
  const [over, setOver] = useState<LeadStatus | null>(null);
  const inPeriod = useMemo(() => leads.filter((l) => inRange(l.createdAt, range)), [leads, range]);
  const advisorName = (id?: string) => advisors.find((a) => a.id === id)?.name ?? 'Sin asignar';

  function drop(status: LeadStatus, id: string) {
    setOver(null);
    const lead = inPeriod.find((l) => l.id === id);
    if (lead && app.allowed('lead:write', lead.organizationId)) change(lead, status);
  }

  return (
    <>
      <PageHead eyebrow="Ventas" title="Pipeline" sub="Arrastrá una tarjeta o usá el selector para mover un lead de etapa" />
      <div className="pipeline">
        {LEAD_STATUSES.map((status) => {
          const items = inPeriod.filter((l) => l.status === status).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          return (
            <section
              key={status}
              className={`lane ${over === status ? 'drop' : ''}`}
              aria-label={`${STATUS_LABEL[status]}: ${items.length} leads`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => drop(status, e.dataTransfer.getData('text/plain'))}
            >
              <h3>
                {STATUS_LABEL[status]} <span className="faint">{items.length}</span>
              </h3>
              {items.map((l) => (
                <Card key={l.id} lead={l} advisor={advisorName(l.advisorId)} onMove={(s) => change(l, s)} />
              ))}
              {items.length === 0 && <div className="faint" style={{ padding: 8 }}>Sin leads</div>}
            </section>
          );
        })}
      </div>
      {dialog}
    </>
  );
}

function Card({ lead: l, advisor, onMove }: { lead: Lead; advisor: string; onMove: (s: LeadStatus) => void }) {
  const app = useApp();
  const canWrite = app.allowed('lead:write', l.organizationId);
  return (
    <article className="card" draggable={canWrite} onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{l.name}</strong>
        <ScoreBadge score={l.score} reason={l.scoreReason} />
      </div>
      <p>{l.modelInterest ?? 'Sin modelo'} · {orgName(l.organizationId)}</p>
      <p>{advisor}{l.lostReason ? ` · ${l.lostReason}` : ''}</p>
      {canWrite && (
        <select className="field" style={{ width: '100%', marginTop: 8, minHeight: 32 }} aria-label={`Mover ${l.name}`} value={l.status} onChange={(e) => onMove(e.target.value as LeadStatus)}>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      )}
    </article>
  );
}
