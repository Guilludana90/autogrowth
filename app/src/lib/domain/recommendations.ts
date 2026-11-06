import { derive, sumMetrics, crmFunnel } from './metrics';
import type { Campaign, CampaignMetricsDaily, Lead } from './types';

export type Priority = 'low' | 'medium' | 'high';

export interface CampaignRecommendation {
  campaignId: string;
  engine: 'rules';
  version: string;
  priority: Priority;
  diagnosis: string;
  mainIssue: string;
  recommendedAction: string;
  marketingActions: string[];
  salesActions: string[];
  evidence: Array<{ metric: string; value: number | string }>;
  dataGaps: string[];
  generatedAt: string;
}

const fmt = (n: number | null, d = 2) => (n === null ? 'sin datos' : n.toFixed(d));

/**
 * Motor determinista (rules-v1). Cruza métricas de la plataforma con leads del CRM atribuidos a la campaña
 * en la misma ventana. Nunca inventa contactos ni cierres: si faltan, los reporta como dataGaps.
 */
export function analyzeCampaign(
  campaign: Campaign,
  rows: readonly CampaignMetricsDaily[],
  crmLeads: readonly Lead[],
  now: string,
): CampaignRecommendation {
  const m = derive(sumMetrics(rows));
  const f = crmFunnel(crmLeads);
  const dataGaps: string[] = [];
  if (rows.length === 0) dataGaps.push('No hay métricas importadas para el período');
  if (m.platformLeads > 0 && f.crmLeads === 0) dataGaps.push('Ningún lead del CRM tiene esta campaña atribuida');
  if (f.crmLeads > 0 && f.contacted === 0) dataGaps.push('No hay contactos registrados en el CRM');

  const noLeads = rows.length > 0 && m.platformLeads === 0 && m.spend > 0;
  const leakage = m.platformLeads > 0 && f.crmLeads < m.platformLeads;
  const leakagePct = m.platformLeads > 0 ? ((m.platformLeads - f.crmLeads) / m.platformLeads) * 100 : 0;
  const noContact = f.crmLeads > 0 && (f.contactRate ?? 0) < 50;

  let priority: Priority = 'low';
  let mainIssue = 'Sin alertas relevantes en el período.';
  let action = 'Comparar calidad de contactos y cierres contra otras campañas antes de escalar inversión.';
  if (leakage && leakagePct >= 30) {
    priority = 'high';
    mainIssue = `${fmt(leakagePct, 0)}% de los leads informados por la plataforma no aparecen en el CRM.`;
    action = 'Auditar la captura (formulario, WhatsApp, Tecnom) y la deduplicación antes de cambiar la pauta.';
  } else if (noContact) {
    priority = 'high';
    mainIssue = `Solo ${fmt(f.contactRate, 0)}% de los leads del CRM fue contactado.`;
    action = 'Asignar asesor y registrar el primer contacto de cada lead; revisar SLA de respuesta.';
  } else if (noLeads) {
    priority = 'medium';
    mainIssue = 'La campaña invierte pero no genera leads en el período.';
    action = 'Revisar segmentación, creatividad, objetivo y tracking antes de sumar presupuesto.';
  } else if (leakage) {
    priority = 'medium';
    mainIssue = 'Hay diferencia entre leads de la plataforma y leads del CRM.';
    action = 'Conciliar leads de la plataforma con el CRM y completar el campo campaña al cargar.';
  }

  return {
    campaignId: campaign.id,
    engine: 'rules',
    version: 'rules-v1',
    priority,
    diagnosis:
      `Inversión ${fmt(m.spend)} ${campaign.currency}, ${m.platformLeads} leads de plataforma, ` +
      `${f.crmLeads} en CRM, CPL ${fmt(m.cpl)} y CTR ${m.ctr === null ? 'sin datos' : fmt(m.ctr) + '%'}.`,
    mainIssue,
    recommendedAction: action,
    marketingActions: ['Validar atribución y objetivo de la campaña', 'Revisar CTR y CPL contra el período anterior'],
    salesActions: ['Registrar primer contacto y responsable', 'Actualizar estado, motivo de pérdida y cierre'],
    evidence: [
      { metric: 'spend', value: m.spend },
      { metric: 'platformLeads', value: m.platformLeads },
      { metric: 'crmLeads', value: f.crmLeads },
      { metric: 'contacted', value: f.contacted },
      { metric: 'won', value: f.won },
      { metric: 'cpl', value: m.cpl ?? 'N/A' },
      { metric: 'ctrPercent', value: m.ctr ?? 'N/A' },
    ],
    dataGaps,
    generatedAt: now,
  };
}
