'use client';

import { useMemo, useState } from 'react';
import { LeadDrawer } from '@/components/LeadDrawer';
import { TaskFormDialog } from '@/components/TaskFormDialog';
import { PageHead, Stat } from '@/components/ui';
import { formatDay, toDay } from '@/lib/domain/dates';
import { dueState, sortTasks, taskCounts, type DueState } from '@/lib/domain/tasks';
import { TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, orgName, type Lead, type TaskStatus } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const DUE_LABEL: Record<DueState, string> = { overdue: 'Vencida', today: 'Hoy', upcoming: 'Próxima', none: 'Sin fecha', done: 'Completada' };
type View = 'open' | 'mine' | 'overdue' | 'done' | 'all';
const VIEW_LABEL: Record<View, string> = { open: 'Abiertas', mine: 'Mías', overdue: 'Vencidas', done: 'Completadas', all: 'Todas' };

export default function TasksPage() {
  const app = useApp();
  const { org } = useFilters();
  const { tasks, leads } = useScoped(org);
  const [view, setView] = useState<View>('open');
  const [assignee, setAssignee] = useState('all');
  const [creating, setCreating] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const today = toDay(new Date());
  const counts = taskCounts(tasks, today);
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of app.members) map.set(m.userId, m.name);
    for (const a of app.advisors) map.set(a.id, a.name);
    return map;
  }, [app.advisors, app.members]);

  const rows = useMemo(
    () =>
      sortTasks(
        tasks.filter((t) => {
          const ds = dueState(t, today);
          if (view === 'open' && ds === 'done') return false;
          if (view === 'overdue' && ds !== 'overdue') return false;
          if (view === 'done' && ds !== 'done') return false;
          if (view === 'mine' && (t.assigneeId !== app.session?.userId || ds === 'done')) return false;
          if (assignee !== 'all' && (assignee === 'none' ? !!t.assigneeId : t.assigneeId !== assignee)) return false;
          return true;
        }),
        today,
      ),
    [app.session?.userId, assignee, tasks, today, view],
  );

  async function setStatus(id: string, status: TaskStatus) {
    try {
      await app.updateTask(id, { status });
      if (status === 'done') app.notify('Tarea completada');
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  const canWrite = app.allowed('task:write', org);

  return (
    <>
      <PageHead
        eyebrow="Ventas"
        title="Seguimientos y tareas"
        sub="Qué hay que hacer, quién lo hace y para cuándo"
        actions={canWrite && <button className="btn" onClick={() => setCreating(true)}>+ Nueva tarea</button>}
      />
      <div className="stats">
        <Stat label="Abiertas" value={counts.open} />
        <Stat label="Vencidas" value={<span className={counts.overdue ? 'due-overdue' : undefined}>{counts.overdue}</span>} hint="Requieren acción hoy" />
        <Stat label="Vencen hoy" value={counts.today} />
        <Stat label="Completadas" value={counts.done} />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="tabs" role="group" aria-label="Vista">
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
              ))}
            </div>
            <select className="field" aria-label="Responsable" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="all">Todos los responsables</option>
              <option value="none">Sin asignar</option>
              {[...people].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <span className="faint">{rows.length} tareas</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tarea</th><th>Lead</th><th>Responsable</th><th>Vence</th><th>Prioridad</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const ds = dueState(t, today);
                const lead = leads.find((l) => l.id === t.leadId);
                const writable = app.allowed('task:write', t.organizationId);
                return (
                  <tr key={t.id}>
                    <td>
                      <strong style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</strong>
                      <div className="faint">{orgName(t.organizationId)}{t.notes ? ` · ${t.notes}` : ''}</div>
                    </td>
                    <td>{lead ? <button className="linklike" onClick={() => setOpenLead(lead)}>{lead.name}</button> : <span className="faint">—</span>}</td>
                    <td>{t.assigneeId ? (people.get(t.assigneeId) ?? 'Usuario') : <span className="faint">Sin asignar</span>}</td>
                    <td>
                      <span className={ds === 'overdue' ? 'due-overdue' : ds === 'today' ? 'due-today' : undefined}>{t.dueAt ? formatDay(t.dueAt) : '—'}</span>
                      <div className="faint">{DUE_LABEL[ds]}</div>
                    </td>
                    <td><span className={`tag ${t.priority === 'high' ? 'red' : t.priority === 'low' ? 'gray' : ''}`}>{TASK_PRIORITY_LABEL[t.priority]}</span></td>
                    <td>
                      {writable ? (
                        <select className="field" aria-label={`Estado de ${t.title}`} value={t.status} onChange={(e) => setStatus(t.id, e.target.value as TaskStatus)}>
                          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                        </select>
                      ) : (
                        TASK_STATUS_LABEL[t.status]
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No hay tareas en esta vista.</div>}
        </div>
      </section>
      {creating && <TaskFormDialog open onClose={() => setCreating(false)} defaultOrg={org === 'all' ? undefined : org} />}
      <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} />
    </>
  );
}
