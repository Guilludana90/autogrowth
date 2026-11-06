'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { PageHead, Stat } from '@/components/ui';
import { feedbackStats, learningInsights, lineDiff, NEEDS_REASON, PROMPT_ACTION_LABEL, suggestNextVersion, VERSION_RE } from '@/lib/domain/governance';
import { ANALYZERS, ORGANIZATIONS, orgName, PROMPT_STATUS_LABEL, type AnalyzerName, type OrganizationId, type PromptAction, type PromptVersion } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const ACTIONS: PromptAction[] = ['submit', 'approve', 'reject', 'activate', 'rollback'];
const AREA: Record<string, string> = { media: 'Pauta', capture: 'Captura al CRM', sales: 'Gestión comercial', data: 'Datos faltantes', none: 'Sin problema' };
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`);

/** AI Governance: prompts versionados con revisión humana, publicación explícita y rollback; feedback y aprendizaje medidos. */
export default function GovernancePage() {
  const app = useApp();
  const { org } = useFilters();
  const { prompts, runs, feedback } = useScoped(org);
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PromptVersion | null>(null);
  const [pending, setPending] = useState<{ v: PromptVersion; action: PromptAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showDiff, setShowDiff] = useState(true);

  const sorted = useMemo(() => [...prompts].sort((a, b) => a.organizationId.localeCompare(b.organizationId) || b.createdAt.localeCompare(a.createdAt)), [prompts]);
  const selected = sorted.find((p) => p.id === selectedId) ?? sorted.find((p) => p.status === 'in_review') ?? sorted[0];
  const activeFor = (v: PromptVersion) => prompts.find((p) => p.organizationId === v.organizationId && p.name === v.name && p.status === 'active');
  const events = selected ? app.promptEvents.filter((e) => e.versionId === selected.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];

  const stats = useMemo(() => feedbackStats(feedback, runs), [feedback, runs]);
  const notUseful = feedback.filter((f) => !f.useful && f.comment).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const insights = learningInsights(stats, notUseful.map((f) => f.comment!));
  const activeCount = prompts.filter((p) => p.status === 'active').length;
  const awaiting = prompts.filter((p) => p.status === 'in_review' || p.status === 'approved').length;
  const canDraftAny = ORGANIZATIONS.some((o) => (org === 'all' || o.id === org) && app.allowed('prompt:draft', o.id));

  async function act(v: PromptVersion, action: PromptAction, reason?: string) {
    setBusy(true);
    setError(undefined);
    try {
      const next = await app.transitionPrompt(v, action, reason);
      app.notify(`${next.version}: ${PROMPT_STATUS_LABEL[next.status][0].toLowerCase()}`);
      setPending(null);
      setSelectedId(next.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!app.allowed('prompt:read', org)) {
    return <div className="notice warn">Tu rol no tiene acceso a AI Governance.</div>;
  }

  return (
    <>
      <PageHead
        eyebrow="Mejora continua gobernada"
        title="AI Governance"
        sub="El sistema nunca modifica solo un prompt en producción: cada cambio nace como borrador, pasa por revisión y solo Super Admin aprueba, publica o vuelve atrás."
        actions={canDraftAny && <button className="btn" onClick={() => setCreating(true)}>+ Nuevo borrador</button>}
      />
      <div className="stats">
        <Stat label="Feedback de recomendaciones" value={stats.total} hint={`${stats.useful} útiles`} />
        <Stat label="Tasa útil" value={pct(stats.usefulRate)} hint={stats.total ? `Sobre ${stats.total} ${stats.total === 1 ? 'respuesta' : 'respuestas'}` : 'Todavía sin respuestas'} />
        <Stat label="Versiones de prompt" value={prompts.length} hint={`${activeCount} ${activeCount === 1 ? 'activa' : 'activas'} · ${awaiting} esperando aprobación o publicación`} />
        <Stat label="Diagnósticos guardados" value={runs.length} hint={`${runs.filter((r) => r.engine === 'ai').length} con IA · ${runs.filter((r) => r.engine === 'rules').length} de reglas`} />
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}

      <div className="grid-2">
        <section className="panel" aria-labelledby="pv">
          <div className="panel-head">
            <h2 id="pv">Versiones de prompt</h2>
            <span className="faint">Una sola versión activa por analizador y concesionario</span>
          </div>
          {!sorted.length ? (
            <div className="empty">Todavía no hay versiones. {canDraftAny ? 'Creá el primer borrador.' : 'Un Super Admin o Gerente puede crear el primero.'}</div>
          ) : (
            <ul className="versions">
              {sorted.map((p) => {
                const [sl, st] = PROMPT_STATUS_LABEL[p.status];
                return (
                  <li key={p.id}>
                    <button aria-current={selected?.id === p.id} onClick={() => setSelectedId(p.id)}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{ANALYZERS[p.name]} · {p.version}</strong>
                        <span className={`tag ${st}`}>{sl}</span>
                        {org === 'all' && <span className="faint">{orgName(p.organizationId)}</span>}
                      </span>
                      <span className="faint">
                        Autor: {p.createdByName ?? 'sin nombre'} · {p.approvedByName ? `Aprobó: ${p.approvedByName}` : 'Sin aprobación'} · {fmt(p.createdAt)}
                      </span>
                      {p.changeNote && <span className="muted" style={{ fontSize: 13 }}>{p.changeNote}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="li">
          <div className="panel-head"><h2 id="li">✧ Aprendizaje del feedback</h2></div>
          <ul className="insights">{insights.map((t) => <li key={t}>{t}</li>)}</ul>
          {stats.byVersion.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 18 }}>Por versión</div>
              <table style={{ minWidth: 0 }}>
                <tbody>
                  {stats.byVersion.map((v) => (
                    <tr key={v.version}><td>{v.version}</td><td className="num">{v.total}</td><td className="num">{pct(v.usefulRate)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="section-title" style={{ marginTop: 14 }}>Por tema</div>
              <table style={{ minWidth: 0 }}>
                <tbody>
                  {stats.byArea.map((a) => (
                    <tr key={a.area}><td>{AREA[a.area]}</td><td className="num">{a.total}</td><td className="num">{pct(a.usefulRate)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {notUseful.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 14 }}>Comentarios “no útil”</div>
              <ul className="insights">
                {notUseful.slice(0, 5).map((f) => (
                  <li key={f.id}>“{f.comment}” <span className="faint">· {f.userName ?? 'usuario'} · {fmt(f.createdAt)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {selected && (
        <section className="panel" aria-labelledby="pd">
          <div className="panel-head">
            <div>
              <h2 id="pd">{ANALYZERS[selected.name]} · {selected.version} <span className={`tag ${PROMPT_STATUS_LABEL[selected.status][1]}`}>{PROMPT_STATUS_LABEL[selected.status][0]}</span></h2>
              <div className="faint">
                {orgName(selected.organizationId)} · Autor {selected.createdByName ?? 'sin nombre'} · Enviada {fmt(selected.submittedAt)} · Aprobada {selected.approvedByName ? `por ${selected.approvedByName} ${fmt(selected.approvedAt)}` : '—'} · Publicada {fmt(selected.activatedAt)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.status === 'draft' && selected.createdBy === app.session?.userId && (
                <button className="btn secondary" onClick={() => setEditing(selected)}>Editar borrador</button>
              )}
              {ACTIONS.filter((a) => app.canPromptAction(selected, a)).map((a) => (
                <button
                  key={a}
                  className={a === 'reject' ? 'btn danger' : a === 'approve' || a === 'activate' ? 'btn' : 'btn secondary'}
                  disabled={busy}
                  onClick={() => (NEEDS_REASON.has(a) || a === 'activate' ? setPending({ v: selected, action: a }) : act(selected, a))}
                >
                  {PROMPT_ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
          {ACTIONS.every((a) => !app.canPromptAction(selected, a)) && selected.status !== 'active' && selected.status !== 'rejected' && (
            <p className="faint">
              {selected.status === 'draft' ? 'Solo el autor envía este borrador a revisión.' : 'Solo Super Admin aprueba, rechaza, publica o vuelve a esta versión.'}
            </p>
          )}
          {selected.decidedReason && <div className="notice">Motivo registrado: {selected.decidedReason}</div>}

          {(() => {
            const active = activeFor(selected);
            const compare = active && active.id !== selected.id;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div className="section-title" style={{ margin: 0 }}>{compare && showDiff ? `Cambios contra la versión activa (${active.version})` : 'Texto del prompt'}</div>
                  {compare && (
                    <button className="btn ghost sm" onClick={() => setShowDiff((d) => !d)}>{showDiff ? 'Ver texto completo' : `Comparar con ${active.version}`}</button>
                  )}
                </div>
                <div className="diff" aria-label="Texto del prompt">
                  {(compare && showDiff ? lineDiff(active.promptText, selected.promptText) : selected.promptText.split('\n').map((text) => ({ kind: 'same' as const, text }))).map((l, i) => (
                    <div key={i} className={l.kind}>
                      {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}
                      {l.text || ' '}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          <div className="section-title" style={{ marginTop: 16 }}>Historial (inmutable)</div>
          {!events.length ? (
            <div className="faint">Sin eventos registrados.</div>
          ) : (
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id} data-kind={e.toStatus === 'active' ? 'quote' : 'status'}>
                  <time>{fmt(e.createdAt)}</time>
                  {e.fromStatus ? `${PROMPT_STATUS_LABEL[e.fromStatus][0]} → ` : 'Creada como '}
                  {PROMPT_STATUS_LABEL[e.toStatus][0]} · {e.actorName ?? 'sistema'}
                  {e.reason && <span className="muted"> · “{e.reason}”</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {creating && <DraftDialog org={org} onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />}
      {editing && <EditDialog v={editing} onClose={() => setEditing(null)} />}
      {pending && <ReasonDialog pending={pending} busy={busy} onClose={() => setPending(null)} onConfirm={(r) => act(pending.v, pending.action, r)} activeVersion={activeFor(pending.v)?.version} />}
    </>
  );
}

function ReasonDialog({ pending, busy, onClose, onConfirm, activeVersion }: { pending: { v: PromptVersion; action: PromptAction }; busy: boolean; onClose: () => void; onConfirm: (reason?: string) => void; activeVersion?: string }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const required = NEEDS_REASON.has(pending.action);
  const label = PROMPT_ACTION_LABEL[pending.action];
  const lead =
    pending.action === 'activate'
      ? `Publicar ${pending.v.version} hace que el análisis con IA la use desde ahora.${activeVersion ? ` ${activeVersion} queda retirada y se puede volver a ella.` : ''}`
      : pending.action === 'rollback'
        ? `${pending.v.version} vuelve a estar activa${activeVersion ? ` y ${activeVersion} queda retirada` : ''}.`
        : `${pending.v.version} queda rechazada; el autor puede crear una versión nueva.`;
  return (
    <Dialog
      open
      title={`${label} · ${pending.v.version}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button
            className={pending.action === 'reject' ? 'btn danger' : 'btn'}
            disabled={busy}
            onClick={() => {
              if (required && reason.trim().length < 5) return setError('Escribí el motivo (mínimo 5 caracteres): queda en el historial.');
              onConfirm(reason.trim() || undefined);
            }}
          >
            {busy ? 'Guardando…' : label}
          </button>
        </>
      }
    >
      <p className="muted">{lead}</p>
      <label className="lbl">
        Motivo {required ? '*' : '(opcional)'}
        <textarea className="field" style={{ minHeight: 90, fontFamily: 'inherit' }} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      {error && <div className="notice error" role="alert">{error}</div>}
    </Dialog>
  );
}

