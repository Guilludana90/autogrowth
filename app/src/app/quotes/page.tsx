'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { Breakdown } from '@/components/QuoteBreakdown';
import { PageHead } from '@/components/ui';
import { toDay } from '@/lib/domain/dates';
import { formatMoney } from '@/lib/domain/metrics';
import { activeDocument } from '@/lib/domain/priceList';
import { computeQuote, headline, type QuoteAction } from '@/lib/domain/quotes';
import {
  ORGANIZATIONS,
  QUOTE_KIND_LABEL,
  QUOTE_STATUS_LABEL,
  isOrganizationId,
  orgName,
  type OrganizationId,
  type Quote,
  type QuoteKind,
  type QuoteStatus,
} from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const STATUS_TONE: Record<QuoteStatus, string> = { draft: 'gray', pending_approval: 'gold', approved: 'green', rejected: 'red' };

type Field = { name: string; label: string; def: number; step?: string; min?: number; max?: number; hint?: string };
const FIELDS: Record<QuoteKind, Field[]> = {
  used: [
    { name: 'marketValue', label: 'Valor de mercado (ARS)', def: 18_600_000, min: 1 },
    { name: 'marginPercent', label: 'Margen del concesionario %', def: 10, step: '0.1', min: 0, max: 100 },
    { name: 'mileageKm', label: 'Kilometraje', def: 94_000, min: 0, hint: 'Más de 100.000 km descuenta 3%' },
  ],
  savings: [
    { name: 'mobileValue', label: 'Valor móvil (ARS)', def: 28_900_000, min: 1, hint: 'Se toma de la lista activa si elegís un modelo' },
    { name: 'months', label: 'Plazo (cuotas)', def: 84, min: 1 },
    { name: 'adminFeePercent', label: 'Carga administrativa %', def: 10, step: '0.1', min: 0 },
    { name: 'vatPercent', label: 'IVA sobre carga %', def: 21, step: '0.1', min: 0 },
    { name: 'lifeInsuranceMonthlyPercent', label: 'Seguro de vida mensual %', def: 0.05, step: '0.001', min: 0 },
    { name: 'awardFeePercent', label: 'Derecho de adjudicación %', def: 2, step: '0.1', min: 0 },
    { name: 'awardMonth', label: 'Adjudicación pactada (cuota, 0 = sin pactar)', def: 0, min: 0 },
  ],
  financing: [
    { name: 'price', label: 'Precio (ARS)', def: 28_900_000, min: 1, hint: 'Se toma de la lista activa si elegís un modelo' },
    { name: 'downPayment', label: 'Anticipo (ARS)', def: 12_000_000, min: 0 },
    { name: 'months', label: 'Plazo (meses)', def: 18, min: 1 },
    { name: 'tnaPercent', label: 'TNA %', def: 0, step: '0.01', min: 0 },
    { name: 'originationFeePercent', label: 'Gastos de otorgamiento %', def: 0, step: '0.1', min: 0 },
  ],
};

