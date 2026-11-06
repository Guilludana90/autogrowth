import type { PromptAction, PromptStatus, PromptVersion, RecommendationFeedback, RecommendationRun, Role } from './types';

/**
 * Reglas de AI Governance, espejo de la RPC prompt_transition:
 * borrador → revisión (autor) → aprobada/rechazada (Super Admin) → activa (Super Admin) → rollback (Super Admin, con motivo).
 * Nada se promueve solo: cada paso es una acción explícita de una persona.
 */
export function canPrompt(action: PromptAction, status: PromptStatus, role: Role | undefined, isAuthor: boolean): boolean {
  if (!role) return false;
  switch (action) {
    case 'submit':
      return status === 'draft' && (isAuthor || role === 'super_admin');
    case 'approve':
      return status === 'in_review' && role === 'super_admin';
    case 'reject':
      return (status === 'in_review' || status === 'approved') && role === 'super_admin';
    case 'activate':
      return status === 'approved' && role === 'super_admin';
    case 'rollback':
      return status === 'rolled_back' && role === 'super_admin';
  }
}

export const canDraftPrompt = (role: Role | undefined) => role === 'super_admin' || role === 'dealership_admin';

export function nextPromptStatus(action: PromptAction): PromptStatus {
  return ({ submit: 'in_review', approve: 'approved', reject: 'rejected', activate: 'active', rollback: 'active' } as const)[action];
}

export const PROMPT_ACTION_LABEL: Record<PromptAction, string> = {
  submit: 'Enviar a revisión',
  approve: 'Aprobar',
  reject: 'Rechazar',
  activate: 'Publicar',
  rollback: 'Volver a esta versión',
};

/** Acciones que exigen motivo escrito. */
export const NEEDS_REASON: ReadonlySet<PromptAction> = new Set(['reject', 'rollback']);

/** v1.2 → v1.3. Si no hay versiones, v1.0. */
export function suggestNextVersion(versions: readonly Pick<PromptVersion, 'version'>[]): string {
  const nums = versions
    .map((v) => v.version.match(/^v?(\d+)\.(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [Number(m[1]), Number(m[2])] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const last = nums[nums.length - 1];
  return last ? `v${last[0]}.${last[1] + 1}` : 'v1.0';
}

export const VERSION_RE = /^v\d+\.\d+$/;

/** Diff por líneas (LCS) para revisar un borrador contra la versión activa. */
export function lineDiff(before: string, after: string): Array<{ kind: 'same' | 'add' | 'del'; text: string }> {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<{ kind: 'same' | 'add' | 'del'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ kind: 'del', text: a[i++]! });
    else out.push({ kind: 'add', text: b[j++]! });
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++]! });
  while (j < b.length) out.push({ kind: 'add', text: b[j++]! });
  return out;
}

// ───────────── Feedback y aprendizaje ─────────────

export interface FeedbackStats {
  total: number;
  useful: number;
  usefulRate: number | null; // %
  byVersion: Array<{ version: string; total: number; usefulRate: number | null }>;
  byArea: Array<{ area: RecommendationRun['problemArea']; total: number; usefulRate: number | null }>;
}

const rate = (u: number, t: number) => (t > 0 ? (u * 100) / t : null);

export function feedbackStats(feedback: readonly RecommendationFeedback[], runs: readonly RecommendationRun[]): FeedbackStats {
  const runById = new Map(runs.map((r) => [r.id, r]));
  const group = <K extends string>(key: (r: RecommendationRun) => K) => {
    const g = new Map<K, { total: number; useful: number }>();
    for (const f of feedback) {
      const run = runById.get(f.runId);
      if (!run) continue;
      const k = key(run);
      const cur = g.get(k) ?? { total: 0, useful: 0 };
      cur.total++;
      if (f.useful) cur.useful++;
      g.set(k, cur);
    }
    return [...g].map(([k, v]) => ({ k, total: v.total, usefulRate: rate(v.useful, v.total) }));
  };
  const useful = feedback.filter((f) => f.useful).length;
  return {
    total: feedback.length,
    useful,
    usefulRate: rate(useful, feedback.length),
    byVersion: group((r) => r.version).map(({ k, ...x }) => ({ version: k, ...x })).sort((a, b) => b.total - a.total),
    byArea: group((r) => r.problemArea).map(({ k, ...x }) => ({ area: k, ...x })).sort((a, b) => b.total - a.total),
  };
}

export const MIN_FEEDBACK_FOR_INSIGHTS = 5;
const MIN_PER_GROUP = 3;
const AREA_LABEL: Record<RecommendationRun['problemArea'], string> = {
  media: 'pauta',
  capture: 'captura al CRM',
  sales: 'gestión comercial',
  data: 'datos faltantes',
  none: 'sin problema detectado',
};

/**
 * Hallazgos calculados del feedback real. Con poco feedback lo dice en vez de sacar conclusiones,
 * y cada hallazgo indica cuántas respuestas lo sostienen.
 */
export function learningInsights(stats: FeedbackStats, notUsefulComments: readonly string[]): string[] {
  if (stats.total < MIN_FEEDBACK_FOR_INSIGHTS)
    return [`Todavía hay ${stats.total} ${stats.total === 1 ? 'respuesta' : 'respuestas'} de feedback; hacen falta al menos ${MIN_FEEDBACK_FOR_INSIGHTS} para sacar conclusiones.`];
  const out: string[] = [];
  const versions = stats.byVersion.filter((v) => v.total >= MIN_PER_GROUP && v.usefulRate !== null);
  if (versions.length >= 2) {
    const best = [...versions].sort((a, b) => b.usefulRate! - a.usefulRate!)[0]!;
    const worst = [...versions].sort((a, b) => a.usefulRate! - b.usefulRate!)[0]!;
    if (best.version !== worst.version)
      out.push(`${best.version} tiene ${best.usefulRate!.toFixed(0)}% útil (${best.total} respuestas) contra ${worst.usefulRate!.toFixed(0)}% de ${worst.version} (${worst.total}).`);
  }
  const areas = stats.byArea.filter((a) => a.total >= MIN_PER_GROUP && a.usefulRate !== null);
  const weakest = [...areas].sort((a, b) => a.usefulRate! - b.usefulRate!)[0];
  if (weakest && weakest.usefulRate! < 60)
    out.push(`Las recomendaciones sobre ${AREA_LABEL[weakest.area]} son las menos útiles: ${weakest.usefulRate!.toFixed(0)}% (${weakest.total} respuestas). Conviene revisar esa parte del prompt o de las reglas.`);
  const strongest = [...areas].sort((a, b) => b.usefulRate! - a.usefulRate!)[0];
  if (strongest && strongest !== weakest && strongest.usefulRate! >= 75)
    out.push(`Las recomendaciones sobre ${AREA_LABEL[strongest.area]} funcionan bien: ${strongest.usefulRate!.toFixed(0)}% útil (${strongest.total} respuestas).`);
  if (notUsefulComments.length) out.push(`Último comentario "no útil": “${notUsefulComments[0]}”`);
  if (!out.length) out.push(`Útil en ${stats.usefulRate!.toFixed(0)}% de ${stats.total} respuestas; todavía no hay diferencias claras entre versiones o temas.`);
  return out;
}
