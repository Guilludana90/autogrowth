import { describe, expect, it, vi } from 'vitest';
import { analyzeWithAi, buildUserMessage, readAiConfig, validateAnalysisRange, type ModelCall } from '@/lib/ai/analysis';
import { analyzeCampaign } from '@/lib/domain/recommendations';
import type { Campaign, Lead } from '@/lib/domain/types';

const campaign: Campaign = { id: 'c1', organizationId: 'cardys_fiat', platform: 'meta', name: 'Cronos', objective: 'LEADS', status: 'active', currency: 'ARS' };
const rows = Array.from({ length: 10 }, (_, i) => ({ organizationId: 'cardys_fiat' as const, platform: 'meta' as const, campaignId: 'c1', date: `2026-10-${String(i + 1).padStart(2, '0')}`, currency: 'ARS', spend: 1000, impressions: 1000, clicks: 20, platformLeads: 2 }));
const leads: Lead[] = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, organizationId: 'cardys_fiat', name: `Persona ${i}`, phoneE164: '+5492392000000', source: 'Meta', campaignId: 'c1', status: 'contacted', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' }));
const window = { from: '2026-10-01', to: '2026-10-31' };
const now = '2026-11-06T00:00:00Z';
const prompt = { id: 'p1', version: 'v1.1', promptText: 'Sos analista' };
const good = { priority: 'medium', problem_area: 'sales', diagnosis: 'd', main_issue: 'm', recommended_action: 'a', marketing_actions: ['x'], sales_actions: ['y'], data_gaps: [], confidence: 0.6 };
const base = { campaign, rows, leads, window, now };

describe('análisis con IA', () => {
  it('sin configuración explícita queda apagada', () => {
    expect(readAiConfig({}).ok).toBe(false);
    expect(readAiConfig({ NEXT_PUBLIC_DEMO_MODE: 'false', ANTHROPIC_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a' })).toMatchObject({ ok: false, reason: expect.stringMatching(/AI_ANALYSIS_ENABLED/) });
    const c = readAiConfig({ NEXT_PUBLIC_DEMO_MODE: 'false', AI_ANALYSIS_ENABLED: 'true', NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a' });
    expect(c).toMatchObject({ ok: false, reason: expect.stringMatching(/ANTHROPIC_API_KEY/) });
    const ok = readAiConfig({ NEXT_PUBLIC_DEMO_MODE: 'false', AI_ANALYSIS_ENABLED: 'true', ANTHROPIC_API_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a' });
    expect(ok.ok && ok.config.model).toBe('claude-opus-5-5');
  });

  it('une la redacción de la IA con la evidencia de reglas', async () => {
    const call = vi.fn<ModelCall>(async () => ({ ok: true, analysis: good, model: 'claude-opus-5-5' }));
    const rec = await analyzeWithAi({ ...base, prompt, call });
    expect(rec.engine).toBe('ai');
    expect(rec.version).toBe('prompt:campaign_analyst@v1.1 · claude-opus-5-5');
    expect(rec.promptVersionId).toBe('p1');
    expect(rec.evidence).toEqual(analyzeCampaign(campaign, rows, leads, now, window).evidence);
    expect(call.mock.calls[0]![0]).toBe('Sos analista');
    expect(call.mock.calls[0]![1]).not.toMatch(/Persona|\+549/);
  });

  it('vuelve a reglas y dice por qué', async () => {
    const never = vi.fn<ModelCall>();
    expect((await analyzeWithAi({ ...base, prompt: null, call: never })).fallbackReason).toMatch(/versión activa/);
    expect((await analyzeWithAi({ ...base, rows: [], prompt, call: never })).fallbackReason).toMatch(/Sin métricas/);
    expect(never).not.toHaveBeenCalled();
    const failing: ModelCall = async () => ({ ok: false, reason: 'tiempo de espera agotado' });
    const r1 = await analyzeWithAi({ ...base, prompt, call: failing });
    expect(r1.engine).toBe('rules');
    expect(r1.fallbackReason).toMatch(/tiempo de espera agotado/);
    const throwing: ModelCall = async () => {
      throw new Error('boom');
    };
    expect((await analyzeWithAi({ ...base, prompt, call: throwing })).fallbackReason).toMatch(/boom/);
    const bad: ModelCall = async () => ({ ok: true, analysis: { ...good, priority: 'urgent' }, model: 'm' });
    expect((await analyzeWithAi({ ...base, prompt, call: bad })).fallbackReason).toMatch(/contrato JSON/);
  });

  it('el mensaje al modelo lleva solo agregados', () => {
    const msg = buildUserMessage(campaign, analyzeCampaign(campaign, rows, leads, now, window));
    expect(msg).toMatch(/platformLeads/);
    expect(msg).not.toMatch(/Persona|\+549|@/);
  });

  it('valida el período', () => {
    expect(validateAnalysisRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-06')).toBeUndefined();
    expect(validateAnalysisRange({ from: '2026-11-01', to: '2026-10-31' }, '2026-11-06')).toMatch(/invertido/);
    expect(validateAnalysisRange({ from: '2026-01-01', to: '2026-10-31' }, '2026-11-06')).toMatch(/Máximo/);
    expect(validateAnalysisRange({ from: '2026-11-01', to: '2026-11-10' }, '2026-11-06')).toMatch(/futuros/);
  });
});
