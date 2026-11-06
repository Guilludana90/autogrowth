'use client';

import { useState } from 'react';
import type { CampaignRecommendation } from '@/lib/domain/recommendations';
import type { Campaign } from '@/lib/domain/types';
import { PLATFORM_LABEL } from '@/lib/domain/types';
import { Dialog } from './Dialog';

const PRIORITY: Record<CampaignRecommendation['priority'], [string, string]> = {
  high: ['Prioridad alta', 'red'],
  medium: ['Prioridad media', 'gold'],
  low: ['Prioridad baja', 'green'],
};

export function RecommendationCard({ campaign, rec, compact }: { campaign: Campaign; rec: CampaignRecommendation; compact?: boolean }) {
  const [json, setJson] = useState(false);
  const [label, tone] = PRIORITY[rec.priority];
  return (
    <article className="rec">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`tag ${tone}`}>{label}</span>
        <span className="tag gray">Motor de reglas · {rec.version}</span>
      </div>
      <h3>{campaign.name}</h3>
      <div className="faint">
        {PLATFORM_LABEL[campaign.platform]} · {campaign.objective}
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
      <div style={{ marginTop: 14 }}>
        <button className="btn secondary sm" onClick={() => setJson(true)}>
          Ver JSON
        </button>
      </div>
      <Dialog open={json} title={`Análisis · ${campaign.name}`} onClose={() => setJson(false)} wide>
        <p className="faint">Salida estructurada del motor determinista. Las recomendaciones nunca ejecutan acciones en Ads ni envían mensajes.</p>
        <pre className="json">{JSON.stringify(rec, null, 2)}</pre>
      </Dialog>
    </article>
  );
}
