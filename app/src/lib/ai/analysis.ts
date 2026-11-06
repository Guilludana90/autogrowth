import { aiInput, analyzeCampaign, AiAnalysisSchema, mergeAiAnalysis, type AiAnalysis, type CampaignRecommendation } from '../domain/recommendations';
import type { Campaign, CampaignMetricsDaily, DateRange, Lead } from '../domain/types';

/**
 * Orquestación del análisis con IA, sin dependencias de red: el llamado al modelo se inyecta.
 * Si algo falla (no hay prompt activo, error del modelo, salida fuera de contrato) se devuelve
 * el diagnóstico de reglas con `fallbackReason`, nunca un resultado inventado.
 */

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
export const MAX_ANALYSIS_DAYS = 93;

export interface AiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function readAiConfig(env: Record<string, string | undefined>): { ok: true; config: AiConfig } | { ok: false; reason: string } {
  if (env.NEXT_PUBLIC_DEMO_MODE !== 'false') return { ok: false, reason: 'Modo demo: la IA generativa está desactivada; las recomendaciones salen del motor de reglas.' };
  if (env.AI_ANALYSIS_ENABLED !== 'true') return { ok: false, reason: 'La IA generativa está apagada (AI_ANALYSIS_ENABLED distinto de true). Se usa el motor de reglas.' };
  const missing = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter((k) => !env[k]?.trim());
  if (missing.length) return { ok: false, reason: `Falta configurar en el servidor: ${missing.join(', ')}.` };
  const timeout = Number(env.AI_TIMEOUT_MS || 60_000);
  return {
    ok: true,
    config: {
      apiKey: env.ANTHROPIC_API_KEY!,
      model: env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
      timeoutMs: Number.isFinite(timeout) && timeout >= 5_000 ? Math.min(timeout, 180_000) : 60_000,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
  };
}

export type ModelCall = (system: string, user: string) => Promise<{ ok: true; analysis: unknown; model: string } | { ok: false; reason: string }>;

export interface ActivePrompt {
  id: string;
  version: string;
  promptText: string;
}

/** Mensaje de usuario: solo agregados (ver aiInput). */
export function buildUserMessage(campaign: Campaign, rules: CampaignRecommendation): string {
  return [
    'Datos agregados de la campaña y diagnóstico del motor de reglas (JSON):',
    JSON.stringify(aiInput(campaign, rules), null, 2),
    '',
    'Devolvé el análisis con el esquema pedido. La confianza (0 a 1) tiene que reflejar cuánto sostienen los datos tus conclusiones.',
  ].join('\n');
}

export async function analyzeWithAi(args: {
  campaign: Campaign;
  rows: readonly CampaignMetricsDaily[];
  leads: readonly Lead[];
  window: DateRange;
  now: string;
  prompt: ActivePrompt | null;
  call: ModelCall;
}): Promise<CampaignRecommendation> {
  const rules = analyzeCampaign(args.campaign, args.rows, args.leads, args.now, args.window);
  if (!args.prompt) return { ...rules, fallbackReason: 'No hay una versión activa del prompt "Analista de campañas": se muestra el motor de reglas.' };
  if (!args.rows.length) return { ...rules, fallbackReason: 'Sin métricas en el período no se llama a la IA: primero hay que importar datos.' };
  let res: Awaited<ReturnType<ModelCall>>;
  try {
    res = await args.call(args.prompt.promptText, buildUserMessage(args.campaign, rules));
  } catch (e) {
    res = { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) return { ...rules, fallbackReason: `La IA no respondió (${res.reason}); se muestra el motor de reglas.` };
  const parsed = AiAnalysisSchema.safeParse(res.analysis);
  if (!parsed.success) return { ...rules, fallbackReason: 'La respuesta de la IA no cumplió el contrato JSON; se muestra el motor de reglas.' };
  const ai: AiAnalysis = parsed.data;
  return mergeAiAnalysis(rules, ai, `prompt:campaign_analyst@${args.prompt.version} · ${res.model}`, args.prompt.id);
}

export function validateAnalysisRange(range: DateRange, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) return 'Rango inválido';
  if (range.from > range.to) return 'El rango está invertido';
  if (range.to > today) return 'El rango incluye días futuros';
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  if (days > MAX_ANALYSIS_DAYS) return `Máximo ${MAX_ANALYSIS_DAYS} días por análisis`;
  return undefined;
}
