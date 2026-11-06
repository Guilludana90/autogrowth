import { z } from 'zod';
import { crmFunnel, derive, formatMoney, formatNumber, sumMetrics } from './metrics';
import type { Campaign, CampaignMetricsDaily, DateRange, Lead } from './types';

export type Priority = 'low' | 'medium' | 'high';
/** Dónde está el problema: pauta (media), captura al CRM, gestión comercial, datos o ninguno. */
export type ProblemArea = 'media' | 'capture' | 'sales' | 'data' | 'none';
export type Engine = 'rules' | 'ai';

export const RULES_VERSION = 'rules-v2';

export interface CampaignRecommendation {
  campaignId: string;
  engine: Engine;
  /** rules-v2, o para IA: prompt:<nombre>@<versión> · <modelo> */
  version: string;
  promptVersionId?: string;
  priority: Priority;
  problemArea: ProblemArea;
  diagnosis: string;
  mainIssue: string;
  recommendedAction: string;
  marketingActions: string[];
  salesActions: string[];
  /** Evidencia siempre calculada por el motor de reglas, nunca por la IA. */
  evidence: Array<{ metric: string; value: number | string }>;
  /** 0–1: qué tan completos y suficientes son los datos que sostienen el diagnóstico. */
  confidence: number;
  confidenceReason: string;
  dataGaps: string[];
  window?: DateRange;
  generatedAt: string;
  /** Si se pidió IA y no se pudo usar, por qué se volvió a reglas. */
  fallbackReason?: string;
}

const fmt = (n: number | null, d = 2) => (n === null ? 'sin datos' : n.toFixed(d));

/**
 * Motor determinista (rules-v2). Cruza métricas de la plataforma con leads del CRM atribuidos a la campaña
 * en la misma ventana. Separa problema de pauta, de captura y de ventas. Nunca inventa contactos ni cierres:
 * si faltan, los reporta como dataGaps y baja la confianza.
 */
