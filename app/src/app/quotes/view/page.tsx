'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Breakdown } from '@/components/QuoteBreakdown';
import { formatDay } from '@/lib/domain/dates';
import { formatMoney } from '@/lib/domain/metrics';
import { formatArPhone } from '@/lib/domain/phone';
import { headline } from '@/lib/domain/quotes';
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, orgName } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';

/** Propuesta imprimible. Solo una cotización aprobada sale sin la marca de BORRADOR. */
export default function QuoteView() {
  const app = useApp();
  const id = useSearchParams().get('id');
  const q = app.quotes.find((x) => x.id === id);
  if (!q) {
    return (
      <div className="notice warn">
        No encontramos la cotización o no tenés acceso. <Link href="/quotes">Volver a cotizaciones</Link>
      </div>
    );
  }
  const lead = app.leads.find((l) => l.id === q.leadId);
  const doc = app.priceDocs.find((d) => d.id === q.priceDocumentId);
  const h = headline(q.kind, q.result);
  const final = q.status === 'approved';
  const expired = q.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link className="btn ghost" href="/quotes">← Cotizaciones</Link>
        <button className="btn" onClick={() => window.print()}>{final ? 'Imprimir / guardar PDF' : 'Imprimir borrador'}</button>
        {!final && <span className="notice warn" style={{ margin: 0 }}>Hasta que gerencia la apruebe, la propuesta sale marcada como borrador.</span>}
      </div>
      <article className="proposal">
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Image src="/autogrowth-logo.png" alt="" width={44} height={44} />
            <div>
              <h1 style={{ fontSize: 22 }}>{orgName(q.organizationId)}</h1>
              <div className="muted">Propuesta comercial N.º {q.number}</div>
            </div>
          </div>
          {!final && <span className="watermark">{QUOTE_STATUS_LABEL[q.status].toUpperCase()} · NO VÁLIDA</span>}
          {final && expired && <span className="watermark">VENCIDA</span>}
        </header>
        <hr style={{ border: 0, borderTop: '1px solid #e4e1ef', margin: '20px 0' }} />
        <dl className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
          <dt className="muted">Cliente</dt><dd>{lead ? `${lead.name} · ${formatArPhone(lead.phoneE164)}` : '—'}</dd>
          <dt className="muted">Tipo</dt><dd>{QUOTE_KIND_LABEL[q.kind]}</dd>
          <dt className="muted">Vehículo</dt><dd>{q.vehicle}</dd>
          <dt className="muted">Fecha</dt><dd>{formatDay(q.createdAt)}</dd>
          <dt className="muted">Válida hasta</dt><dd>{formatDay(q.validUntil)}</dd>
          {doc && (<><dt className="muted">Lista de precios</dt><dd>{doc.title} (vigente desde {formatDay(doc.validFrom)})</dd></>)}
          <dt className="muted">Preparó</dt><dd>{q.createdByName ?? '—'}</dd>
          {q.decidedByName && (<><dt className="muted">{q.status === 'approved' ? 'Aprobó' : 'Decidió'}</dt><dd>{q.decidedByName}{q.decidedAt ? ` · ${formatDay(q.decidedAt)}` : ''}</dd></>)}
        </dl>
        <div style={{ margin: '24px 0 8px' }} className="muted">{h.label}</div>
        <div style={{ fontSize: 34, fontWeight: 700 }}>{formatMoney(h.value ?? null)}</div>
        <div style={{ marginTop: 16 }}>
          <Breakdown kind={q.kind} result={q.result} />
        </div>
        <p className="faint" style={{ marginTop: 24, fontSize: 11, lineHeight: 1.6 }}>
          Presupuesto orientativo sujeto a disponibilidad, aprobación crediticia y condiciones vigentes al momento de la operación.
          {q.kind === 'savings' && ' En planes de ahorro las cuotas acompañan el valor móvil del vehículo y la adjudicación depende de sorteo, licitación o lo pactado en el contrato.'}
          {q.kind === 'financing' && ' Los montos no incluyen seguros ni impuestos salvo que figuren en el desglose.'}
          {q.kind === 'used' && ' El valor de toma queda sujeto al peritaje del vehículo.'}
        </p>
      </article>
    </>
  );
}
