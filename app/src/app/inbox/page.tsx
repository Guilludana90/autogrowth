'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { LeadDrawer } from '@/components/LeadDrawer';
import { PageHead, Stat } from '@/components/ui';
import { formatArPhone } from '@/lib/domain/phone';
import { currentConsent, inboxThreads, medianResponseMinutes, outboundCheck } from '@/lib/domain/postventa';
import { CHANNELS, CHANNEL_LABEL, CONSENT_CHANNELS, orgName, type Channel, type ConsentChannel, type ConsentEvent, type Lead } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const when = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const minutes = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} días`);
/** Valor para <input type="datetime-local"> en hora local. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function InboxPage() {
  const app = useApp();
  const { org } = useFilters();
  const { messages, consents, leads } = useScoped(org);
  const [filter, setFilter] = useState<'all' | 'awaiting'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const now = new Date();
  const threads = useMemo(() => inboxThreads(messages, new Date()), [messages]);
  const shown = filter === 'awaiting' ? threads.filter((t) => t.awaitingReply) : threads;
  const leadById = useMemo(() => new Map(app.leads.map((l) => [l.id, l])), [app.leads]);
  const activeId = selected ?? shown[0]?.leadId ?? null;
  const activeLead = activeId ? leadById.get(activeId) : undefined;
  const median = medianResponseMinutes(messages);
  const awaiting = threads.filter((t) => t.awaitingReply).length;
  const canLog = app.allowed('conversation:log', org);

  return (
    <>
      <PageHead
        eyebrow="Ventas"
        title="Inbox de conversaciones"
        sub="Registro de lo conversado con cada cliente por cualquier canal, con consentimiento y ventanas de respuesta controladas"
        actions={canLog && <button className="btn" onClick={() => setStarting(true)}>+ Registrar conversación</button>}
      />
      <div className="notice" role="note" style={{ marginBottom: 16 }}>
        <strong>Registro manual.</strong> AutoGrowth no envía ni recibe mensajes: WhatsApp, Instagram y Messenger no están conectados. Lo que se carga acá deja constancia
        de una conversación que ocurrió por fuera y queda en el historial del lead.
      </div>
      <div className="stats">
        <Stat label="Esperando respuesta" value={<span className={awaiting ? 'due-overdue' : undefined}>{awaiting}</span>} hint="El último mensaje es del cliente" />
        <Stat label="Tiempo de respuesta (mediana)" value={median === null ? '—' : minutes(median)} hint={median === null ? 'Sin pares mensaje/respuesta registrados' : 'Medido sobre lo registrado, no estimado'} />
        <Stat label="Conversaciones" value={threads.length} />
        <Stat label="Consentimientos vigentes" value={countGranted(consents)} hint="WhatsApp y email" />
      </div>
      <section className="panel">
        {threads.length === 0 ? (
          <div className="empty">Todavía no hay conversaciones registradas.{canLog ? ' Usá “Registrar conversación” para cargar la primera.' : ''}</div>
        ) : (
          <div className="inbox">
            <div>
              <div className="tabs" role="group" aria-label="Filtro" style={{ marginBottom: 10 }}>
                <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
                <button aria-pressed={filter === 'awaiting'} onClick={() => setFilter('awaiting')}>Sin responder ({awaiting})</button>
              </div>
              <ul className="kb-list" aria-label="Conversaciones">
                {shown.map((t) => (
                  <li key={t.leadId}>
                    <button aria-current={t.leadId === activeId} onClick={() => setSelected(t.leadId)}>
                      <strong>{leadById.get(t.leadId)?.name ?? 'Lead'}</strong>
                      <span className="faint">{t.channels.map((c) => CHANNEL_LABEL[c]).join(' · ')} · {when(t.last.occurredAt)}</span>
                      <span className="faint inbox-snippet">{t.last.direction === 'in' ? '' : 'Vos: '}{t.last.body}</span>
                      {t.awaitingReply && <span className="tag amber">Esperando hace {minutes(t.waitingMinutes ?? 0)}</span>}
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="empty">No hay conversaciones esperando respuesta.</li>}
              </ul>
            </div>
            {activeId && activeLead ? (
              <Conversation lead={activeLead} onOpenLead={() => setOpenLead(activeLead)} now={now} />
            ) : (
              <div className="empty">Elegí una conversación.</div>
            )}
          </div>
        )}
      </section>
      {starting && (
        <StartDialog
          leads={leads}
          onClose={() => setStarting(false)}
          onPicked={(id) => {
            setStarting(false);
            setFilter('all');
            setSelected(id);
          }}
        />
      )}
      <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} />
    </>
  );
}

function countGranted(consents: readonly ConsentEvent[]) {
  const pairs = new Map(consents.map((c) => [`${c.leadId}|${c.channel}`, c] as const));
  return [...pairs.values()].filter((c) => currentConsent(consents, c.leadId, c.channel)?.granted).length;
}

function consentLabel(c: ConsentChannel, cur: ConsentEvent | undefined) {
  const name = c === 'whatsapp' ? 'WhatsApp' : 'Email';
  return cur ? `${name}: ${cur.granted ? 'con consentimiento' : 'revocado'}` : `${name}: sin consentimiento`;
}

function Conversation({ lead, onOpenLead, now }: { lead: Lead; onOpenLead: () => void; now: Date }) {
  const app = useApp();
  const msgs = app.messages.filter((m) => m.leadId === lead.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const [consentFor, setConsentFor] = useState<ConsentChannel | null>(null);
  return (
    <div className="convo">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <button className="linklike" onClick={onOpenLead}><strong>{lead.name}</strong></button>
          <div className="faint">{orgName(lead.organizationId)}{lead.phoneE164 ? ` · ${formatArPhone(lead.phoneE164)}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CONSENT_CHANNELS.map((c) => {
            const cur = currentConsent(app.consents, lead.id, c);
            const label = consentLabel(c, cur);
            return (
              <button key={c} className={`tag ${cur?.granted ? 'green' : cur ? 'red' : 'gray'}`} style={{ cursor: app.allowed('conversation:log', lead.organizationId) ? 'pointer' : 'default' }} title={cur ? `${cur.source}${cur.evidence ? ` · ${cur.evidence}` : ''} · ${when(cur.createdAt)}` : 'Sin registro'} onClick={() => app.allowed('conversation:log', lead.organizationId) && setConsentFor(c)}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <ol className="bubbles" aria-label={`Mensajes con ${lead.name}`}>
        {msgs.map((m) => (
          <li key={m.id} className={m.direction}>
            <div>{m.body}</div>
            <span className="faint">{CHANNEL_LABEL[m.channel]} · {when(m.occurredAt)}{m.loggedByName ? ` · registró ${m.loggedByName}` : ''}</span>
          </li>
        ))}
        {msgs.length === 0 && <li className="empty">Sin mensajes registrados con este cliente.</li>}
      </ol>
      {app.allowed('conversation:log', lead.organizationId) ? <LogForm lead={lead} now={now} /> : <p className="faint">Tu rol puede leer, no registrar.</p>}
      {consentFor && <ConsentDialog lead={lead} channel={consentFor} onClose={() => setConsentFor(null)} />}
    </div>
  );
}

function LogForm({ lead, now }: { lead: Lead; now: Date }) {
  const app = useApp();
  const last = app.messages.filter((m) => m.leadId === lead.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const [channel, setChannel] = useState<Channel>(last?.channel ?? 'whatsapp');
  const [direction, setDirection] = useState<'in' | 'out'>(last?.direction === 'in' ? 'out' : 'in');
  const [body, setBody] = useState('');
  const [at, setAt] = useState(localInput(now));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const occurredAt = at ? new Date(at).toISOString() : '';
  const check = direction === 'out' && occurredAt ? outboundCheck(channel, lead.id, app.consents, app.messages, new Date(occurredAt)) : { ok: true as const };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim().length < 2) return setError('Escribí el contenido del mensaje.');
    if (!occurredAt || Date.parse(occurredAt) > Date.now() + 60_000) return setError('La fecha no puede ser futura.');
    if (!check.ok) return setError(check.reason);
    setSaving(true);
    setError(undefined);
    try {
      await app.logMessage({ organizationId: lead.organizationId, leadId: lead.id, channel, direction, body: body.trim(), occurredAt });
      app.notify('Mensaje registrado en el historial');
      setBody('');
      setDirection(direction === 'in' ? 'out' : 'in');
      setAt(localInput(new Date()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="log-form">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="tabs" role="group" aria-label="Dirección">
          <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>Escribió el cliente</button>
          <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>Respondimos</button>
        </div>
        <select className="field" aria-label="Canal" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
        <input className="field" type="datetime-local" aria-label="Cuándo ocurrió" value={at} max={localInput(new Date())} onChange={(e) => setAt(e.target.value)} />
      </div>
      <textarea className="field" rows={3} maxLength={4000} aria-label="Contenido del mensaje" placeholder={direction === 'in' ? 'Qué dijo el cliente…' : 'Qué le respondimos…'} value={body} onChange={(e) => setBody(e.target.value)} />
      {!check.ok && <div className="notice warn" role="status">{check.reason} No se puede registrar una respuesta por este canal.</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" disabled={saving || !check.ok}>{saving ? 'Guardando…' : 'Registrar mensaje'}</button>
      </div>
    </form>
  );
}

function ConsentDialog({ lead, channel, onClose }: { lead: Lead; channel: ConsentChannel; onClose: () => void }) {
  const app = useApp();
  const cur = currentConsent(app.consents, lead.id, channel);
  const history = app.consents.filter((c) => c.leadId === lead.id && c.channel === channel).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [granted, setGranted] = useState(!cur?.granted);
  const [source, setSource] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const name = channel === 'whatsapp' ? 'WhatsApp' : 'email';

  async function save() {
    if (source.trim().length < 3) return setError('Indicá cómo se obtuvo (formulario web, pedido verbal en el salón, respuesta "BAJA"…).');
    setSaving(true);
    setError(undefined);
    try {
      await app.recordConsent({ organizationId: lead.organizationId, leadId: lead.id, channel, granted, source: source.trim(), evidence: evidence.trim() || undefined });
      app.notify(granted ? `Consentimiento de ${name} registrado` : `Revocación de ${name} registrada`);
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
      title={`Consentimiento de ${name} · ${lead.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Volver</button>
          <button className="btn" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Registrar'}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="muted" style={{ margin: 0 }}>Estado actual: {cur ? (cur.granted ? 'otorgado' : 'revocado') : 'sin registro'}. Cada cambio queda como un evento nuevo; nada se borra.</p>
        <div className="tabs" role="group" aria-label="Tipo de registro">
          <button type="button" aria-pressed={granted} onClick={() => setGranted(true)}>Otorga</button>
          <button type="button" aria-pressed={!granted} onClick={() => setGranted(false)}>Revoca</button>
        </div>
        <label className="lbl">
          Origen *
          <input className="field" value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} placeholder="Formulario web, firma en recepción…" autoFocus />
        </label>
        <label className="lbl">
          Evidencia
          <input className="field" value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={300} placeholder="Nº de formulario, captura, referencia" />
        </label>
        {error && <div className="notice error" role="alert">{error}</div>}
        {history.length > 0 && (
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.id} data-kind="status">
                <strong>{h.granted ? 'Otorgó' : 'Revocó'}</strong> <span className="faint">· {h.source}{h.actorName ? ` · ${h.actorName}` : ''}</span>
                {h.evidence && <div>{h.evidence}</div>}
                <time>{when(h.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function StartDialog({ leads, onClose, onPicked }: { leads: Lead[]; onClose: () => void; onPicked: (leadId: string) => void }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const options = leads
    .filter((l) => app.allowed('conversation:log', l.organizationId))
    .filter((l) => !q.trim() || `${l.name} ${l.phoneE164 ?? ''} ${l.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 50);
  return (
    <Dialog open title="Registrar conversación" onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="lbl">
          Buscar lead
          <input className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, teléfono o email" autoFocus />
        </label>
        <ul className="kb-list" aria-label="Leads">
          {options.map((l) => (
            <li key={l.id}>
              <button onClick={() => onPicked(l.id)}>
                <strong>{l.name}</strong>
                <span className="faint">{orgName(l.organizationId)}{l.phoneE164 ? ` · ${l.phoneE164}` : ''}</span>
              </button>
            </li>
          ))}
          {options.length === 0 && <li className="empty">Ningún lead coincide. Si es un cliente nuevo, primero crealo en Leads & CRM.</li>}
        </ul>
      </div>
    </Dialog>
  );
}