export function analyzeCampaign(
  campaign: Campaign,
  rows: readonly CampaignMetricsDaily[],
  crmLeads: readonly Lead[],
  now: string,
  window?: DateRange,
): CampaignRecommendation {
  const m = derive(sumMetrics(rows));
  const f = crmFunnel(crmLeads);
  const days = new Set(rows.map((r) => r.date)).size;
  const dataGaps: string[] = [];
  if (rows.length === 0) dataGaps.push('No hay métricas importadas para el período');
  if (m.platformLeads > 0 && f.crmLeads === 0) dataGaps.push('Ningún lead del CRM tiene esta campaña atribuida');
  if (f.crmLeads > 0 && f.contacted === 0) dataGaps.push('No hay contactos registrados en el CRM');
  if (rows.length > 0 && days < 7) dataGaps.push(`Solo ${days} ${days === 1 ? 'día' : 'días'} con métricas: muestra corta`);

  const noLeads = rows.length > 0 && m.platformLeads === 0 && m.spend > 0;
  const leakage = m.platformLeads > 0 && f.crmLeads < m.platformLeads;
  const leakagePct = m.platformLeads > 0 ? ((m.platformLeads - f.crmLeads) / m.platformLeads) * 100 : 0;
  const noContact = f.crmLeads > 0 && (f.contactRate ?? 0) < 50;

  let priority: Priority = 'low';
  let area: ProblemArea = 'none';
  let mainIssue = 'Sin alertas relevantes en el período.';
  let action = 'Comparar calidad de contactos y cierres contra otras campañas antes de escalar inversión.';
  let marketing = ['Mantener la pauta y comparar CPL real contra el período anterior', 'Probar una variante creativa sin cambiar el objetivo'];
  let sales = ['Registrar resultado de cada contacto (cita, prueba de manejo, cierre)', 'Cargar motivo de pérdida cuando corresponda'];

  if (rows.length === 0) {
    area = 'data';
    priority = crmLeads.length > 0 ? 'medium' : 'low';
    mainIssue = 'No hay métricas de la plataforma para evaluar la campaña en este período.';
    action = 'Importar las métricas diarias de la campaña antes de decidir cambios de pauta.';
    marketing = ['Exportar el informe con desglose por día e importarlo en Canales conectados'];
    sales = ['Seguir registrando el origen y la campaña de cada lead'];
  } else if (leakage && leakagePct >= 30) {
    priority = 'high';
    area = 'capture';
    mainIssue = `${fmt(leakagePct, 0)}% de los leads informados por la plataforma no aparecen en el CRM.`;
    action = 'Auditar la captura (formulario, WhatsApp, Tecnom) y la deduplicación antes de cambiar la pauta.';
    marketing = ['No subir presupuesto hasta conciliar la captura', 'Verificar que el formulario o el destino de WhatsApp sea el del concesionario'];
    sales = ['Cargar en el CRM los leads que llegaron por fuera (WhatsApp personal, llamadas)', 'Completar el campo campaña al registrar cada lead'];
  } else if (noContact) {
    priority = 'high';
    area = 'sales';
    mainIssue = `Solo ${fmt(f.contactRate, 0)}% de los leads del CRM fue contactado.`;
    action = 'Asignar asesor y registrar el primer contacto de cada lead; revisar el tiempo de respuesta.';
    marketing = ['Mantener la pauta: el cuello de botella está en la gestión, no en los medios'];
    sales = ['Asignar responsable a cada lead nuevo el mismo día', 'Registrar el primer contacto y la próxima tarea'];
  } else if (noLeads) {
    priority = 'medium';
    area = 'media';
    mainIssue = 'La campaña invierte pero no genera leads en el período.';
    action = 'Revisar segmentación, creatividad, objetivo y tracking antes de sumar presupuesto.';
    marketing = ['Revisar objetivo y evento de conversión', 'Pausar conjuntos sin resultados y redistribuir'];
    sales = ['Sin acción comercial hasta que la campaña genere leads'];
  } else if (leakage) {
    priority = 'medium';
    area = 'capture';
    mainIssue = 'Hay diferencia entre leads de la plataforma y leads del CRM.';
    action = 'Conciliar leads de la plataforma con el CRM y completar el campo campaña al cargar.';
    marketing = ['Revisar duplicados y leads de prueba en la plataforma'];
    sales = ['Completar el campo campaña al cargar cada lead'];
  }

  // Confianza: baja con cada faltante de datos. No mide si la recomendación es buena, sino si los datos alcanzan.
  let confidence = 0.9;
  const reasons: string[] = [];
  if (rows.length === 0) {
    confidence -= 0.5;
    reasons.push('sin métricas');
  } else if (days < 7) {
    confidence -= 0.2;
    reasons.push('menos de 7 días con métricas');
  }
  if (m.platformLeads > 0 && f.crmLeads === 0) {
    confidence -= 0.15;
    reasons.push('sin leads atribuidos en el CRM');
  }
  if (f.crmLeads > 0 && f.crmLeads < 5) {
    confidence -= 0.1;
    reasons.push('menos de 5 leads en el CRM');
  }
  confidence = Math.round(Math.min(0.95, Math.max(0.1, confidence)) * 100) / 100;

  return {
    campaignId: campaign.id,
    engine: 'rules',
    version: RULES_VERSION,
    priority,
    problemArea: area,
    diagnosis:
      `Inversión ${formatMoney(m.spend, campaign.currency)}, ${formatNumber(m.platformLeads)} leads de plataforma, ` +
      `${formatNumber(f.crmLeads)} en CRM (${f.contacted} contactados, ${f.won} ganados), CPL ${m.cpl === null ? 'sin datos' : formatMoney(m.cpl, campaign.currency)} y CTR ${m.ctr === null ? 'sin datos' : formatNumber(m.ctr, 2) + '%'}.`,
    mainIssue,
    recommendedAction: action,
    marketingActions: marketing,
    salesActions: sales,
    evidence: [
      { metric: 'spend', value: m.spend },
      { metric: 'impressions', value: m.impressions },
      { metric: 'clicks', value: m.clicks },
      { metric: 'platformLeads', value: m.platformLeads },
      { metric: 'crmLeads', value: f.crmLeads },
      { metric: 'contacted', value: f.contacted },
      { metric: 'won', value: f.won },
      { metric: 'daysWithMetrics', value: days },
      { metric: 'cpl', value: m.cpl ?? 'N/A' },
      { metric: 'cpc', value: m.cpc ?? 'N/A' },
      { metric: 'cpm', value: m.cpm ?? 'N/A' },
      { metric: 'ctrPercent', value: m.ctr ?? 'N/A' },
    ],
    confidence,
    confidenceReason: reasons.length ? `Baja por: ${reasons.join(', ')}.` : 'Datos completos para el período.',
    dataGaps,
    window,
    generatedAt: now,
  };
}

