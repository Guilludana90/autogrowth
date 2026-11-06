import { readAiConfig } from '@/lib/ai/analysis';

export const dynamic = 'force-dynamic';

/** Indica si el análisis con IA está habilitado en el servidor. No expone la clave, solo qué falta. */
export function GET() {
  const c = readAiConfig(process.env);
  return Response.json(c.ok ? { enabled: true, model: c.config.model } : { enabled: false, reason: c.reason }, { headers: { 'cache-control': 'no-store' } });
}
