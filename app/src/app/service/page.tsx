'use client';

import { useMemo, useState } from 'react';
import { AppointmentFormDialog } from '@/components/AppointmentFormDialog';
import { Dialog } from '@/components/Dialog';
import { ReasonDialog } from '@/components/ReasonDialog';
import { PageHead, Stat, ToneTag } from '@/components/ui';
import { addDays, formatDay, toDay } from '@/lib/domain/dates';
import { formatArPhone } from '@/lib/domain/phone';
import { APPOINTMENT_ACTION_LABEL, APPOINTMENT_NEEDS_REASON, appointmentActions, type AppointmentAction } from '@/lib/domain/postventa';
import { APPOINTMENT_STATUS_LABEL, SERVICE_TYPE_LABEL, orgName, type ServiceAppointment } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

type View = 'day' | 'upcoming' | 'closed';
const VIEW_LABEL: Record<View, string> = { day: 'Agenda del día', upcoming: 'Próximos 14 días', closed: 'Cerrados' };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const localDay = (iso: string) => toDay(new Date(iso));
const OPEN = new Set(['scheduled', 'confirmed', 'checked_in', 'in_progress', 'ready']);

export default function ServicePage() {
  const app = useApp();
  const { org } = useFilters();
  const { appointments } = useScoped(org);
  const today = toDay(new Date());
  const [day, setDay] = useState(today);
  const [view, setView] = useState<View>('day');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = appointments.find((a) => a.id === openId) ?? null;

  const dayRows = useMemo(() => appointments.filter((a) => localDay(a.scheduledAt) === day).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [appointments, day]);
  const bays = useMemo(() => [...new Set(dayRows.map((a) => a.bay))].sort((a, b) => a.localeCompare(b, 'es')), [dayRows]);
  const listRows = useMemo(() => {
    const until = addDays(today, 14);
    return appointments
      .filter((a) => (view === 'upcoming' ? OPEN.has(a.status) && localDay(a.scheduledAt) >= today && localDay(a.scheduledAt) <= until : !OPEN.has(a.status)))
      .sort((a, b) => (view === 'upcoming' ? a.scheduledAt.localeCompare(b.scheduledAt) : b.scheduledAt.localeCompare(a.scheduledAt)));
  }, [appointments, today, view]);

  const todayRows = appointments.filter((a) => localDay(a.scheduledAt) === today);
  const inShop = appointments.filter((a) => a.status === 'checked_in' || a.status === 'in_progress').length;
  const ready = appointments.filter((a) => a.status === 'ready').length;
  const last30 = appointments.filter((a) => localDay(a.scheduledAt) >= addDays(today, -30) && localDay(a.scheduledAt) < today);
  const noShows = last30.filter((a) => a.status === 'no_show').length;

  return (
    <>
      <PageHead
        eyebrow="Postventa"
        title="Turnos de taller"
        sub="Agenda por box, recepción y entrega. Los recordatorios son tareas internas: no se envía nada al cliente."
        actions={app.allowed('service:manage', org) && <button className="btn" onClick={() => setCreating(true)}>+ Nuevo turno</button>}
      />
      <div className="stats">
        <Stat label="Turnos de hoy" value={todayRows.length} hint={((n) => `${n} ${n === 1 ? 'confirmado' : 'confirmados'}`)(todayRows.filter((a) => a.status === 'confirmed').length)} />
        <Stat label="En taller ahora" value={inShop} hint="Recibidos o en trabajo" />
        <Stat label="Listos para entregar" value={ready} />
        <Stat label="Ausencias (30 días)" value={last30.length ? `${noShows} de ${last30.length}` : '—'} hint={last30.length ? 'Turnos pasados sin presentarse' : 'Sin turnos pasados registrados'} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="tabs" role="group" aria-label="Vista">
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
            ))}
          </div>
          {view === 'day' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn ghost sm" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">‹</button>
              <input className="field" type="date" aria-label="Día" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <button className="btn ghost sm" onClick={() => setDay(addDays(day, 1))} aria-label="Día siguiente">›</button>
              {day !== today && <button className="btn ghost sm" onClick={() => setDay(today)}>Hoy</button>}
            </div>
          )}
        </div>

        {view === 'day' ? (
          dayRows.length === 0 ? (
            <div className="empty">No hay turnos el {formatDay(day)}.</div>
          ) : (
            <div className="bays">
              {bays.map((b) => (
                <div key={b} className="bay">
                  <h3>{b}</h3>
                  {dayRows.filter((a) => a.bay === b).map((a) => (
                    <button key={a.id} className="appt" data-status={a.status} onClick={() => setOpenId(a.id)}>
                      <span className="appt-time">{hhmm(a.scheduledAt)} · {a.durationMin} min</span>
                      <strong>{a.customerName}</strong>
                      <span className="faint">{a.vehicle}{a.plate ? ` · ${a.plate}` : ''}</span>
                      <span><ToneTag value={APPOINTMENT_STATUS_LABEL[a.status]} /> <span className="faint">{SERVICE_TYPE_LABEL[a.serviceType]}</span></span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Cliente</th><th>Vehículo</th><th>Trabajo</th><th>Box</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {listRows.map((a) => (
                  <tr key={a.id} className="cell-link" onClick={() => setOpenId(a.id)}>
                    <td>{formatDay(localDay(a.scheduledAt))}<div className="faint">{hhmm(a.scheduledAt)}</div></td>
                    <td><strong>{a.customerName}</strong><div className="faint">{orgName(a.organizationId)}</div></td>
                    <td>{a.vehicle}<div className="faint">{a.plate ?? 'Sin patente'}</div></td>
                    <td>{SERVICE_TYPE_LABEL[a.serviceType]}</td>
                    <td>{a.bay}</td>
                    <td><ToneTag value={APPOINTMENT_STATUS_LABEL[a.status]} />{a.statusReason && <div className="faint">{a.statusReason}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listRows.length === 0 && <div className="empty">{view === 'upcoming' ? 'No hay turnos abiertos en los próximos 14 días.' : 'Todavía no hay turnos cerrados.'}</div>}
          </div>
        )}
      </section>

      {creating && <AppointmentFormDialog open onClose={() => setCreating(false)} defaultOrg={org === 'all' ? undefined : org} defaultDay={day} />}
      {open && <AppointmentDetail a={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function AppointmentDetail({ a, onClose }: { a: ServiceAppointment; onClose: () => void }) {
  const app = useApp();
  const [busy, setBusy] = useState<AppointmentAction | null>(null);
  const [asking, setAsking] = useState<AppointmentAction | null>(null);
  const [error, setError] = useState<string>();
  const events = app.appointmentEvents.filter((e) => e.appointmentId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const actions = app.allowed('service:manage', a.organizationId) ? appointmentActions(a, new Date()) : [];
  const lead = a.leadId ? app.leads.find((l) => l.id === a.leadId) : undefined;
  const advisor = a.advisorId ? (app.members.find((m) => m.userId === a.advisorId)?.name ?? app.advisors.find((x) => x.id === a.advisorId)?.name) : undefined;

  async function run(action: AppointmentAction, reason?: string) {
    setBusy(action);
    setError(undefined);
    try {
      await app.transitionAppointment(a, action, reason);
      app.notify(`${a.customerName}: ${APPOINTMENT_ACTION_LABEL[action].toLowerCase()}`);
      setAsking(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (reason !== undefined) throw e;
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Dialog open title={`Turno · ${a.customerName}`} onClose={onClose} wide>
        <dl className="kv">
          <dt>Estado</dt><dd><ToneTag value={APPOINTMENT_STATUS_LABEL[a.status]} />{a.statusReason && <span className="faint"> · {a.statusReason}</span>}</dd>
          <dt>Cuándo</dt><dd>{formatDay(localDay(a.scheduledAt))} {hhmm(a.scheduledAt)} · {a.durationMin} min · {a.bay}</dd>
          <dt>Vehículo</dt><dd>{a.vehicle}{a.plate ? ` · ${a.plate}` : ''}{a.mileage !== undefined ? ` · ${a.mileage.toLocaleString('es-AR')} km` : ''}</dd>
          <dt>Trabajo</dt><dd>{SERVICE_TYPE_LABEL[a.serviceType]}</dd>
          <dt>Contacto</dt><dd>{a.phoneE164 ? formatArPhone(a.phoneE164) : '—'}{lead ? ` · lead ${lead.name}` : ''}</dd>
          <dt>Asesor</dt><dd>{advisor ?? 'Sin asignar'}</dd>
          <dt>Concesionario</dt><dd>{orgName(a.organizationId)}</dd>
          {a.notes && (<><dt>Notas</dt><dd>{a.notes}</dd></>)}
        </dl>
        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
            {actions.map((k) => (
              <button
                key={k}
                className={`btn ${APPOINTMENT_NEEDS_REASON.has(k) ? 'ghost' : k === actions[0] ? '' : 'secondary'}`}
                disabled={busy !== null}
                onClick={() => (APPOINTMENT_NEEDS_REASON.has(k) ? setAsking(k) : run(k))}
              >
                {busy === k ? 'Guardando…' : APPOINTMENT_ACTION_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        {error && <div className="notice error" role="alert">{error}</div>}
        <h3 className="section-title">Historial</h3>
        {events.length === 0 ? (
          <div className="empty">Sin movimientos registrados.</div>
        ) : (
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id} data-kind="status">
                <strong>{APPOINTMENT_STATUS_LABEL[e.toStatus][0]}</strong>
                {e.actorName && <span className="faint"> · {e.actorName}</span>}
                {e.reason && <div>{e.reason}</div>}
                <time>{new Date(e.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</time>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      {asking && (
        <ReasonDialog
          open
          title={`${APPOINTMENT_ACTION_LABEL[asking]} · ${a.customerName}`}
          label="Motivo"
          onCancel={() => setAsking(null)}
          onConfirm={(r) => run(asking, r)}
        />
      )}
    </>
  );
}
