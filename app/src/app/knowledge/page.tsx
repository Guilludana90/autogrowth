'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { ReasonDialog } from '@/components/ReasonDialog';
import { PageHead, Stat, ToneTag } from '@/components/ui';
import { formatDay, toDay } from '@/lib/domain/dates';
import { lineDiff } from '@/lib/domain/governance';
import { KNOWLEDGE_ACTION_LABEL, isArticleCurrent, searchKnowledge, type KnowledgeAction } from '@/lib/domain/postventa';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABEL,
  KNOWLEDGE_STATUS_LABEL,
  ORGANIZATIONS,
  orgName,
  type KnowledgeArticle,
  type KnowledgeCategory,
  type OrganizationId,
} from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

type View = 'current' | 'review' | 'drafts' | 'old' | 'all';
const VIEW_LABEL: Record<View, string> = { current: 'Vigentes', review: 'En revisión', drafts: 'Borradores', old: 'Archivados o vencidos', all: 'Todos' };

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'articulo';

export default function KnowledgePage() {
  const app = useApp();
  const { org } = useFilters();
  const { knowledge } = useScoped(org);
  const today = toDay(new Date());
  const [view, setView] = useState<View>('current');
  const [category, setCategory] = useState<'all' | KnowledgeCategory>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ base?: KnowledgeArticle; draft?: KnowledgeArticle } | null>(null);

  const rows = useMemo(() => {
    const filtered = knowledge.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      switch (view) {
        case 'current':
          return isArticleCurrent(a, today);
        case 'review':
          return a.status === 'in_review';
        case 'drafts':
          return a.status === 'draft';
        case 'old':
          return a.status === 'archived' || (a.status === 'published' && !isArticleCurrent(a, today));
        default:
          return true;
      }
    });
    return q.trim() ? searchKnowledge(filtered, q) : filtered.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  }, [category, knowledge, q, today, view]);

  const selected = rows.find((a) => a.id === selectedId) ?? (selectedId ? knowledge.find((a) => a.id === selectedId) : undefined) ?? rows[0];
  const canEdit = app.allowed('knowledge:edit', org);
  const current = knowledge.filter((a) => isArticleCurrent(a, today)).length;
  const review = knowledge.filter((a) => a.status === 'in_review').length;
  const expiring = knowledge.filter((a) => isArticleCurrent(a, today) && a.validTo && a.validTo <= toDay(new Date(Date.now() + 30 * 86_400_000))).length;

  return (
    <>
      <PageHead
        eyebrow="Ventas y postventa"
        title="Base de conocimiento"
        sub="Respuestas aprobadas para vendedores y taller. Cada cambio es una versión nueva que revisa un gerente."
        actions={canEdit && <button className="btn" onClick={() => setEditing({})}>+ Nuevo artículo</button>}
      />
      <div className="stats">
        <Stat label="Vigentes" value={current} />
        <Stat label="Esperando aprobación" value={review} hint="Las aprueba un gerente que no sea el autor" />
        <Stat label="Vencen en 30 días" value={expiring} hint={expiring ? 'Revisar vigencia' : undefined} />
        <Stat label="Total de versiones" value={knowledge.length} />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="tabs" role="group" aria-label="Vista">
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => { setView(v); setSelectedId(null); }}>{VIEW_LABEL[v]}</button>
              ))}
            </div>
            <select className="field" aria-label="Categoría" value={category} onChange={(e) => { setCategory(e.target.value as typeof category); setSelectedId(null); }}>
              <option value="all">Todas las categorías</option>
              {KNOWLEDGE_CATEGORIES.map((c) => <option key={c} value={c}>{KNOWLEDGE_CATEGORY_LABEL[c]}</option>)}
            </select>
            <input className="field" type="search" placeholder="Buscar (sin importar acentos)…" aria-label="Buscar en la base" value={q} onChange={(e) => { setQ(e.target.value); setSelectedId(null); }} />
          </div>
          <span className="faint">{rows.length} artículos</span>
        </div>
        {!selected ? (
          <div className="empty">{q ? `Nada coincide con “${q}”.` : 'No hay artículos en esta vista.'}</div>
        ) : (
          <div className="kb">
            <ul className="kb-list" aria-label="Artículos">
              {rows.length === 0 && <li className="empty">{q ? `Nada coincide con “${q}”.` : 'No hay artículos en esta vista.'}</li>}
              {rows.map((a) => (
                <li key={a.id}>
                  <button aria-current={selected?.id === a.id} onClick={() => setSelectedId(a.id)}>
                    <strong>{a.title}</strong>
                    <span className="faint">{KNOWLEDGE_CATEGORY_LABEL[a.category]} · v{a.version}{a.model ? ` · ${a.model}` : ''}</span>
                    <ToneTag value={KNOWLEDGE_STATUS_LABEL[a.status]} />
                  </button>
                </li>
              ))}
            </ul>
            {selected && <ArticleView a={selected} all={knowledge} onEdit={(draft) => setEditing({ draft })} onNewVersion={(base) => setEditing({ base })} onSelect={setSelectedId} />}
          </div>
        )}
      </section>
      {editing && (
        <ArticleEditor
          base={editing.base}
          draft={editing.draft}
          defaultOrg={org === 'all' ? undefined : org}
          onClose={() => setEditing(null)}
          onSaved={(a) => {
            setEditing(null);
            setSelectedId(a.id);
            setView(a.status === 'draft' ? 'drafts' : 'all');
          }}
        />
      )}
    </>
  );
}

