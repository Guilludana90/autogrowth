'use client';

import { useState, type ReactNode } from 'react';
import { toRecommendationJson, type CampaignRecommendation } from '@/lib/domain/recommendations';
import type { Campaign } from '@/lib/domain/types';
import { PLATFORM_LABEL } from '@/lib/domain/types';
import { Dialog } from './Dialog';

export const PRIORITY_TAG: Record<CampaignRecommendation['priority'], [string, string]> = {
  high: ['Prioridad alta', 'red'],
  medium: ['Prioridad media', 'gold'],
  low: ['Prioridad baja', 'green'],
};

export const AREA_LABEL: Record<CampaignRecommendation['problemArea'], string> = {
  media: 'Problema de pauta',
  capture: 'Problema de captura al CRM',
  sales: 'Problema de gestión comercial',
  data: 'Faltan datos',
  none: 'Sin problema detectado',
};

export function EngineTag({ rec }: { rec: CampaignRecommendation }) {
  if (rec.engine === 'ai') return <span className="tag violet" title={rec.version}>✧ Análisis IA · {rec.version.split(' · ')[0]?.replace('prompt:campaign_analyst@', 'prompt ')}</span>;
  return (
    <span className={`tag ${rec.fallbackReason ? 'amber' : 'gray'}`} title={rec.fallbackReason}>
      {rec.fallbackReason ? 'Respaldo de reglas' : 'Motor de reglas'} · {rec.version}
    </span>
  );
}

export function Confidence({ value, reason }: { value: number; reason?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className="confidence" title={reason}>
      Confianza {pct}%
      <i aria-hidden="true">
        <b style={{ width: `${pct}%` }} />
      </i>
    </span>
  );
}

export function RecommendationCard({ campaign, rec, compact, footer }: { campaign: Campaign; rec: CampaignRecommendation; compact?: boolean; footer?: ReactNode }) {
  const [json, setJson] = useState(false);
  const [label, tone] = PRIORITY_TAG[rec.priority];
  return (
    <article className="rec">
      <div className="rec-head">
        <span className={`tag ${tone}`}>{label}</span>
        <EngineTag rec={rec} />
        <span className="tag gray">{AREA_LABEL[rec.problemArea]}</span>
        <Confidence value={rec.confidence} reason={rec.confidenceReason} />
      </div>
      <h3>{campaign.name}</h3>
      <div className="faint">
        {PLATFORM_LABEL[campaign.platform]} · {campaign.objective || 'sin objetivo informado'}
        {rec.window && <> · {rec.window.from} a {rec.window.to}</>}
      </div>
      <dl>
        <div>
          <dt>Problema detectado</dt>
          <dd>{rec.mainIssue}</dd>
        </div>
        <div>
          <dt>Acción recomendada</dt>
          <dd>{rec.recommendedAction}</dd>
        </div>
        {!compact && (
          <>
            <div>
              <dt>Diagnóstico</dt>
              <dd>{rec.diagnosis}</dd>
            </div>
            <div>
              <dt>Marketing</dt>
              <dd>{rec.marketingActions.join(' · ')}</dd>
            </div>
            <div>
              <dt>Ventas / asesores</dt>
              <dd>{rec.salesActions.join(' · ')}</dd>
            </div>
          </>
        )}
        {rec.dataGaps.length > 0 && (
          <div>
            <dt>Datos faltantes</dt>
            <dd className="muted">{rec.dataGaps.join(' · ')}</dd>
          </div>
        )}
      </dl>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn secondary sm" onClick={() => setJson(true)}>
          Ver JSON
        </button>
        {footer}
      </div>
      <JsonDialog open={json} onClose={() => setJson(false)} title={`Análisis · ${campaign.name}`} recs={[rec]} />
    </article>
  );
}

export function JsonDialog({ open, onClose, title, recs }: { open: boolean; onClose: () => void; title: string; recs: CampaignRecommendation[] }) {
  const out = recs.map(toRecommendationJson);
  return (
    <Dialog open={open} title={title} onClose={onClose} wide>
      <p className="faint">
        Salida estructurada y validada (diagnosis, main_issue, recommended_action, marketing_actions, sales_actions, priority, evidence, confidence, data_gaps, model_or_rule_version, generated_at). Las recomendaciones nunca ejecutan acciones en Ads ni envían mensajes.
      </p>
      <pre className="json">{JSON.stringify(out.length === 1 ? out[0] : out, null, 2)}</pre>
    </Dialog>
  );
}
