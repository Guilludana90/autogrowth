import { describe, expect, it } from 'vitest';
import { canPrompt, feedbackStats, learningInsights, lineDiff, suggestNextVersion } from '@/lib/domain/governance';
import { aiInput, analyzeCampaign, AiAnalysisSchema, mergeAiAnalysis, RecommendationJsonSchema, toRecommendationJson } from '@/lib/domain/recommendations';
import type { Campaign, Lead, RecommendationFeedback, RecommendationRun } from '@/lib/domain/types';

describe('transiciones de prompts', () => {
  it('solo el autor (o Super Admin) envía un borrador a revisión', () => {
    expect(canPrompt('submit', 'draft', 'dealership_admin', true)).toBe(true);
    expect(canPrompt('submit', 'draft', 'dealership_admin', false)).toBe(false);
    expect(canPrompt('submit', 'draft', 'super_admin', false)).toBe(true);
    expect(canPrompt('submit', 'approved', 'super_admin', true)).toBe(false);
  });
  it('solo Super Admin aprueba, rechaza, publica y vuelve atrás', () => {
    for (const r of ['dealership_admin', 'sales_advisor', 'read_only', 'post_sales'] as const) {
      expect(canPrompt('approve', 'in_review', r, true)).toBe(false);
      expect(canPrompt('activate', 'approved', r, true)).toBe(false);
      expect(canPrompt('rollback', 'rolled_back', r, true)).toBe(false);
    }
    expect(canPrompt('approve', 'in_review', 'super_admin', false)).toBe(true);
    expect(canPrompt('activate', 'approved', 'super_admin', false)).toBe(true);
    expect(canPrompt('activate', 'in_review', 'super_admin', false)).toBe(false);
    expect(canPrompt('rollback', 'rolled_back', 'super_admin', false)).toBe(true);
    expect(canPrompt('reject', 'active', 'super_admin', false)).toBe(false);
  });
  it('sugiere la próxima versión', () => {
    expect(suggestNextVersion([])).toBe('v1.0');
    expect(suggestNextVersion([{ version: 'v1.0' }, { version: 'v1.2' }, { version: 'v1.1' }])).toBe('v1.3');
    expect(suggestNextVersion([{ version: 'v2.9' }, { version: 'v10.0' }])).toBe('v10.1');
  });
  it('diff por líneas', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });
});

const run = (id: string, version: string, area: RecommendationRun['problemArea']): RecommendationRun => ({
  id,
  organizationId: 'cardys_fiat',
  platform: 'meta',
  campaignId: 'c1',
  windowFrom: '2026-10-01',
  windowTo: '2026-10-31',
  engine: 'rules',
  version,
  priority: 'high',
  problemArea: area,
  confidence: 0.8,
  payload: {},
  createdAt: '2026-11-01T00:00:00Z',
});
const fb = (runId: string, useful: boolean, comment?: string): RecommendationFeedback => ({ id: Math.random().toString(), organizationId: 'cardys_fiat', runId, useful, comment, userId: 'u', createdAt: '2026-11-01T00:00:00Z' });

describe('feedback y aprendizaje', () => {
  const runs = [run('r1', 'rules-v2', 'capture'), run('r2', 'prompt:campaign_analyst@v1.1', 'sales')];
  it('calcula la tasa útil, sin números fijos', () => {
    const s = feedbackStats([fb('r1', true), fb('r1', false), fb('r2', true), fb('rX', true)], runs);
    expect(s.total).toBe(4);
    expect(s.usefulRate).toBe(75);
    expect(s.byVersion.find((v) => v.version === 'rules-v2')).toMatchObject({ total: 2, usefulRate: 50 });
  });
  it('no saca conclusiones con poco feedback', () => {
    const s = feedbackStats([fb('r1', true)], runs);
    expect(learningInsights(s, [])[0]).toMatch(/hacen falta al menos 5/);
    expect(feedbackStats([], runs).usefulRate).toBeNull();
  });
  it('compara versiones y temas con evidencia', () => {
    const f = [fb('r1', false, 'no aplica'), fb('r1', false), fb('r1', true), fb('r2', true), fb('r2', true), fb('r2', true)];
    const ins = learningInsights(feedbackStats(f, runs), ['no aplica']);
    expect(ins.join(' ')).toMatch(/v1\.1 tiene 100% útil \(3 respuestas\)/);
    expect(ins.join(' ')).toMatch(/captura al CRM son las menos útiles: 33%/);
    expect(ins.join(' ')).toMatch(/no aplica/);
  });
});