// ───────────── JSON estructurado (contrato del FUNCTIONAL_SPEC) ─────────────

export const RecommendationJsonSchema = z
  .object({
    campaign_id: z.string().min(1),
    engine: z.enum(['rules', 'ai']),
    model_or_rule_version: z.string().min(1),
    prompt_version_id: z.string().nullable(),
    priority: z.enum(['low', 'medium', 'high']),
    problem_area: z.enum(['media', 'capture', 'sales', 'data', 'none']),
    diagnosis: z.string().min(1),
    main_issue: z.string().min(1),
    recommended_action: z.string().min(1),
    marketing_actions: z.array(z.string().min(1)).min(1),
    sales_actions: z.array(z.string().min(1)).min(1),
    evidence: z.array(z.object({ metric: z.string(), value: z.union([z.number(), z.string()]) })).min(1),
    confidence: z.number().min(0).max(1),
    confidence_reason: z.string(),
    data_gaps: z.array(z.string()),
    window: z.object({ from: z.string(), to: z.string() }).nullable(),
    generated_at: z.string(),
    fallback_reason: z.string().nullable(),
  })
  .strict();
export type RecommendationJson = z.infer<typeof RecommendationJsonSchema>;

export function toRecommendationJson(r: CampaignRecommendation): RecommendationJson {
  return RecommendationJsonSchema.parse({
    campaign_id: r.campaignId,
    engine: r.engine,
    model_or_rule_version: r.version,
    prompt_version_id: r.promptVersionId ?? null,
    priority: r.priority,
    problem_area: r.problemArea,
    diagnosis: r.diagnosis,
    main_issue: r.mainIssue,
    recommended_action: r.recommendedAction,
    marketing_actions: r.marketingActions,
    sales_actions: r.salesActions,
    evidence: r.evidence,
    confidence: r.confidence,
    confidence_reason: r.confidenceReason,
    data_gaps: r.dataGaps,
    window: r.window ?? null,
    generated_at: r.generatedAt,
    fallback_reason: r.fallbackReason ?? null,
  });
}

// ───────────── Salida de la IA ─────────────

/**
 * Lo único que la IA puede aportar: redacción del diagnóstico y acciones. La evidencia, los números y
 * la ventana los pone el motor de reglas, así la IA no puede inventar métricas, contactos ni cierres.
 */
export const AiAnalysisSchema = z.object({
  priority: z.enum(['low', 'medium', 'high']),
  problem_area: z.enum(['media', 'capture', 'sales', 'data', 'none']),
  diagnosis: z.string().min(1).max(1200),
  main_issue: z.string().min(1).max(600),
  recommended_action: z.string().min(1).max(600),
  marketing_actions: z.array(z.string().min(1).max(300)).min(1).max(5),
  sales_actions: z.array(z.string().min(1).max(300)).min(1).max(5),
  data_gaps: z.array(z.string().max(300)).max(8),
  confidence: z.number().min(0).max(1),
});
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

/** Une la redacción de la IA con la evidencia de reglas. La confianza final nunca supera la de los datos. */
export function mergeAiAnalysis(rules: CampaignRecommendation, ai: AiAnalysis, version: string, promptVersionId: string): CampaignRecommendation {
  return {
    ...rules,
    engine: 'ai',
    version,
    promptVersionId,
    priority: ai.priority,
    problemArea: ai.problem_area,
    diagnosis: ai.diagnosis,
    mainIssue: ai.main_issue,
    recommendedAction: ai.recommended_action,
    marketingActions: ai.marketing_actions,
    salesActions: ai.sales_actions,
    dataGaps: [...new Set([...rules.dataGaps, ...ai.data_gaps])],
    confidence: Math.min(rules.confidence, ai.confidence),
    confidenceReason: `${rules.confidenceReason} La IA estimó ${ai.confidence.toFixed(2)}; se usa el menor valor.`,
  };
}

/** Datos agregados que se le pasan a la IA: sin nombres, teléfonos ni emails de leads. */
export function aiInput(campaign: Campaign, rules: CampaignRecommendation) {
  return {
    campaign: { id: campaign.id, name: campaign.name, platform: campaign.platform, objective: campaign.objective, status: campaign.status, currency: campaign.currency },
    window: rules.window ?? null,
    evidence: rules.evidence,
    rules_diagnosis: { priority: rules.priority, problem_area: rules.problemArea, main_issue: rules.mainIssue, data_gaps: rules.dataGaps },
  };
}
