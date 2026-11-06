'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FeedbackBar } from '@/components/FeedbackBar';
import { AREA_LABEL, Confidence, EngineTag, JsonDialog, PRIORITY_TAG } from '@/components/RecommendationCard';
import { PageHead } from '@/components/ui';
import { formatDay, inRange } from '@/lib/domain/dates';
import { crmFunnel, derive, formatMoney, formatNumber, formatPercent, metricsInRange, safeRatio, sumMetrics } from '@/lib/domain/metrics';
import { analyzeCampaign, type CampaignRecommendation } from '@/lib/domain/recommendations';
import { orgName, PLATFORM_LABEL, type Campaign, type RecommendationRun } from '@/lib/domain/types';
import { useApp, useScoped } from '@/lib/state/AppContext';
import { useFilters } from '@/lib/state/filters';

const RANK = { high: 0, medium: 1, low: 2 } as const;
const key = (c: Campaign) => `${c.organizationId}|${c.platform}|${c.id}`;

/** AI Growth Recommendations: diagnóstico por campaña con evidencia, motor visible, JSON validado y feedback. */
export default function RecommendationsPage() {
  const app = useApp();
  const { org, range, channel, hrefWithFilters } = useFilters();
  const { campaigns, metrics, leads } = useScoped(org, channel);
  const [selected, setSelected] = useState('all');
  const [json, setJson] = useState(false);
  const [running, setRunning] = useState(false);
  const [aiError, setAiError] = useState<string>();
  /** Resultado de IA por campaña y período (solo de esta sesión; la corrida queda guardada igual). */
  const [aiResults, setAiResults] = useState<Record<string, { rec: CampaignRecommendation; run: RecommendationRun }>>({});

  const cards = useMemo(() => {
    const now = new Date().toISOString();
    const inPeriod = metricsInRange(metrics, range);
    const leadsIn = leads.filter((l) => inRange(l.createdAt, range));
    return campaigns
      .filter((c) => selected === 'all' || key(c) === selected)
      .map((c) => {
        const rows = inPeriod.filter((m) => m.organizationId === c.organizationId && m.platform === c.platform && m.campaignId === c.id);
        const cl = leadsIn.filter((l) => l.organizationId === c.organizationId && l.campaignId === c.id);
        const m = derive(sumMetrics(rows));
        const f = crmFunnel(cl);
        const rules = analyzeCampaign(c, rows, cl, now, range);
        const ai = aiResults[`${key(c)}|${range.from}|${range.to}`];
        return { c, m, f, rec: ai?.rec ?? rules, run: ai?.run };
      })
      .sort((a, b) => RANK[a.rec.priority] - RANK[b.rec.priority] || b.m.spend - a.m.spend);
  }, [aiResults, campaigns, leads, metrics, range, selected]);

  const target = selected === 'all' ? undefined : campaigns.find((c) => key(c) === selected);
  const canRun = target ? app.allowed('recommendation:run', target.organizationId) : app.allowed('recommendation:run', org);
  const fallbackCount = cards.filter((x) => x.rec.engine === 'rules').length;

  async function runAi() {
    if (!target) return;
    setRunning(true);
    setAiError(undefined);
    try {
      const res = await app.runAiAnalysis(target.organizationId, target.platform, target.id, range);
      setAiResults((r) => ({ ...r, [`${key(target)}|${range.from}|${range.to}`]: res }));
      app.notify(res.rec.engine === 'ai' ? 'Análisis IA listo y guardado' : `Se guardó el diagnóstico de reglas: ${res.rec.fallbackReason ?? ''}`, res.rec.engine === 'ai' ? 'info' : 'error');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const runTitle = !app.ai.enabled ? app.ai.reason : !target ? 'Elegí una campaña para analizar con IA' : !canRun ? 'Tu rol no ejecuta análisis' : undefined;

  return (
    <>
      <PageHead
        eyebrow="La capa de inteligencia"
        title="AI Growth Recommendations"
        sub={`Diagnóstico por campaña con métricas de Ads y del CRM, del ${formatDay(range.from)} al ${formatDay(range.to)}. Nada se ejecuta solo: son recomendaciones para que decida una persona.`}
      />

      <div className="toolbar" role="region" aria-label="Controles de análisis">
        <label className="lbl" style={{ minWidth: 260 }}>
          Campaña
          <select className="field" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="all">Todas las campañas ({campaigns.length})</option>
            {campaigns.map((c) => (
              <option key={key(c)} value={key(c)}>
                {c.name} · {PLATFORM_LABEL[c.platform]}{org === 'all' ? ` · ${orgName(c.organizationId)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="grow" />
        {app.ai.enabled ? (
          <span className="tag violet" title={app.ai.model}>✧ Análisis con Claude disponible</span>
        ) : (
          <span className="tag amber" title={app.ai.reason}>Respaldo de reglas</span>
        )}
        <button className="btn secondary" onClick={() => setJson(true)} disabled={!cards.length}>
          Ver JSON
        </button>
        <button className="btn" onClick={runAi} disabled={running || !app.ai.enabled || !target || !canRun} title={runTitle} aria-describedby="ai-hint">
          {running ? 'Analizando…' : '✧ Ejecutar análisis IA'}
        </button>
      </div>
      <p id="ai-hint" className="faint" style={{ marginTop: -8 }}>
        {app.ai.enabled
          ? 'La IA recibe solo métricas agregadas (sin nombres ni teléfonos) y usa la versión de prompt publicada en AI Governance. La evidencia y la confianza máxima las pone el motor de reglas.'
          : `${app.ai.reason ?? 'IA deshabilitada.'} ${fallbackCount ? 'Todo lo que ves sale del motor de reglas versionado.' : ''}`}
      </p>
      {aiError && <div className="notice error" role="alert">No se pudo ejecutar el análisis: {aiError}</div>}

      {!campaigns.length ? (
        <div className="panel empty">
          No hay campañas para este concesionario y canal. <Link href={hrefWithFilters('/campaigns')}>Importá métricas en Campaign Intelligence</Link>.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {cards.map(({ c, m, f, rec, run }) => {
            const [pl, pt] = PRIORITY_TAG[rec.priority];
            return (
              <article key={key(c)} className="panel rec" aria-labelledby={`r-${key(c)}`}>
                <div className="rec-head">
                  <span className={`tag ${pt}`}>{pl}</span>
                  <EngineTag rec={rec} />
                  <span className="tag gray">{AREA_LABEL[rec.problemArea]}</span>
                  <Confidence value={rec.confidence} reason={rec.confidenceReason} />
                </div>
                <h3 id={`r-${key(c)}`}>
                  <Link className="cell-link" href={hrefWithFilters('/campaigns/view', { id: c.id, corg: c.organizationId })}>
                    <strong>{c.name}</strong>
                  </Link>
                </h3>
                <div className="faint">
                  {PLATFORM_LABEL[c.platform]} · {orgName(c.organizationId)} · {c.objective || 'sin objetivo informado'}
                </div>
                <div className="rec-kpis">
                  <span>CPL plataforma <strong>{formatMoney(m.cpl, c.currency)}</strong></span>
                  <span>CPL real (CRM) <strong>{formatMoney(safeRatio(m.spend, f.crmLeads), c.currency)}</strong></span>
                  <span>CTR <strong>{formatPercent(m.ctr, 2)}</strong></span>
                  <span>Leads Ads <strong>{formatNumber(m.platformLeads)}</strong></span>
                  <span>Leads CRM <strong>{formatNumber(f.crmLeads)}</strong></span>
                  <span>Ganados <strong>{formatNumber(f.won)}</strong></span>
                </div>
                {rec.fallbackReason && <div className="notice warn" style={{ margin: '10px 0 0' }}>{rec.fallbackReason}</div>}
                <div className="rec-cols">
                  <div>
                    <div className="section-title">Diagnóstico</div>
                    {rec.diagnosis}
                  </div>
                  <div>
                    <div className="section-title">Problema detectado</div>
                    {rec.mainIssue}
                  </div>
                  <div>
                    <div className="section-title">Acción recomendada</div>
                    {rec.recommendedAction}
                  </div>
                </div>
                <div className="rec-teams">
                  <div>
                    <div className="section-title">Equipo de marketing</div>
                    <ul>{rec.marketingActions.map((a) => <li key={a}>{a}</li>)}</ul>
                  </div>
                  <div>
                    <div className="section-title">Ventas / asesores</div>
                    <ul>{rec.salesActions.map((a) => <li key={a}>{a}</li>)}</ul>
                  </div>
                </div>
                {rec.dataGaps.length > 0 && (
                  <p className="faint" style={{ marginTop: 12 }}>
                    <strong>Datos faltantes:</strong> {rec.dataGaps.join(' · ')}
                  </p>
                )}
                <div className="rec-foot">
                  <span>Inversión <strong>{formatMoney(m.spend, c.currency)}</strong></span>
                  <span>Impresiones <strong>{formatNumber(m.impressions)}</strong></span>
                  <span>CPC <strong>{formatMoney(m.cpc, c.currency)}</strong></span>
                  <span>CPM <strong>{formatMoney(m.cpm, c.currency)}</strong></span>
                  <span>Contactados <strong>{formatNumber(f.contacted)}</strong></span>
                  <span title="El CRM todavía no registra la hora del primer contacto">Tiempo de respuesta <strong>sin dato</strong></span>
                  <span className="spacer" />
                  <FeedbackBar campaign={c} rec={rec} run={run} />
                </div>
              </article>
            );
          })}
        </div>
      )}
      <JsonDialog open={json} onClose={() => setJson(false)} title={selected === 'all' ? `Análisis · ${cards.length} campañas` : `Análisis · ${cards[0]?.c.name ?? ''}`} recs={cards.map((x) => x.rec)} />
    </>
  );
}
