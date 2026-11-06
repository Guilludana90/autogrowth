'use client';

import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { PageHead } from '@/components/ui';
import { formatDay, toDay } from '@/lib/domain/dates';
import { formatMoney } from '@/lib/domain/metrics';
import { parsePriceList, type PriceListParse } from '@/lib/domain/priceList';
import {
  ORGANIZATIONS,
  PRICE_DOC_CATEGORIES,
  PRICE_DOC_CATEGORY_LABEL,
  isOrganizationId,
  orgName,
  type OrganizationId,
  type PriceDocCategory,
  type PriceDocument,
} from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const STATUS: Record<PriceDocument['status'], [string, string]> = { active: ['Activo', 'green'], draft: ['Borrador', 'gray'], archived: ['Archivado', 'gray'] };

export default function DocumentsPage() {
  const app = useApp();
  const { org } = useFilters();
  const { priceDocs } = useScoped(org);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<PriceDocument | null>(null);
  const today = toDay(new Date());
  const canManage = app.allowed('pricedoc:manage', org);

  async function activate(d: PriceDocument) {
    if (!confirm(`¿Activar "${d.title}"? La versión activa actual de ${PRICE_DOC_CATEGORY_LABEL[d.category]} pasa a archivada.`)) return;
    try {
      await app.activatePriceDocument(d);
      app.notify(`Activo: ${d.title}`);
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Ventas"
        title="Documentos y listas de precios"
        sub="Listas mensuales versionadas: una sola activa por concesionario y tipo, con vigencia"
        actions={canManage && <button className="btn" onClick={() => setUploading(true)}>+ Cargar documento</button>}
      />
      <div className="notice">
        Los cotizadores toman precios solo de la lista <b>activa y vigente</b>. Exportá el XLSX de fábrica como CSV (columnas modelo, versión y precio).
        El archivo original se guardará en almacenamiento privado cuando se conecte Supabase Storage.
      </div>
      {PRICE_DOC_CATEGORIES.map((cat) => {
        const docs = priceDocs.filter((d) => d.category === cat).sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : b.validFrom.localeCompare(a.validFrom)));
        if (!docs.length) return null;
        return (
          <section key={cat} className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h2>{PRICE_DOC_CATEGORY_LABEL[cat]}</h2></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Documento</th><th>Concesionario</th><th>Vigencia</th><th className="num">Filas</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {docs.map((d) => {
                    const [label, tone] = STATUS[d.status];
                    const expired = d.validTo && d.validTo < today;
                    return (
                      <tr key={d.id}>
                        <td><strong>{d.title}</strong><div className="faint">{d.fileName}</div></td>
                        <td>{orgName(d.organizationId)}</td>
                        <td>{formatDay(d.validFrom)} → {d.validTo ? formatDay(d.validTo) : 'sin fin'}{expired && <div className="due-overdue">Vencido</div>}</td>
                        <td className="num">{d.rows.length}</td>
                        <td><span className={`tag ${tone}`}>{label}</span></td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {d.rows.length > 0 && <button className="btn ghost sm" onClick={() => setViewing(d)}>Ver filas</button>}{' '}
                          {d.status !== 'active' && app.allowed('pricedoc:manage', d.organizationId) && (
                            <button className="btn secondary sm" onClick={() => activate(d)}>Activar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {priceDocs.length === 0 && <div className="panel empty">Todavía no hay documentos cargados.</div>}
      {uploading && <UploadDialog onClose={() => setUploading(false)} defaultOrg={isOrganizationId(org) ? org : undefined} />}
      <Dialog open={!!viewing} title={viewing?.title ?? ''} onClose={() => setViewing(null)} wide>
        {viewing && (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ minWidth: 420 }}>
              <thead><tr><th>Modelo</th><th>Versión</th><th className="num">Precio</th></tr></thead>
              <tbody>{viewing.rows.map((r) => <tr key={`${r.model}|${r.version}`}><td>{r.model}</td><td>{r.version || '—'}</td><td className="num">{formatMoney(r.price)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Dialog>
    </>
  );
}

function UploadDialog({ onClose, defaultOrg }: { onClose: () => void; defaultOrg?: OrganizationId }) {
  const app = useApp();
  const orgs = ORGANIZATIONS.filter((o) => app.allowed('pricedoc:manage', o.id));
  const today = toDay(new Date());
  const [org, setOrg] = useState<OrganizationId>(defaultOrg && orgs.some((o) => o.id === defaultOrg) ? defaultOrg : (orgs[0]?.id ?? 'cardys_fiat'));
  const [category, setCategory] = useState<PriceDocCategory>('price_list');
  const [title, setTitle] = useState('');
  const [validFrom, setValidFrom] = useState(`${today.slice(0, 8)}01`);
  const [validTo, setValidTo] = useState('');
  const [file, setFile] = useState<{ name: string; parse?: PriceListParse } | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const needsRows = category === 'price_list';

  async function onFile(f?: File) {
    setError(undefined);
    if (!f) return setFile(null);
    if (f.size > 5 * 1024 * 1024) return setError('El archivo supera 5 MB.');
    const isCsv = /\.csv$/i.test(f.name);
    if (needsRows && !isCsv) return setError('Para listas de precios subí el CSV exportado del XLSX.');
    setFile({ name: f.name, parse: isCsv ? parsePriceList(await f.text()) : undefined });
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function save() {
    if (title.trim().length < 2) return setError('Poné un título.');
    if (!file) return setError('Elegí un archivo.');
    if (validTo && validTo < validFrom) return setError('La vigencia termina antes de empezar.');
    if (needsRows && !file.parse?.rows.length) return setError('La lista no tiene filas válidas.');
    setSaving(true);
    try {
      await app.createPriceDocument({ organizationId: org, category, title: title.trim(), fileName: file.name, validFrom, validTo: validTo || undefined, rows: file.parse?.rows ?? [] });
      app.notify('Documento cargado como borrador. Activalo para que lo usen los cotizadores.');
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
      title="Cargar documento"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar como borrador'}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="lbl">
          Concesionario
          <select className="field" value={org} onChange={(e) => setOrg(e.target.value as OrganizationId)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="lbl">
          Tipo
          <select className="field" value={category} onChange={(e) => { setCategory(e.target.value as PriceDocCategory); setFile(null); }}>
            {PRICE_DOC_CATEGORIES.map((c) => <option key={c} value={c}>{PRICE_DOC_CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="lbl" style={{ gridColumn: '1 / -1' }}>
          Título
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Lista de precios FIAT · diciembre" />
        </label>
        <label className="lbl">
          Vigente desde
          <input className="field" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label className="lbl">
          Vigente hasta (opcional)
          <input className="field" type="date" value={validTo} min={validFrom} onChange={(e) => setValidTo(e.target.value)} />
        </label>
        <label className="lbl" style={{ gridColumn: '1 / -1' }}>
          Archivo {needsRows ? '(CSV)' : ''}
          <input className="field" type="file" accept={needsRows ? '.csv,text/csv' : '.csv,.pdf,.xlsx'} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {file?.parse && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="tag green">Filas válidas: {file.parse.rows.length}</span>
            <span className={`tag ${file.parse.errors.length ? 'red' : 'gray'}`}>Errores: {file.parse.errors.length}</span>
          </div>
          {file.parse.errors.length > 0 && (
            <ul className="faint" style={{ margin: 0, paddingLeft: 18, maxHeight: 120, overflowY: 'auto' }}>
              {file.parse.errors.slice(0, 50).map((e) => <li key={e.row}>Fila {e.row}: {e.message}</li>)}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
