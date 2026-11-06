'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MetricImportDialog } from '@/components/MetricImportDialog';
import { PageHead } from '@/components/ui';
import { formatDay } from '@/lib/domain/dates';
import { normalizeAdAccountId } from '@/lib/integrations/meta';
import { INTEGRATION_STATUS_LABEL, ORGANIZATIONS, PLATFORM_LABEL, orgName, type Integration, type MetricImportJob, type OrganizationId } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Canales conectados y lotes de métricas. Ninguna integración figura conectada sin una prueba real registrada. */
export default function IntegrationsPage() {
  const app = useApp();
  const params = useSearchParams();
  const { org, range } = useFilters();
  const { metricJobs, integrations } = useScoped(org);
  const [importing, setImporting] = useState(false);
  const [server, setServer] = useState<{ enabled: boolean; reason?: string } | null>(null);
  const canManage = app.allowed('integration:manage', org);

  // Resultado del callback de OAuth (?meta=connected|error&msg=…)
  const metaResult = params.get('meta');
  const metaMsg = params.get('msg');

  useEffect(() => {
    if (app.demo) return;
    let alive = true;
    fetch('/api/integrations/meta/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { enabled: boolean; reason?: string }) => alive && setServer(j))
      .catch(() => alive && setServer({ enabled: false, reason: 'No se pudo consultar el servidor.' }));
    return () => {
      alive = false;
    };
  }, [app.demo]);

  if (!canManage) {
    return (
      <>
        <PageHead eyebrow="Configuración" title="Canales conectados" />
        <div className="notice warn">Solo Super Admin o Gerente ven y gestionan las fuentes de datos.</div>
      </>
    );
  }

  const orgs = ORGANIZATIONS.filter((o) => (org === 'all' || o.id === org) && app.allowed('integration:manage', o.id));
  const disabledReason = app.demo
    ? 'Modo demo: la conexión con Meta está desactivada. Las métricas se cargan por CSV.'
    : server === null
      ? 'Consultando configuración del servidor…'
      : server.enabled
        ? undefined
        : server.reason;

  return (
    <>
      <PageHead
        eyebrow="Configuración"
        title="Canales conectados"
        sub="Fuentes de las métricas de pauta y su estado real"
        actions={app.allowed('campaign:import', org) && <button className="btn" onClick={() => setImporting(true)}>↑ Importar métricas (CSV)</button>}
      />
      {metaResult === 'connected' && <div className="notice" role="status">Meta quedó conectada y probada contra la cuenta publicitaria.</div>}
      {metaResult === 'error' && <div className="notice error" role="alert">No se pudo conectar Meta: {metaMsg ?? 'error desconocido'}</div>}

      <section className="panel" aria-labelledby="meta-h">
        <div className="panel-head">
          <h2 id="meta-h">{PLATFORM_LABEL.meta} · sandbox</h2>
          <span className="faint">OAuth y sincronización del lado servidor · permiso ads_read · solo cuentas autorizadas</span>
        </div>
        {disabledReason && <div className="notice warn">{disabledReason}</div>}
        <div className="cards">
          {orgs.map((o) => (
            <MetaCard
              key={o.id}
              org={o.id}
              integration={integrations.find((i) => i.organizationId === o.id && i.provider === 'meta')}
              disabled={!!disabledReason}
              range={range}
            />
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="google-h">
        <div className="panel-head">
          <h2 id="google-h">{PLATFORM_LABEL.google}</h2>
          <span className="tag gray">No conectada</span>
        </div>
        <p className="faint" style={{ margin: 0 }}>
          La API de Google Ads llega después de Meta. Mientras tanto, exportá el informe de campañas con segmento por día y subilo con “Importar métricas”.
        </p>
      </section>

      <section className="panel" aria-labelledby="jobs-h">
        <div className="panel-head">
          <h2 id="jobs-h">Lotes de métricas</h2>
          <span className="faint">Se revierte de a uno, empezando por el más reciente de cada plataforma</span>
        </div>
        {metricJobs.length === 0 ? (
          <div className="empty">Todavía no se importaron métricas{app.demo ? ' (las de la demo vienen precargadas)' : ''}.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Origen</th><th>Concesionario</th><th>Período</th><th className="num">Nuevos</th><th className="num">Corregidos</th><th className="num">Iguales</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {metricJobs.map((j) => (
                  <JobRow key={j.id} job={j} jobs={metricJobs} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <MetricImportDialog open={importing} onClose={() => setImporting(false)} org={org} />
    </>
  );
}

function JobRow({ job, jobs }: { job: MetricImportJob; jobs: MetricImportJob[] }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const latest = !jobs.some((x) => x.organizationId === job.organizationId && x.platform === job.platform && !x.rolledBack && x.createdAt > job.createdAt);
  async function rollback() {
    if (!confirm(`¿Revertir el lote "${job.fileName}"? Se restauran los valores anteriores.`)) return;
    setBusy(true);
    try {
      await app.rollbackMetricImport(job);
      app.notify(`Lote revertido: ${job.fileName}`);
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>{fmtDateTime(job.createdAt)}<div className="faint">{job.createdByName ?? ''}</div></td>
      <td>
        <span className="tag">{PLATFORM_LABEL[job.platform]}</span> {job.source === 'csv' ? 'CSV' : 'API'}
        <div className="faint">{job.fileName}</div>
      </td>
      <td>{orgName(job.organizationId)}</td>
      <td>{job.rangeFrom ? `${formatDay(job.rangeFrom)} – ${formatDay(job.rangeTo ?? job.rangeFrom)}` : '—'}</td>
      <td className="num">{job.counts.create}</td>
      <td className="num">{job.counts.update}</td>
      <td className="num">{job.counts.unchanged}</td>
      <td>{job.rolledBack ? <span className="tag gray">Revertido</span> : <span className="tag green">Aplicado</span>}</td>
      <td className="num">
        {!job.rolledBack && (
          <button className="btn secondary sm" disabled={busy || !latest} title={latest ? undefined : 'Primero revertí el lote más reciente de esta plataforma'} onClick={rollback}>
            {busy ? 'Revirtiendo…' : 'Revertir'}
          </button>
        )}
      </td>
    </tr>
  );
}

function MetaCard({ org, integration, disabled, range }: { org: OrganizationId; integration?: Integration; disabled: boolean; range: { from: string; to: string } }) {
  const app = useApp();
  const [account, setAccount] = useState(integration?.externalAccountId ?? '');
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [error, setError] = useState<string>();
  const status = integration?.status ?? 'not_connected';
  const [label, tone] = INTEGRATION_STATUS_LABEL[status];
  const validAccount = normalizeAdAccountId(account);

  async function run(kind: 'connect' | 'sync' | 'disconnect') {
    setBusy(kind);
    setError(undefined);
    try {
      if (kind === 'connect') {
        const url = await app.connectMeta(org, validAccount!);
        window.location.assign(url);
        return;
      }
      if (kind === 'sync') {
        const r = await app.syncMeta(org, range);
        app.notify(r.rows ? `Meta: ${r.rows} días sincronizados${r.skipped ? `, ${r.skipped} filas omitidas` : ''}.` : 'Meta no devolvió métricas para el período.');
      }
      if (kind === 'disconnect' && integration) {
        if (!confirm('¿Desconectar Meta? Se borra el token guardado.')) return;
        await app.disconnectIntegration(integration);
        app.notify('Meta desconectada');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card" data-org={org}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong>{orgName(org)}</strong>
        <span className={`tag ${tone}`}>{label}</span>
      </div>
      {integration?.externalAccountId && (
        <div className="faint">
          Cuenta {integration.externalAccountName ?? ''} ({integration.externalAccountId}) · probada {fmtDateTime(integration.lastTestedAt)} · última sync {fmtDateTime(integration.lastSyncAt)}
        </div>
      )}
      {integration?.lastError && <div className="notice error">{integration.lastError}</div>}
      {status === 'connected' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={disabled || !!busy} onClick={() => run('sync')}>
            {busy === 'sync' ? 'Sincronizando…' : `Sincronizar ${formatDay(range.from)} – ${formatDay(range.to)}`}
          </button>
          <button className="btn ghost sm" disabled={!!busy} onClick={() => run('disconnect')}>Desconectar</button>
        </div>
      ) : (
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <label className="lbl">
            Cuenta publicitaria (act_…)
            <input className="field" name={`meta-account-${org}`} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="act_1234567890" disabled={disabled} />
          </label>
          <button className="btn sm" disabled={disabled || !validAccount || !!busy} onClick={() => run('connect')}>
            {busy === 'connect' ? 'Abriendo Meta…' : 'Conectar con Meta'}
          </button>
        </div>
      )}
      {account && !validAccount && <div className="faint">El ID tiene que ser act_ seguido de números.</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
    </div>
  );
}