export default function QuotesPage() {
  const app = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { org } = useFilters();
  const { quotes, leads, priceDocs } = useScoped(org);
  const leadParam = params.get('lead') ?? '';
  const preLead = app.leads.find((l) => l.id === leadParam);
  const writable = ORGANIZATIONS.filter((o) => app.allowed('quote:write', o.id));
  const [kind, setKind] = useState<QuoteKind>('financing');
  const [qOrg, setQOrg] = useState<OrganizationId>(preLead?.organizationId ?? (isOrganizationId(org) ? org : (writable[0]?.id ?? 'cardys_fiat')));
  const [leadId, setLeadId] = useState(preLead?.id ?? '');
  const [model, setModel] = useState('');
  const [vehicle, setVehicle] = useState(preLead?.modelInterest ?? '');
  const [values, setValues] = useState<Record<string, number>>({});
  const [condition, setCondition] = useState(1);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [rejecting, setRejecting] = useState<Quote | null>(null);
  const [reason, setReason] = useState('');
  const today = toDay(new Date());

  const doc = activeDocument(app.priceDocs, 'price_list', qOrg, today);
  const priceKey = kind === 'savings' ? 'mobileValue' : kind === 'financing' ? 'price' : null;
  const fields = FIELDS[kind];
  const input = useMemo(() => {
    const v: Record<string, number> = {};
    for (const f of fields) v[f.name] = values[`${kind}.${f.name}`] ?? f.def;
    if (kind === 'used') v.condition = condition;
    return v;
  }, [condition, fields, kind, values]);

  const computed = useMemo(() => {
    try {
      return { result: computeQuote(kind, input), error: undefined };
    } catch (e) {
      return { result: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, kind]);

  const canWrite = app.allowed('quote:write', qOrg);
  const orgLeads = app.leads.filter((l) => l.organizationId === qOrg && l.status !== 'lost');

  function pickModel(key: string) {
    setModel(key);
    const row = doc?.rows.find((r) => `${r.model}|${r.version}` === key);
    if (row) {
      setVehicle(`${row.model} ${row.version}`.trim());
      if (priceKey) setValues((v) => ({ ...v, [`${kind}.${priceKey}`]: row.price }));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!computed.result) return;
    if (vehicle.trim().length < 2) return app.notify('Indicá el vehículo', 'error');
    setSaving(true);
    try {
      const q = await app.createQuote({
        organizationId: qOrg,
        leadId: leadId || undefined,
        kind,
        vehicle: kind === 'used' && !/toma/i.test(vehicle) ? `${vehicle.trim()} (toma)` : vehicle.trim(),
        input: { ...input, ...(model && { priceListItem: model }) },
        result: computed.result,
        priceDocumentId: model && doc ? doc.id : undefined,
      });
      app.notify(`Cotización #${q.number} guardada como borrador`);
    } catch (err) {
      app.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function act(q: Quote, action: QuoteAction, why?: string) {
    try {
      await app.transitionQuote(q, action, why);
      app.notify(`Cotización #${q.number}: ${action === 'submit' ? 'enviada a aprobación' : action === 'approve' ? 'aprobada' : 'rechazada'}`);
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  if (!app.allowed('quote:read', org)) {
    return (
      <>
        <PageHead eyebrow="Ventas" title="Cotizadores" />
        <div className="notice">Tu rol no tiene acceso a cotizaciones.</div>
      </>
    );
  }

  const list = quotes.filter((q) => statusFilter === 'all' || q.status === statusFilter);
  const pending = quotes.filter((q) => q.status === 'pending_approval').length;

  return (
    <>
      <PageHead eyebrow="Ventas" title="Cotizadores" sub="Presupuestos orientativos con aprobación de gerencia antes de entregarlos" />
      {app.allowed('quote:write', org) && (
        <div className="grid-2">
          <section className="panel">
            <div className="panel-head">
              <div className="tabs" role="group" aria-label="Tipo de cotización">
                {(Object.keys(QUOTE_KIND_LABEL) as QuoteKind[]).map((k) => (
                  <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setModel(''); }}>{QUOTE_KIND_LABEL[k]}</button>
                ))}
              </div>
            </div>
            <form onSubmit={save} noValidate style={{ display: 'grid', gap: 12 }}>
              <div className="form-grid">
                <label className="lbl">
                  Concesionario
                  <select className="field" value={qOrg} onChange={(e) => { setQOrg(e.target.value as OrganizationId); setLeadId(''); setModel(''); }}>
                    {writable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
                <label className="lbl">
                  Lead
                  <select className="field" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                    <option value="">Sin lead</option>
                    {orgLeads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.modelInterest ? ` · ${l.modelInterest}` : ''}</option>)}
                  </select>
                </label>
                {kind !== 'used' && (
                  <label className="lbl" style={{ gridColumn: '1 / -1' }}>
                    Modelo de la lista activa
                    <select className="field" value={model} onChange={(e) => pickModel(e.target.value)} disabled={!doc}>
                      <option value="">{doc ? 'Elegir de la lista…' : 'No hay lista de precios activa y vigente'}</option>
                      {doc?.rows.map((r) => (
                        <option key={`${r.model}|${r.version}`} value={`${r.model}|${r.version}`}>{r.model} {r.version} · {formatMoney(r.price)}</option>
                      ))}
                    </select>
                    {doc && <span className="faint">Fuente: {doc.title} (desde {doc.validFrom})</span>}
                  </label>
                )}
                <label className="lbl" style={{ gridColumn: '1 / -1' }}>
                  Vehículo *
                  <input className="field" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder={kind === 'used' ? 'Fiat Argo Precision 1.8 2019' : 'Fiat Cronos Drive 1.3'} maxLength={160} />
                </label>
                {kind === 'used' && (
                  <label className="lbl">
                    Estado
                    <select className="field" value={condition} onChange={(e) => setCondition(Number(e.target.value))}>
                      <option value={0}>Excelente</option>
                      <option value={1}>Bueno (−2,5%)</option>
                      <option value={2}>Regular (−7%)</option>
                    </select>
                  </label>
                )}
                {fields.map((f) => (
                  <label key={f.name} className="lbl">
                    {f.label}
                    <input
                      className="field"
                      type="number"
                      inputMode="decimal"
                      step={f.step ?? '1'}
                      min={f.min}
                      max={f.max}
                      value={input[f.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [`${kind}.${f.name}`]: e.target.value === '' ? NaN : Number(e.target.value) }))}
                    />
                    {f.hint && <span className="faint">{f.hint}</span>}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn" disabled={!canWrite || !computed.result || saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
              </div>
            </form>
          </section>
          <section className="panel" aria-live="polite">
            <div className="eyebrow">Resumen</div>
            {computed.error ? (
              <div className="notice error" style={{ marginTop: 12 }}>{computed.error}</div>
            ) : (
              computed.result && (
                <div className="quote-result" style={{ marginTop: 12 }}>
                  <div className="faint">{headline(kind, computed.result).label}</div>
                  <div className="big">{formatMoney(headline(kind, computed.result).value ?? null)}</div>
                  <Breakdown kind={kind} result={computed.result} />
                </div>
              )
            )}
            <div className="notice" style={{ marginTop: 12 }}>
              {kind === 'savings'
                ? 'Plan de ahorro: la cuota se calcula sin tasa (alícuota + carga administrativa + IVA + seguro) y acompaña al valor móvil. Validar con el contrato del plan.'
                : kind === 'financing'
                  ? 'Sistema francés. No incluye seguros ni impuestos sobre intereses salvo que se carguen como gastos.'
                  : 'Valor orientativo de toma. Requiere peritaje del vehículo.'}{' '}
              Toda cotización requiere aprobación de gerencia antes de entregarse al cliente.
            </div>
          </section>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Cotizaciones {pending > 0 && <span className="tag gold">{pending} pendientes de aprobación</span>}</h2>
          <select className="field" aria-label="Estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as QuoteStatus | 'all')}>
            <option value="all">Todos los estados</option>
            {(Object.keys(QUOTE_STATUS_LABEL) as QuoteStatus[]).map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>N.º</th><th>Tipo / vehículo</th><th>Lead</th><th className="num">Resultado</th><th>Estado</th><th>Autor</th><th></th></tr></thead>
            <tbody>
              {list.map((q) => {
                const h = headline(q.kind, q.result);
                const lead = leads.find((l) => l.id === q.leadId);
                return (
                  <tr key={q.id}>
                    <td><Link className="star" href={`/quotes/view?id=${q.id}`}>#{q.number}</Link><div className="faint">{orgName(q.organizationId)}</div></td>
                    <td>{QUOTE_KIND_LABEL[q.kind]}<div className="faint">{q.vehicle}</div></td>
                    <td>{lead?.name ?? <span className="faint">—</span>}</td>
                    <td className="num">{formatMoney(h.value ?? null)}<div className="faint">{h.label}</div></td>
                    <td>
                      <span className={`tag ${STATUS_TONE[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
                      {q.decidedReason && <div className="faint">{q.decidedReason}</div>}
                    </td>
                    <td>{q.createdByName ?? '—'}{q.decidedByName && <div className="faint">Decidió: {q.decidedByName}</div>}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {app.canQuote(q, 'submit') && <button className="btn secondary sm" onClick={() => act(q, 'submit')}>Enviar a aprobación</button>}{' '}
                      {app.canQuote(q, 'approve') && <button className="btn sm" onClick={() => act(q, 'approve')}>Aprobar</button>}{' '}
                      {app.canQuote(q, 'reject') && <button className="btn danger sm" onClick={() => { setRejecting(q); setReason(''); }}>Rechazar</button>}{' '}
                      <button className="btn ghost sm" onClick={() => router.push(`/quotes/view?id=${q.id}`)}>Ver</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <div className="empty">No hay cotizaciones con este filtro.</div>}
        </div>
      </section>

      <Dialog
        open={!!rejecting}
        title={`Rechazar cotización #${rejecting?.number ?? ''}`}
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setRejecting(null)}>Cancelar</button>
            <button className="btn danger" disabled={!reason.trim()} onClick={() => { if (rejecting) void act(rejecting, 'reject', reason); setRejecting(null); }}>Rechazar</button>
          </>
        }
      >
        <label className="lbl">
          Motivo (lo ve el asesor)
          <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej.: anticipo mínimo 40%" />
        </label>
      </Dialog>
    </>
  );
}
