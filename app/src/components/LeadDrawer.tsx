'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { formatDay } from '@/lib/domain/dates';
import { formatMoney } from '@/lib/domain/metrics';
import { formatArPhone } from '@/lib/domain/phone';
import { headline } from '@/lib/domain/quotes';
import { dueState } from '@/lib/domain/tasks';
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, TASK_STATUS_LABEL, orgName, type Lead, type LeadActivity } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';
import { TaskFormDialog } from './TaskFormDialog';
import { ScoreBadge, StatusTag } from './ui';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Ficha del lead: datos, historial (timeline), notas, tareas y cotizaciones vinculadas. */
export function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const app = useApp();
  const [activities, setActivities] = useState<LeadActivity[] | null>(null);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const leadId = lead?.id;

  useEffect(() => {
    if (!leadId) return;
    let alive = true;
    setError(undefined);
    app
      .listActivities(leadId)
      .then((a) => alive && setActivities(a))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, app.activityVersion]);

  if (!lead) return null;
  const current = app.leads.find((l) => l.id === lead.id) ?? lead;
  const advisor = app.advisors.find((a) => a.id === current.advisorId)?.name ?? 'Sin asignar';
  const tasks = app.tasks.filter((t) => t.leadId === current.id);
  const quotes = app.quotes.filter((q) => q.leadId === current.id);
  const today = new Date().toISOString().slice(0, 10);
  const canNote = app.allowed('note:write', current.organizationId);

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      await app.addNote(current, note);
      setNote('');
    } catch (err) {
      app.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open title={current.name} onClose={onClose} wide>
      <div className="drawer-grid">
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusTag status={current.status} />
            <ScoreBadge score={current.score} reason={current.scoreReason} />
          </div>
          <dl className="kv">
            <dt>Concesionario</dt><dd>{orgName(current.organizationId)}</dd>
            <dt>Teléfono</dt><dd>{formatArPhone(current.phoneE164)}</dd>
            <dt>Email</dt><dd>{current.email ?? '—'}</dd>
            <dt>Interés</dt><dd>{current.modelInterest ?? '—'}</dd>
            <dt>Origen</dt><dd>{current.source}</dd>
            <dt>Campaña</dt><dd>{app.campaigns.find((c) => c.id === current.campaignId)?.name ?? '—'}</dd>
            <dt>Asesor</dt><dd>{advisor}</dd>
            <dt>Alta</dt><dd>{formatDay(current.createdAt)}</dd>
            {current.lostReason && (<><dt>Motivo pérdida</dt><dd>{current.lostReason}</dd></>)}
            {current.scoreReason && (<><dt>Score</dt><dd className="faint">{current.scoreReason}</dd></>)}
          </dl>

          <div>
            <div className="panel-head" style={{ marginBottom: 6 }}>
              <div className="section-title">Tareas ({tasks.length})</div>
              {app.allowed('task:write', current.organizationId) && (
                <button className="btn secondary sm" onClick={() => setNewTask(true)}>+ Tarea</button>
              )}
            </div>
            {tasks.length === 0 ? (
              <div className="faint">Sin tareas.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                {tasks.map((t) => {
                  const ds = dueState(t, today);
                  return (
                    <li key={t.id}>
                      {t.title}{' '}
                      <span className={ds === 'overdue' ? 'due-overdue' : ds === 'today' ? 'due-today' : 'faint'}>
                        · {TASK_STATUS_LABEL[t.status]}{t.dueAt ? ` · vence ${formatDay(t.dueAt)}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {app.allowed('quote:read', current.organizationId) && (
            <div>
              <div className="panel-head" style={{ marginBottom: 6 }}>
                <div className="section-title">Cotizaciones ({quotes.length})</div>
                {app.allowed('quote:write', current.organizationId) && (
                  <Link className="btn secondary sm" href={`/quotes?lead=${current.id}&org=${current.organizationId}`}>+ Cotizar</Link>
                )}
              </div>
              {quotes.length === 0 ? (
                <div className="faint">Sin cotizaciones.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                  {quotes.map((q) => {
                    const h = headline(q.kind, q.result);
                    return (
                      <li key={q.id}>
                        <Link className="star" href={`/quotes/view?id=${q.id}`}>#{q.number}</Link> {QUOTE_KIND_LABEL[q.kind]} · {q.vehicle} ·{' '}
                        {formatMoney(h.value ?? null)} <span className="faint">· {QUOTE_STATUS_LABEL[q.status]}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="section-title">Historial</div>
          {canNote && (
            <form onSubmit={submitNote} style={{ display: 'grid', gap: 8 }}>
              <label className="sr-only" htmlFor="note">Nueva nota</label>
              <textarea id="note" className="field" rows={2} maxLength={2000} placeholder="Agregar una nota (llamada, visita, acuerdo…)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn sm" disabled={saving || !note.trim()}>{saving ? 'Guardando…' : 'Agregar nota'}</button>
              </div>
            </form>
          )}
          {error && <div className="notice error">{error}</div>}
          {activities === null && !error && <div className="skeleton" style={{ minHeight: 120 }} />}
          {activities && (
            <ol className="timeline" aria-label="Historial del lead">
              {activities.map((a) => (
                <li key={a.id} data-kind={a.kind}>
                  <time dateTime={a.createdAt}>{fmtTime(a.createdAt)}{a.actorName ? ` · ${a.actorName}` : ''}</time>
                  {a.body}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {newTask && <TaskFormDialog open onClose={() => setNewTask(false)} defaultOrg={current.organizationId} lead={current} />}
    </Dialog>
  );
}
