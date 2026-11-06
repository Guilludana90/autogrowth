import type { CampaignMetrics, CampaignRecommendation } from '../types/domain';

const safeRatio = (n: number, d: number) => d > 0 ? n / d : null;

/** Fallback determinista: nunca afirma eventos comerciales sin datos CRM. */
export function analyzeCampaign(metrics: CampaignMetrics): CampaignRecommendation {
  if (metrics.spend < 0 || metrics.impressions < 0 || metrics.clicks < 0 || metrics.platformLeads < 0) {
    throw new Error('Métricas fuera de rango');
  }
  const cpl = safeRatio(metrics.spend, metrics.platformLeads);
  const ctr = safeRatio(metrics.clicks * 100, metrics.impressions);
  const dataGaps: string[] = [];
  if (metrics.crmLeads === undefined) dataGaps.push('No hay atribución de leads en el CRM');
  if (metrics.contacted === undefined) dataGaps.push('No hay datos de contacto comercial');
  if (metrics.appointments === undefined) dataGaps.push('No hay datos de turnos');
  if (metrics.closed === undefined) dataGaps.push('No hay datos de ventas cerradas');

  const noLeads = metrics.platformLeads === 0;
  const leakage = metrics.platformLeads > 0 && metrics.crmLeads !== undefined && metrics.crmLeads < metrics.platformLeads;
  const priority = leakage ? 'high' : noLeads ? 'medium' : 'low';

  return {
    campaignId: metrics.externalCampaignId,
    organizationId: metrics.organizationId,
    engine: 'rules',
    priority,
    diagnosis: `Campaña con ${metrics.platformLeads} leads de plataforma, CPL ${cpl === null ? 'sin datos' : cpl.toFixed(2)} y CTR ${ctr === null ? 'sin datos' : ctr.toFixed(2) + '%'}.`,
    mainIssue: leakage ? 'Hay leads de plataforma sin correspondencia en el CRM.' : noLeads ? 'No hay leads atribuidos durante el período.' : dataGaps.length ? 'Faltan resultados comerciales para evaluar el embudo completo.' : 'Revisar eficiencia de extremo a extremo.',
    recommendedAction: leakage ? 'Auditar captura y deduplicación de leads antes de cambiar inversión.' : noLeads ? 'Revisar segmentación, creatividad y tracking.' : 'Comparar calidad de contactos, turnos y cierres por campaña.',
    marketingActions: ['Validar atribución y objetivos de campaña', 'Revisar CTR y CPL por período'],
    salesActions: ['Registrar primer contacto y responsable', 'Completar estado, reserva y cierre de cada oportunidad'],
    evidence: [{ metric: 'spend', value: metrics.spend }, { metric: 'platformLeads', value: metrics.platformLeads }, { metric: 'cpl', value: cpl ?? 'N/A' }, { metric: 'ctrPercent', value: ctr ?? 'N/A' }],
    dataGaps,
    version: 'rules-v1'
  };
}
