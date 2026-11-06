'use client';

import { useState, type FormEvent } from 'react';
import { toDay } from '@/lib/domain/dates';
import { ORGANIZATIONS, TASK_PRIORITIES, TASK_PRIORITY_LABEL, type Lead, type OrganizationId, type TaskPriority } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';

export function TaskFormDialog({ open, onClose, defaultOrg, lead }: { open: boolean; onClose: () => void; defaultOrg?: OrganizationId; lead?: Lead }) {
  const app = useApp();
  const writable = ORGANIZATIONS.filter((o) => app.allowed('task:write', o.id));
  const [org, setOrg] = useState<OrganizationId>(lead?.organizationId ?? defaultOrg ?? writable[0]?.id ?? 'cardys_fiat');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const people = app.members.length
    ? app.members.filter((m) => m.organizationId === org && m.role !== 'read_only').map((m) => ({ id: m.userId, name: m.name }))
    : app.advisors.filter((a) => a.organizationId === org);
  const leads = app.leads.filter((l) => l.organizationId === org && l.status !== 'won' && l.status !== 'lost').slice(0, 300);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const due = String(fd.get('due') ?? '');
    const time = String(fd.get('time') ?? '') || '12:00';
    if (title.length < 2) return setError('Escribí qué hay que hacer (mínimo 2 caracteres).');
    setSaving(true);
    setError(undefined);
    try {
      await app.createTask({
        organizationId: org,
        leadId: lead?.id ?? (String(fd.get('leadId') ?? '') || undefined),
        title,
        notes: String(fd.get('notes') ?? '').trim() || undefined,
        priority: String(fd.get('priority')) as TaskPriority,
        dueAt: due ? new Date(`${due}T${time}`).toISOString() : undefined,
        assigneeId: String(fd.get('assignee') ?? '') || undefined,
      });
      app.notify(`Tarea creada: ${title}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} title={lead ? `Nueva tarea · ${lead.name}` : 'Nueva tarea'} onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <label className="lbl">
          Qué hay que hacer *
          <input className="field" name="title" maxLength={200} placeholder="Llamar para confirmar test drive" autoFocus />
        </label>
        <div className="form-grid">
          {!lead && (
            <label className="lbl">
              Concesionario
              <select className="field" value={org} onChange={(e) => setOrg(e.target.value as OrganizationId)}>
                {writable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          {!lead && (
            <label className="lbl">
              Lead (opcional)
              <select className="field" name="leadId" defaultValue="">
                <option value="">Sin lead</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          <label className="lbl">
            Responsable
            <select className="field" name="assignee" defaultValue={lead?.advisorId ?? ''}>
              <option value="">Sin asignar</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="lbl">
            Prioridad
            <select className="field" name="priority" defaultValue="normal">
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="lbl">
            Vence
            <input className="field" type="date" name="due" min={toDay(new Date())} />
          </label>
          <label className="lbl">
            Hora
            <input className="field" type="time" name="time" />
          </label>
        </div>
        <label className="lbl">
          Notas
          <textarea className="field" name="notes" rows={2} maxLength={1000} />
        </label>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear tarea'}</button>
        </div>
      </form>
    </Dialog>
  );
}
