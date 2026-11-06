'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { DEMO_BAYS } from '@/lib/demo/seedP4';
import { toDay } from '@/lib/domain/dates';
import { normalizePlate, validateAppointment, findConflicts } from '@/lib/domain/postventa';
import { ORGANIZATIONS, SERVICE_TYPES, SERVICE_TYPE_LABEL, type OrganizationId, type ServiceType } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export function AppointmentFormDialog({ open, onClose, defaultOrg, defaultDay }: { open: boolean; onClose: () => void; defaultOrg?: OrganizationId; defaultDay: string }) {
  const app = useApp();
  const writable = ORGANIZATIONS.filter((o) => app.allowed('service:manage', o.id));
  const [org, setOrg] = useState<OrganizationId>(defaultOrg && writable.some((o) => o.id === defaultOrg) ? defaultOrg : (writable[0]?.id ?? 'cardys_fiat'));
  const [leadId, setLeadId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [day, setDay] = useState(defaultDay < toDay(new Date()) ? toDay(new Date()) : defaultDay);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [bay, setBay] = useState<string>(DEMO_BAYS[0]);
  const [reminder, setReminder] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const leads = app.leads.filter((l) => l.organizationId === org).slice(0, 400);
  const people = app.members.length
    ? app.members.filter((m) => m.organizationId === org && ['super_admin', 'dealership_admin', 'post_sales'].includes(m.role)).map((m) => ({ id: m.userId, name: m.name }))
    : app.advisors.filter((a) => a.organizationId === org);
  const bays = useMemo(() => [...new Set([...DEMO_BAYS, ...app.appointments.filter((a) => a.organizationId === org).map((a) => a.bay)])], [app.appointments, org]);

  const scheduledAt = day && time ? new Date(`${day}T${time}`).toISOString() : '';
  const conflicts = scheduledAt && bay.trim() ? findConflicts({ organizationId: org, bay, scheduledAt, durationMin: duration }, app.appointments) : [];

  function pickLead(id: string) {
    setLeadId(id);
    const l = app.leads.find((x) => x.id === id);
    if (l) {
      setCustomerName(l.name);
      setPhone(l.phoneE164 ?? '');
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const plateRaw = String(fd.get('plate') ?? '').trim();
    const mileageRaw = String(fd.get('mileage') ?? '').trim();
    const draft = {
      customerName,
      vehicle: String(fd.get('vehicle') ?? ''),
      plate: plateRaw || undefined,
      mileage: mileageRaw ? Number(mileageRaw) : undefined,
      bay,
      scheduledAt: scheduledAt || 'x',
      durationMin: duration,
    };
    const errs = validateAppointment(draft, new Date());
    if (conflicts.length) errs.push(`${bay} ya está ocupado en ese horario (${conflicts.map((c) => `${hhmm(c.scheduledAt)} ${c.customerName}`).join(', ')}).`);
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const a = await app.createAppointment(
        {
          organizationId: org,
          leadId: leadId || undefined,
          customerName: customerName.trim(),
          phoneE164: phone.trim() || undefined,
          vehicle: draft.vehicle.trim(),
          plate: normalizePlate(plateRaw),
          mileage: draft.mileage,
          serviceType: String(fd.get('serviceType')) as ServiceType,
          scheduledAt,
          durationMin: duration,
          bay: bay.trim(),
          advisorId: String(fd.get('advisor') ?? '') || undefined,
          notes: String(fd.get('notes') ?? '').trim() || undefined,
        },
        reminder,
      );
      app.notify(`Turno agendado: ${a.customerName} · ${a.bay} ${hhmm(a.scheduledAt)}${reminder ? ' · recordatorio creado en Tareas' : ''}`);
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} title="Nuevo turno de taller" onClose={onClose} wide>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <div className="form-grid">
          <label className="lbl">
            Concesionario
            <select className="field" value={org} onChange={(e) => { setOrg(e.target.value as OrganizationId); setLeadId(''); }}>
              {writable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="lbl">
            Cliente existente (opcional)
            <select className="field" value={leadId} onChange={(e) => pickLead(e.target.value)}>
              <option value="">Cliente nuevo / sin lead</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="lbl">
            Nombre del cliente *
            <input className="field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="lbl">
            Teléfono
            <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54911…" maxLength={20} />
          </label>
          <label className="lbl">
            Vehículo *
            <input className="field" name="vehicle" placeholder="Fiat Cronos 1.3 Drive" maxLength={120} />
          </label>
          <label className="lbl">
            Patente
            <input className="field" name="plate" placeholder="AB123CD" maxLength={10} />
          </label>
          <label className="lbl">
            Kilometraje
            <input className="field" name="mileage" type="number" min={0} step={1} />
          </label>
          <label className="lbl">
            Tipo de trabajo
            <select className="field" name="serviceType" defaultValue="maintenance">
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="lbl">
            Día *
            <input className="field" type="date" value={day} min={toDay(new Date())} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="lbl">
            Hora *
            <input className="field" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="lbl">
            Duración (min)
            <input className="field" type="number" min={15} max={600} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </label>
          <label className="lbl">
            Box / puesto *
            <input className="field" list="bays" value={bay} onChange={(e) => setBay(e.target.value)} maxLength={40} />
            <datalist id="bays">{bays.map((b) => <option key={b} value={b} />)}</datalist>
          </label>
          <label className="lbl">
            Asesor de servicio
            <select className="field" name="advisor" defaultValue="">
              <option value="">Sin asignar</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <label className="lbl">
          Notas para el taller
          <textarea className="field" name="notes" rows={2} maxLength={1000} placeholder="Ruido en tren delantero, trae repuesto propio…" />
        </label>
        <label className="check">
          <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
          Crear una tarea interna para confirmar el turno 24 h antes (no se envía ningún mensaje al cliente)
        </label>
        {conflicts.length > 0 && (
          <div className="notice warn" role="status">
            {bay} ocupado: {conflicts.map((c) => `${hhmm(c.scheduledAt)} ${c.customerName} (${c.durationMin} min)`).join(' · ')}
          </div>
        )}
        {errors.length > 0 && (
          <div className="notice error" role="alert">
            {errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Agendar turno'}</button>
        </div>
      </form>
    </Dialog>
  );
}
