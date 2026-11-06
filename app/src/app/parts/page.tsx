'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { PageHead, Stat, ToneTag } from '@/components/ui';
import { formatDay, toDay } from '@/lib/domain/dates';
import { formatMoney } from '@/lib/domain/metrics';
import { PARTS_ACTION_LABEL, isPartsOverdue, partsActions, validatePartsStep, type PartsAction } from '@/lib/domain/postventa';
import { ORGANIZATIONS, PARTS_STATUSES, PARTS_STATUS_LABEL, orgName, type OrganizationId, type PartsRequest, type PartsStatus } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

type StatusFilter = 'open' | 'overdue' | PartsStatus | 'all';
const OPEN: readonly PartsStatus[] = ['requested', 'quoted', 'ordered', 'received'];

export default function PartsPage() {
  const app = useApp();
  const { org } = useFilters();
  const { parts } = useScoped(org);
  const today = toDay(new Date());
  const [status, setStatus] = useState<StatusFilter>('open');
  const [kind, setKind] = useState<'all' | PartsRequest['kind']>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<{ p: PartsRequest; action: PartsAction } | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parts
      .filter((p) => {
        if (status === 'open' && !OPEN.includes(p.status)) return false;
        if (status === 'overdue' && !isPartsOverdue(p, today)) return false;
        if (status !== 'open' && status !== 'overdue' && status !== 'all' && p.status !== status) return false;
        if (kind !== 'all' && p.kind !== kind) return false;
        if (needle && !`${p.customerName} ${p.description} ${p.partNumber ?? ''}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => Number(isPartsOverdue(b, today)) - Number(isPartsOverdue(a, today)) || b.updatedAt.localeCompare(a.updatedAt));
  }, [kind, parts, q, status, today]);

  const overdue = parts.filter((p) => isPartsOverdue(p, today)).length;
  const toDeliver = parts.filter((p) => p.status === 'received').length;
  const pendingQuote = parts.filter((p) => p.status === 'requested').length;
  const quotedValue = parts.filter((p) => p.status === 'quoted' && p.unitPrice !== undefined).reduce((s, p) => s + p.unitPrice! * p.quantity, 0);

  return (
    <>
      <PageHead
        eyebrow="Postventa"
        title="Repuestos y accesorios"
        sub="Pedidos de clientes y del taller: cotización, pedido a fábrica, recepción y entrega"
        actions={app.allowed('parts:request', org) && <button className="btn" onClick={() => setCreating(true)}>+ Nuevo pedido</button>}
      />
      <div className="stats">
        <Stat label="Sin cotizar" value={pendingQuote} />
        <Stat label="Cotizado pendiente" value={quotedValue ? formatMoney(quotedValue) : '—'} hint="Suma de cotizaciones sin pedir (ARS)" />
        <Stat label="Demorados" value={<span className={overdue ? 'due-overdue' : undefined}>{overdue}</span>} hint="Pedidos con fecha estimada vencida" />
        <Stat label="Para entregar" value={toDeliver} hint="Ya recibidos en el concesionario" />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="field" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="open">Abiertos</option>
              <option value="overdue">Demorados</option>
              {PARTS_STATUSES.map((s) => <option key={s} value={s}>{PARTS_STATUS_LABEL[s][0]}</option>)}
              <option value="all">Todos</option>
            </select>
            <select className="field" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="all">Repuestos y accesorios</option>
              <option value="part">Solo repuestos</option>
              <option value="accessory">Solo accesorios</option>
            </select>
            <input className="field" type="search" placeholder="Buscar cliente, pieza o código…" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="faint">{rows.length} pedidos</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Pieza</th><th>Cliente</th><th>Cant.</th><th>Precio unit.</th><th>Llegada estimada</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const late = isPartsOverdue(p, today);
                const actions = app.allowed('parts:manage', p.organizationId) ? partsActions(p) : [];
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.description}</strong>
                      <div className="faint">{p.kind === 'part' ? 'Repuesto' : 'Accesorio'}{p.partNumber ? ` · ${p.partNumber}` : ''} · {orgName(p.organizationId)}</div>
                    </td>
                    <td>{p.customerName}</td>
                    <td>{p.quantity}</td>
                    <td>{p.unitPrice !== undefined ? formatMoney(p.unitPrice, p.currency) : <span className="faint">Sin cotizar</span>}</td>
                    <td>{p.eta ? <span className={late ? 'due-overdue' : undefined}>{formatDay(p.eta)}{late ? ' · demorado' : ''}</span> : <span className="faint">—</span>}</td>
                    <td><ToneTag value={PARTS_STATUS_LABEL[p.status]} />{p.statusReason && <div className="faint">{p.statusReason}</div>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {actions.map((a) => (
                          <button key={a} className={`btn sm ${a === 'cancel' ? 'ghost' : 'secondary'}`} onClick={() => setStep({ p, action: a })}>{PARTS_ACTION_LABEL[a]}</button>
                        ))}
                        {actions.length === 0 && <span className="faint">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No hay pedidos con estos filtros.</div>}
        </div>
      </section>
      {creating && <PartsFormDialog onClose={() => setCreating(false)} defaultOrg={org === 'all' ? undefined : org} />}
      {step && <PartsStepDialog p={step.p} action={step.action} onClose={() => setStep(null)} />}
    </>
  );
}

function PartsFormDialog({ onClose, defaultOrg }: { onClose: () => void; defaultOrg?: OrganizationId }) {
  const app = useApp();
  const writable = ORGANIZATIONS.filter((o) => app.allowed('parts:request', o.id));
  const [org, setOrg] = useState<OrganizationId>(defaultOrg && writable.some((o) => o.id === defaultOrg) ? defaultOrg : (writable[0]?.id ?? 'cardys_fiat'));
  const [appointmentId, setAppointmentId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const appts = app.appointments.filter((a) => a.organizationId === org && !['delivered', 'cancelled', 'no_show'].includes(a.status));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get('description') ?? '').trim();
    const quantity = Number(fd.get('quantity'));
    if (customerName.trim().length < 2) return setError('Indicá el cliente (o "Stock taller").');
    if (description.length < 3) return setError('Describí la pieza (mínimo 3 caracteres).');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return setError('La cantidad tiene que ser un entero entre 1 y 999.');
    setSaving(true);
    setError(undefined);
    try {
      const a = app.appointments.find((x) => x.id === appointmentId);
      await app.createPartsRequest({
        organizationId: org,
        kind: String(fd.get('kind')) as PartsRequest['kind'],
        appointmentId: appointmentId || undefined,
        leadId: a?.leadId,
        customerName: customerName.trim(),
        partNumber: String(fd.get('partNumber') ?? '').trim() || undefined,
        description,
        quantity,
        notes: String(fd.get('notes') ?? '').trim() || undefined,
      });
      app.notify(`Pedido creado: ${description}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open title="Nuevo pedido de repuesto o accesorio" onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <div className="form-grid">
          <label className="lbl">
            Concesionario
            <select className="field" value={org} onChange={(e) => { setOrg(e.target.value as OrganizationId); setAppointmentId(''); }}>
              {writable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="lbl">
            Tipo
            <select className="field" name="kind" defaultValue="part">
              <option value="part">Repuesto</option>
              <option value="accessory">Accesorio</option>
            </select>
          </label>
          <label className="lbl">
            Turno de taller (opcional)
            <select className="field" value={appointmentId} onChange={(e) => { setAppointmentId(e.target.value); const a = app.appointments.find((x) => x.id === e.target.value); if (a) setCustomerName(a.customerName); }}>
              <option value="">Sin turno</option>
              {appts.map((a) => <option key={a.id} value={a.id}>{a.customerName} · {a.vehicle}</option>)}
            </select>
          </label>
          <label className="lbl">
            Cliente *
            <input className="field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} />
          </label>
          <label className="lbl">
            Código de pieza
            <input className="field" name="partNumber" maxLength={40} placeholder="Opcional" />
          </label>
          <label className="lbl">
            Cantidad *
            <input className="field" name="quantity" type="number" min={1} max={999} defaultValue={1} />
          </label>
        </div>
        <label className="lbl">
          Descripción *
          <input className="field" name="description" maxLength={200} placeholder="Pastillas de freno delanteras" autoFocus />
        </label>
        <label className="lbl">
          Notas
          <textarea className="field" name="notes" rows={2} maxLength={1000} />
        </label>
        <p className="faint" style={{ margin: 0 }}>El precio se carga al cotizar. No hay lista de precios de fábrica conectada: se ingresa a mano.</p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear pedido'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function PartsStepDialog({ p, action, onClose }: { p: PartsRequest; action: PartsAction; onClose: () => void }) {
  const app = useApp();
  const today = toDay(new Date());
  const [price, setPrice] = useState(p.unitPrice !== undefined ? String(p.unitPrice) : '');
  const [eta, setEta] = useState(p.eta ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function confirm() {
    const input = { unitPrice: price.trim() ? Number(price) : undefined, eta: eta || undefined, reason: reason.trim() || undefined };
    const err = validatePartsStep(action, input, today);
    if (err) return setError(err);
    setSaving(true);
    setError(undefined);
    try {
      const next = await app.transitionParts(p, action, input);
      app.notify(`${p.description}: ${PARTS_STATUS_LABEL[next.status][0].toLowerCase()}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title={`${PARTS_ACTION_LABEL[action]} · ${p.description}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Volver</button>
          <button className="btn" disabled={saving} onClick={confirm}>{saving ? 'Guardando…' : PARTS_ACTION_LABEL[action]}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="muted" style={{ margin: 0 }}>{p.customerName} · {p.quantity} u.{p.partNumber ? ` · ${p.partNumber}` : ''}</p>
        {(action === 'quote' || action === 'order') && (
          <label className="lbl">
            Precio unitario (ARS){action === 'quote' ? ' *' : ''}
            <input className="field" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus={action === 'quote'} />
          </label>
        )}
        {action === 'order' && (
          <label className="lbl">
            Llegada estimada
            <input className="field" type="date" min={today} value={eta} onChange={(e) => setEta(e.target.value)} />
          </label>
        )}
        {action === 'cancel' && (
          <label className="lbl">
            Motivo *
            <textarea className="field" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
        )}
        {(action === 'receive' || action === 'deliver') && (
          <p style={{ margin: 0 }}>{action === 'receive' ? 'Confirmá que la pieza llegó al concesionario.' : 'Confirmá que la pieza se entregó o se instaló.'}</p>
        )}
        {error && <div className="notice error" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