function ArticleView({
  a,
  all,
  onEdit,
  onNewVersion,
  onSelect,
}: {
  a: KnowledgeArticle;
  all: KnowledgeArticle[];
  onEdit: (a: KnowledgeArticle) => void;
  onNewVersion: (a: KnowledgeArticle) => void;
  onSelect: (id: string) => void;
}) {
  const app = useApp();
  const today = toDay(new Date());
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const versions = all.filter((x) => x.organizationId === a.organizationId && x.articleKey === a.articleKey).sort((x, y) => y.version - x.version);
  const published = versions.find((x) => x.status === 'published' && x.id !== a.id);
  const isAuthor = a.createdBy === app.session?.userId;
  const actions = (['submit', 'approve', 'reject', 'archive'] as KnowledgeAction[]).filter((k) => app.canKnowledgeAction(a, k));
  const hasOpenDraft = versions.some((x) => x.status === 'draft' || x.status === 'in_review');

  async function run(action: KnowledgeAction, note?: string) {
    setBusy(true);
    setError(undefined);
    try {
      await app.transitionKnowledge(a, action, note);
      app.notify(`${a.title}: ${KNOWLEDGE_ACTION_LABEL[action].toLowerCase()}`);
      setAsking(false);
    } catch (e) {
      if (note !== undefined) throw e;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="kb-article">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToneTag value={KNOWLEDGE_STATUS_LABEL[a.status]} />
        {a.status === 'published' && !isArticleCurrent(a, today) && <span className="tag red">Fuera de vigencia</span>}
        <span className="faint">v{a.version} · {KNOWLEDGE_CATEGORY_LABEL[a.category]} · {orgName(a.organizationId)}</span>
      </div>
      <h2>{a.title}</h2>
      <div className="kb-body">{a.body}</div>
      <dl className="kv">
        <dt>Vigencia</dt><dd>desde {formatDay(a.validFrom)}{a.validTo ? ` hasta ${formatDay(a.validTo)}` : ', sin vencimiento'}</dd>
        {a.model && (<><dt>Modelo</dt><dd>{a.model}</dd></>)}
        <dt>Autor</dt><dd>{a.createdByName ?? 'Usuario'}{isAuthor ? ' (vos)' : ''}</dd>
        {a.approvedByName && (<><dt>Aprobó</dt><dd>{a.approvedByName}{a.approvedAt ? ` · ${formatDay(a.approvedAt)}` : ''}</dd></>)}
        {a.reviewNote && (<><dt>Comentario de revisión</dt><dd>{a.reviewNote}</dd></>)}
      </dl>
      {a.status === 'in_review' && isAuthor && <div className="notice">Lo escribiste vos: tiene que aprobarlo otro gerente o un Super Admin.</div>}
      {(a.status === 'in_review' || a.status === 'draft') && published && (
        <details>
          <summary>Cambios respecto de la versión publicada (v{published.version})</summary>
          <div className="diff">
            {lineDiff(published.body, a.body).map((l, i) => (
              <div key={i} className={l.kind}>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}{l.text}</div>
            ))}
          </div>
        </details>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {a.status === 'draft' && isAuthor && <button className="btn secondary" onClick={() => onEdit(a)}>Editar borrador</button>}
        {actions.map((k) => (
          <button key={k} className={`btn ${k === 'reject' || k === 'archive' ? 'ghost' : ''}`} disabled={busy} onClick={() => (k === 'reject' ? setAsking(true) : run(k))}>
            {KNOWLEDGE_ACTION_LABEL[k]}
          </button>
        ))}
        {a.status === 'published' && app.allowed('knowledge:edit', a.organizationId) && !hasOpenDraft && (
          <button className="btn secondary" onClick={() => onNewVersion(a)}>Proponer nueva versión</button>
        )}
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {versions.length > 1 && (
        <>
          <h3 className="section-title">Versiones</h3>
          <div className="versions">
            {versions.map((v) => (
              <button key={v.id} aria-current={v.id === a.id} onClick={() => onSelect(v.id)}>
                v{v.version} · {KNOWLEDGE_STATUS_LABEL[v.status][0]}
              </button>
            ))}
          </div>
        </>
      )}
      {asking && (
        <ReasonDialog open title={`Devolver · ${a.title}`} label="Qué hay que cambiar" confirmLabel="Devolver al autor" onCancel={() => setAsking(false)} onConfirm={(n) => run('reject', n)} />
      )}
    </article>
  );
}

function ArticleEditor({
  base,
  draft,
  defaultOrg,
  onClose,
  onSaved,
}: {
  base?: KnowledgeArticle;
  draft?: KnowledgeArticle;
  defaultOrg?: OrganizationId;
  onClose: () => void;
  onSaved: (a: KnowledgeArticle) => void;
}) {
  const app = useApp();
  const src = draft ?? base;
  const writable = ORGANIZATIONS.filter((o) => app.allowed('knowledge:edit', o.id));
  const [org, setOrg] = useState<OrganizationId>(src?.organizationId ?? (defaultOrg && writable.some((o) => o.id === defaultOrg) ? defaultOrg : (writable[0]?.id ?? 'cardys_fiat')));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const today = toDay(new Date());

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const body = String(fd.get('body') ?? '').trim();
    const validFrom = String(fd.get('validFrom') ?? '');
    const validTo = String(fd.get('validTo') ?? '') || undefined;
    if (title.length < 3) return setError('El título es muy corto.');
    if (body.length < 10) return setError('El contenido es muy corto (mínimo 10 caracteres).');
    if (!validFrom) return setError('Indicá desde cuándo rige.');
    if (validTo && validTo < validFrom) return setError('La vigencia termina antes de empezar.');
    setSaving(true);
    setError(undefined);
    try {
      const a = draft
        ? await app.updateKnowledgeDraft(draft, { title, body, validFrom, validTo })
        : await app.createKnowledgeDraft({
            organizationId: org,
            articleKey: base?.articleKey ?? `${slug(title)}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            body,
            language: 'es',
            category: (base?.category ?? String(fd.get('category'))) as KnowledgeCategory,
            model: base?.model ?? (String(fd.get('model') ?? '').trim() || undefined),
            validFrom,
            validTo,
          });
      app.notify(draft ? 'Borrador actualizado' : base ? `Versión v${a.version} creada como borrador` : 'Borrador creado');
      onSaved(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open title={draft ? `Editar borrador · v${draft.version}` : base ? `Nueva versión · ${base.title}` : 'Nuevo artículo'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 12 }}>
        <div className="form-grid">
          {!src && (
            <label className="lbl">
              Concesionario
              <select className="field" value={org} onChange={(e) => setOrg(e.target.value as OrganizationId)}>
                {writable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          {!src && (
            <label className="lbl">
              Categoría
              <select className="field" name="category" defaultValue="postventa">
                {KNOWLEDGE_CATEGORIES.map((c) => <option key={c} value={c}>{KNOWLEDGE_CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
          )}
          {!src && (
            <label className="lbl">
              Modelo (opcional)
              <input className="field" name="model" maxLength={60} placeholder="Cronos, Pulse…" />
            </label>
          )}
          <label className="lbl">
            Rige desde *
            <input className="field" type="date" name="validFrom" defaultValue={draft?.validFrom ?? today} />
          </label>
          <label className="lbl">
            Rige hasta
            <input className="field" type="date" name="validTo" defaultValue={src?.validTo ?? ''} />
          </label>
        </div>
        <label className="lbl">
          Título *
          <input className="field" name="title" maxLength={160} defaultValue={src?.title ?? ''} autoFocus />
        </label>
        <label className="lbl">
          Contenido *
          <textarea className="field" name="body" rows={10} maxLength={8000} defaultValue={src?.body ?? ''} />
        </label>
        <p className="faint" style={{ margin: 0 }}>Se guarda como borrador. Solo se publica cuando un gerente (que no sea el autor) lo aprueba; la versión anterior queda archivada.</p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
        </div>
      </form>
    </Dialog>
  );
}
