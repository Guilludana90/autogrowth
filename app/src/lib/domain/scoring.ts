import type { Lead } from './types';

type ScoreInput = Pick<Lead, 'phoneE164' | 'email' | 'modelInterest' | 'source' | 'campaignId'>;

/**
 * Score determinista y explicable (rules-v1). No es IA: suma señales objetivas de completitud e intención.
 * Siempre devuelve la explicación para mostrarla junto al número.
 */
export function scoreLead(l: ScoreInput): { score: number; reason: string; version: string } {
  const parts: Array<[number, string]> = [[30, 'base']];
  if (l.phoneE164) parts.push([20, 'teléfono válido']);
  if (l.email) parts.push([10, 'email válido']);
  if (l.modelInterest && !/sin definir/i.test(l.modelInterest)) parts.push([20, 'modelo de interés']);
  if (l.campaignId) parts.push([10, 'campaña atribuida']);
  if (/whatsapp|referido/i.test(l.source)) parts.push([10, `canal ${l.source}`]);
  const score = Math.min(100, parts.reduce((a, [p]) => a + p, 0));
  return { score, reason: parts.map(([p, r]) => `+${p} ${r}`).join(' · '), version: 'rules-v1' };
}
