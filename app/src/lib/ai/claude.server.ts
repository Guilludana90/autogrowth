import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AiAnalysisSchema } from '../domain/recommendations';
import type { AiConfig, ModelCall } from './analysis';

/**
 * Solo servidor: llamado a Claude con salida estructurada validada por zod.
 * La clave vive en ANTHROPIC_API_KEY del servidor y nunca llega al navegador.
 * Sin `fallbacks` de servidor: el respaldo es el motor de reglas (ver analyzeWithAi).
 */
export function claudeCall(cfg: AiConfig): ModelCall {
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: cfg.timeoutMs, maxRetries: 1 });
  return async (system, user) => {
    try {
      const msg = await client.messages.parse({
        model: cfg.model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: zodOutputFormat(AiAnalysisSchema), effort: 'medium' },
      });
      if (msg.stop_reason === 'refusal') return { ok: false, reason: 'el modelo rechazó la solicitud' };
      if (msg.stop_reason === 'max_tokens') return { ok: false, reason: 'la respuesta quedó incompleta' };
      if (!msg.parsed_output) return { ok: false, reason: 'respuesta sin JSON válido' };
      return { ok: true, analysis: msg.parsed_output, model: msg.model };
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: 'límite de uso alcanzado, probá más tarde' };
      if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'la clave del servidor no es válida' };
      if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'tiempo de espera agotado' };
      if (e instanceof Anthropic.APIError) return { ok: false, reason: `error ${e.status ?? ''} de la API`.trim() };
      return { ok: false, reason: 'respuesta inválida' };
    }
  };
}