function DraftDialog({ org, onClose, onCreated }: { org: OrganizationId | 'all'; onClose: () => void; onCreated: (id: string) => void }) {
  const app = useApp();
  const orgs = ORGANIZATIONS.filter((o) => (org === 'all' || o.id === org) && app.allowed('prompt:draft', o.id));
  const [target, setTarget] = useState<OrganizationId>(orgs[0]?.id ?? 'cardys_fiat');
  const name: AnalyzerName = 'campaign_analyst';
  const existing = app.prompts.filter((p) => p.organizationId === target && p.name === name);
  const base = existing.find((p) => p.status === 'active') ?? existing[existing.length - 1];
  const [version, setVersion] = useState(suggestNextVersion(existing));
  const [text, setText] = useState(base?.promptText ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  function changeOrg(o: OrganizationId) {
    setTarget(o);
    const ex = app.prompts.filter((p) => p.organizationId === o && p.name === name);
    setVersion(suggestNextVersion(ex));
    setText((ex.find((p) => p.status === 'active') ?? ex[ex.length - 1])?.promptText ?? '');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!VERSION_RE.test(version.trim())) return setError('La versión tiene que tener el formato v1.3.');
    if (existing.some((p) => p.version === version.trim())) return setError(`Ya existe ${version.trim()} para este concesionario.`);
    if (text.trim().length < 20) return setError('El prompt es demasiado corto (mínimo 20 caracteres).');
    if (!note.trim()) return setError('Contá qué cambia y por qué: lo lee quien revisa.');
    setSaving(true);
    setError(undefined);
    try {
      const v = await app.createPromptDraft({ organizationId: target, name, version: version.trim(), promptText: text, changeNote: note.trim() });
      app.notify(`Borrador ${v.version} creado. Envialo a revisión cuando esté listo.`);
      onCreated(v.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open title="Nuevo borrador de prompt" onClose={onClose} wide>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <p className="faint" style={{ margin: 0 }}>
          El borrador no afecta a nadie hasta que un Super Admin lo apruebe y lo publique. {base ? `Parte del texto de ${base.version}.` : ''}
        </p>
        <div className="form-grid">
          <label className="lbl">
            Concesionario
            <select className="field" value={target} onChange={(e) => changeOrg(e.target.value as OrganizationId)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="lbl">
            Analizador
            <select className="field" value={name} disabled>
              <option value={name}>{ANALYZERS[name]}</option>
            </select>
          </label>
          <label className="lbl">
            Versión *
            <input className="field" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={12} />
          </label>
        </div>
        <label className="lbl">
          Qué cambia y por qué *
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej.: prioriza captura cuando la brecha Ads/CRM supera 25%" />
        </label>
        <label className="lbl">
          Texto del prompt (system) *
          <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
        </label>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear borrador'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function EditDialog({ v, onClose }: { v: PromptVersion; onClose: () => void }) {
  const app = useApp();
  const [text, setText] = useState(v.promptText);
  const [note, setNote] = useState(v.changeNote ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 20) return setError('El prompt es demasiado corto (mínimo 20 caracteres).');
    setSaving(true);
    setError(undefined);
    try {
      await app.updatePromptDraft(v, text, note);
      app.notify(`Borrador ${v.version} guardado`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open title={`Editar borrador · ${v.version}`} onClose={onClose} wide>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <label className="lbl">
          Qué cambia y por qué
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <label className="lbl">
          Texto del prompt (system) *
          <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
        </label>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
        </div>
      </form>
    </Dialog>
  );
}
