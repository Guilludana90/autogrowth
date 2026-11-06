'use client';

import { useState } from 'react';
import { formatDay } from '@/lib/domain/dates';
import { formatMoney, formatNumber } from '@/lib/domain/metrics';
import { previewMetricImport, type MetricImportPreview } from '@/lib/domain/metricImport';
import { ORGANIZATIONS, PLATFORM_LABEL, type OrganizationId, type OrgFilter, type Platform } from '@/lib/domain/types';
import { useApp } from '@/lib/state/AppContext';
import { Dialog } from './Dialog';

const MAX_BYTES = 10 * 1024 * 1024;
const KIND = { create: ['Nueva', 'green'], update: ['Corrige', 'gold'], unchanged: ['Sin cambios', 'gray'] } as const;

/**
 * Importador de métricas diarias de pauta. Vista previa sin escribir; al confirmar se guarda como
 * un lote reversible. No se conecta a Meta ni a Google: usa la exportación CSV del administrador de anuncios.
 */
export function MetricImportDialog({ open, onClose, org }: { open: boolean; onClose: () => void; org: OrgFilter }) {
  const app = useApp();
  const importable = ORGANIZATIONS.filter((o) => app.allowed('campaign:import', o.id));
  const [target, setTarget] = useState<OrganizationId | ''>(org !== 'all' && importable.some((o) => o.id === org) ? org : '');
  const [platform, setPlatform] = useState<Platform | 'auto'>('auto');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<MetricImportPreview | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    setError(undefined);
  }
  function close() {
    reset();
    onClose();
  }

  function run(text: string, o: OrganizationId | '', p: Platform | 'auto') {
    setPreview(null);
    setError(undefined);
    if (!o) return setError('Elegí el concesionario al que pertenece la cuenta publicitaria.');
    const r = previewMetricImport(text, {
      organizationId: o,
      platform: p === 'auto' ? undefined : p,
      existing: app.metrics.filter((m) => m.organizationId === o),
      knownCampaignIds: new Set(app.campaigns.filter((c) => c.organizationId === o).map((c) => c.id)),
      today: new Date().toISOString().slice(0, 10),
    });
    if ('fatal' in r) return setError(r.fatal);
    setPreview(r);
  }

  async function onFile(f: File | undefined) {
    reset();
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('El archivo supera 10 MB: exportá un rango más corto.');
    if (!/\.csv$/i.test(f.name)) return setError('Subí un archivo .csv exportado desde el administrador de anuncios.');
    const text = await f.text();
    setFile({ name: f.name, text });
    run(text, target, platform);
  }

  async function confirm() {
    if (!preview || !file) return;
    setBusy(true);
    try {
      const job = await app.applyMetricImport(preview, file.name);
      app.notify(`Métricas importadas: ${job.counts.create} días nuevos, ${job.counts.update} corregidos, ${job.counts.unchanged} sin cambios.`);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const writes = preview ? preview.counts.create + preview.counts.update : 0;
  const currency = preview?.outcomes[0]?.metric.currency ?? 'ARS';

  return (
    <Dialog
      open={open}
      title="Importar métricas de pauta"
      onClose={close}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={close}>Cancelar</button>
          <button className="btn" disabled={!writes || busy} onClick={confirm}>
            {busy ? 'Importando…' : `Confirmar (${writes} días con cambios)`}
          </button>
        </>
      }
    >
      <div className="notice">
        Usá la exportación de Meta Ads Manager o Google Ads <b>con desglose por día</b> (columnas: campaña o ID, día, inversión,
        impresiones, clics y leads/resultados). Primero se ve la vista previa; nada se guarda hasta confirmar y cada lote se puede revertir.
      </div>
      {importable.length === 0 ? (
        <div className="notice warn">Tu rol no puede importar métricas. Lo hacen Super Admin o Gerente.</div>
      ) : (
        <div className="form-grid">
          <label className="lbl">
            Concesionario
            <select
              className="field"
              name="metric-org"
              value={target}
              onChange={(e) => {
                const v = e.target.value as OrganizationId | '';
                setTarget(v);
                if (file) run(file.text, v, platform);
              }}
            >
              <option value="">Elegir…</option>
              {importable.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="lbl">
            Plataforma
            <select
              className="field"
              name="metric-platform"
              value={platform}
              onChange={(e) => {
                const v = e.target.value as Platform | 'auto';
                setPlatform(v);
                if (file) run(file.text, target, v);
              }}
            >
              <option value="auto">Detectar por encabezados</option>
              <option value="meta">{PLATFORM_LABEL.meta}</option>
              <option value="google">{PLATFORM_LABEL.google}</option>
            </select>
          </label>
          <label className="lbl" style={{ gridColumn: '1 / -1' }}>
            Archivo CSV
            <input className="field" type="file" name="metric-file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {error && <div className="notice error" role="alert">{error}</div>}
      {preview && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="tag">{PLATFORM_LABEL[preview.platform]}</span>
            {preview.range && <span className="faint">Del {formatDay(preview.range.from)} al {formatDay(preview.range.to)}</span>}
            <span className="tag green">Nuevos: {preview.counts.create}</span>
            <span className="tag gold">Corrige: {preview.counts.update}</span>
            <span className="tag gray">Sin cambios: {preview.counts.unchanged}</span>
            <span className={`tag ${preview.counts.error ? 'red' : 'gray'}`}>Errores: {preview.counts.error}</span>
            {preview.newCampaigns.length > 0 && <span className="tag">Campañas nuevas: {preview.newCampaigns.length}</span>}
          </div>
          {preview.warnings.map((w) => (
            <div key={w} className="notice warn">{w}</div>
          ))}
          {preview.errors.length > 0 && (
            <details open={preview.outcomes.length === 0}>
              <summary>Filas con error ({preview.errors.length}): no se importan</summary>
              <ul className="faint">
                {preview.errors.slice(0, 50).map((e) => (
                  <li key={e.row}>Fila {e.row}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.outcomes.length === 0 ? (
            <div className="empty">No quedó ninguna fila válida para importar.</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table style={{ minWidth: 640 }}>
                <thead>
                  <tr><th>Día</th><th>Campaña</th><th className="num">Inversión</th><th className="num">Impr.</th><th className="num">Clics</th><th className="num">Leads</th><th>Resultado</th></tr>
                </thead>
                <tbody>
                  {preview.outcomes.slice(0, 400).map((o) => {
                    const [label, tone] = KIND[o.kind];
                    return (
                      <tr key={`${o.metric.campaignId}|${o.metric.date}`}>
                        <td>{formatDay(o.metric.date)}</td>
                        <td>{o.campaignName}</td>
                        <td className="num">{formatMoney(o.metric.spend, o.metric.currency)}</td>
                        <td className="num">{formatNumber(o.metric.impressions)}</td>
                        <td className="num">{formatNumber(o.metric.clicks)}</td>
                        <td className="num">{formatNumber(o.metric.platformLeads)}</td>
                        <td>
                          <span className={`tag ${tone}`}>{label}</span>
                          {o.kind === 'update' && <span className="faint"> antes {formatMoney(o.previous.spend, currency)} · {o.previous.platformLeads} leads</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