describe('JSON estructurado e IA', () => {
  const campaign: Campaign = { id: 'c1', organizationId: 'cardys_fiat', platform: 'meta', name: 'Cronos', objective: 'LEADS', status: 'active', currency: 'ARS' };
  const rows = Array.from({ length: 10 }, (_, i) => ({ organizationId: 'cardys_fiat' as const, platform: 'meta' as const, campaignId: 'c1', date: `2026-10-${String(i + 1).padStart(2, '0')}`, currency: 'ARS', spend: 1000, impressions: 1000, clicks: 20, platformLeads: 2 }));
  const leads: Lead[] = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, organizationId: 'cardys_fiat', name: `Persona ${i}`, phoneE164: '+5492392000000', source: 'Meta', campaignId: 'c1', status: 'contacted', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' }));
  const rules = analyzeCampaign(campaign, rows, leads, '2026-11-06T00:00:00Z', { from: '2026-10-01', to: '2026-10-31' });

  it('la salida de reglas cumple el contrato del spec', () => {
    const j = toRecommendationJson(rules);
    expect(RecommendationJsonSchema.safeParse(j).success).toBe(true);
    expect(j).toMatchObject({ engine: 'rules', model_or_rule_version: 'rules-v2', problem_area: 'capture', priority: 'high' });
    expect(j.confidence).toBeGreaterThan(0.5);
  });
  it('la confianza baja cuando faltan datos', () => {
    expect(analyzeCampaign(campaign, [], [], '2026-11-06T00:00:00Z').confidence).toBeLessThanOrEqual(0.4);
    expect(analyzeCampaign(campaign, rows.slice(0, 2), [], '2026-11-06T00:00:00Z').confidenceReason).toMatch(/menos de 7 días/);
  });
  it('a la IA no le llegan datos personales', () => {
    const s = JSON.stringify(aiInput(campaign, rules));
    expect(s).not.toMatch(/Persona|\+549/);
    expect(s).toMatch(/platformLeads/);
  });
  it('la IA no puede tocar la evidencia ni subir la confianza', () => {
    const ai = AiAnalysisSchema.parse({
      priority: 'medium',
      problem_area: 'sales',
      diagnosis: 'd',
      main_issue: 'm',
      recommended_action: 'a',
      marketing_actions: ['x'],
      sales_actions: ['y'],
      data_gaps: ['falta tiempo de respuesta'],
      confidence: 0.99,
    });
    const merged = mergeAiAnalysis(rules, ai, 'prompt:campaign_analyst@v1.1 · claude-opus-5-5', 'p1');
    expect(merged.evidence).toEqual(rules.evidence);
    expect(merged.confidence).toBe(rules.confidence);
    expect(merged.engine).toBe('ai');
    expect(merged.dataGaps).toContain('falta tiempo de respuesta');
    expect(RecommendationJsonSchema.safeParse(toRecommendationJson(merged)).success).toBe(true);
  });
  it('rechaza salidas de IA fuera de contrato', () => {
    expect(AiAnalysisSchema.safeParse({ priority: 'urgent' }).success).toBe(false);
    expect(AiAnalysisSchema.safeParse({ priority: 'low', problem_area: 'none', diagnosis: 'd', main_issue: 'm', recommended_action: 'a', marketing_actions: [], sales_actions: ['y'], data_gaps: [], confidence: 2 }).success).toBe(false);
  });
});
