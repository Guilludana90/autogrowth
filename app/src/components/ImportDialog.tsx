'use client';

import { useState } from 'react';
import { previewImport, type ImportPreview } from '@/lib/domain/leadImport';
import { ORGANIZATIONS, orgName, type OrganizationId, type OrgFilter } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';

const KIND_LABEL = { create: 'Crear', update: 'Actualizar', duplicate: 'Duplicado', error: 'Error' } as const;
const KIND_TONE = { create: 'green', update: 'gold', duplicate: 'gray', error: 'red' } as const;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Importador CSV en dos pasos: vista previa (dry-run, no escribe nada) y confirmación.
 * Cada lote queda registrado y se puede revertir. Nunca escribe en Tecnom.
 */
export function ImportDialog({ open, onClose, org }: { open: boolean; onClose: () => void; org: OrgFilter }) {
  const app = useApp();
  const [defaultOrg, setDefaultOrg] = useState<OrganizationId | ''>(org === 'all' ? '' : org);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const importable = ORGANIZATIONS.filter((o) => app.allowed('lead:import', o.id));

  function reset() {
    setFile(null);
    setPreview(null);
    setError(undefined);
  }

  function run(text: string, d: OrganizationId | '') {
    const allowedIds = new Set(importable.map((o) => o.id));
    const p = previewImport(text, {
      existing: app.leads,
      defaultOrg: d || undefined,
      now: new Date().toISOString(),
      newId: () => crypto.randomUUID(),
    });
    // Filas de concesionarios sin permiso de importación pasan a error (no se escriben).
    p.outcomes = p.outcomes.map((o) =>
      o.kind === 'create' && !allowedIds.has(o.lead.organizationId)
        ? { row: o.row, kind: 'error', message: `sin permiso para importar en ${orgName(o.lead.organizationId)}` }
        : o,
    );
    p.counts = { create: 0, update: 0, duplicate: 0, error: 0 };
    for (const o of p.outcomes) p.counts[o.kind]++;
    setPreview(p);
  }

  async function onFile(f: File | undefined) {
    reset();
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('El archivo supera 5 MB.');
    if (!/\.csv$/i.test(f.name)) return setError('Subí un archivo .csv (exportá desde Excel como CSV UTF-8).');
    const text = await f.text();
    setFile({ name: f.name, text });
    run(text, defaultOrg);
  }

  async function confirm() {
    if (!preview || !file) return;
    setBusy(true);
    try {
      const job = await app.applyImport(preview, file.name);
      app.notify(`Importación aplicada: ${job.counts.create} creados, ${job.counts.update} actualizados.`);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const writes = preview ? preview.counts.create + preview.counts.update : 0;

  return (
    <Dialog
      open={open}
      title="Importar leads desde CSV (Tecnom)"
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={() => { reset(); onClose(); }}>Cancelar</button>
          <button className="btn" disabled={!writes || busy} onClick={confirm}>
            {busy ? 'Importando…' : `Confirmar importación (${writes} cambios)`}
          </button>
        </>
      }
    >
      <div className="notice">
        Primero se muestra una vista previa sin guardar nada. Se deduplica por concesionario + teléfono o email, y cada
        lote se puede revertir desde el historial. No se modifica Tecnom.
      </div>
      <div className="form-grid">
        <label className="lbl">
          Concesionario por defecto (si el CSV no lo indica)
          <select
            className="field"
            value={defaultOrg}
            onChange={(e) => {
              const v = e.target.value as OrganizationId | '';
              setDefaultOrg(v);
              if (file) run(file.text, v);
            }}
          >
            <option value="">Sin default (la columna es obligatoria)</option>
            {importable.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label className="lbl">
          Archivo CSV
          <input className="field" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      <p className="faint">
        Columnas reconocidas: nombre, teléfono/celular/whatsapp, email, concesionario, modelo, origen, campaign_id. Separador , o ;.
      </p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {preview && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(Object.keys(KIND_LABEL) as Array<keyof typeof KIND_LABEL>).map((k) => (
              <span key={k} className={`tag ${KIND_TONE[k]}`}>
                {KIND_LABEL[k]}: {preview.counts[k]}
              </span>
            ))}
          </div>
          {preview.outcomes.length === 0 ? (
            <div className="empty">El archivo no tiene filas.</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ minWidth: 520 }}>
                <thead>
                  <tr><th>Fila</th><th>Resultado</th><th>Detalle</th></tr>
                </thead>
                <tbody>
                  {preview.outcomes.slice(0, 500).map((o) => (
                    <tr key={o.row}>
                      <td>{o.row}</td>
                      <td><span className={`tag ${KIND_TONE[o.kind]}`}>{KIND_LABEL[o.kind]}</span></td>
                      <td>
                        {o.kind === 'create' && `${o.lead.name} · ${orgName(o.lead.organizationId)} · score ${o.lead.score}`}
                        {o.kind === 'update' && `${o.name}: ${Object.keys(o.changes).join(', ')}`}
                        {o.kind === 'duplicate' && `Ya existe: ${o.name}`}
                        {o.kind === 'error' && o.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
