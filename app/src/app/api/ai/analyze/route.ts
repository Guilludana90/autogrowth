import { analyzeWithAi, readAiConfig, validateAnalysisRange } from '@/lib/ai/analysis';
import { claudeCall } from '@/lib/ai/claude.server';
import { toRun, type RunRow } from '@/lib/data/p3Rows';
import { toDay } from '@/lib/domain/dates';
import { toRecommendationJson } from '@/lib/domain/recommendations';
import { PLATFORMS, type Campaign, type CampaignMetricsDaily, type Lead, type Platform } from '@/lib/domain/types';
import { bearer, HttpError, jsonError } from '@/lib/integrations/meta.server';
import { requireMember } from '@/lib/server/auth.server';

export const dynamic = 'force-dynamic';

/**
 * Análisis de una campaña con IA. Todo se lee con la identidad del usuario (RLS) y la corrida se guarda
 * con esa misma identidad. A la IA solo le llegan agregados; la evidencia la pone el motor de reglas.
 * Si la IA falla o no hay prompt activo, se guarda y devuelve el diagnóstico de reglas con el motivo.
 */
export async function POST(req: Request) {
  const c = readAiConfig(process.env);
  if (!c.ok) return Response.json({ error: c.reason }, { status: 503 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { org, db } = await requireMember(c.config, bearer(req), body.organizationId, ['super_admin', 'dealership_admin', 'sales_advisor'], 'Tu rol no puede ejecutar análisis');
    const platform = body.platform as Platform;
    if (!(PLATFORMS as readonly unknown[]).includes(platform)) throw new HttpError(400, 'Plataforma inválida');
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';
    if (!campaignId || campaignId.length > 100) throw new HttpError(400, 'Campaña inválida');
    const range = { from: String(body.from ?? ''), to: String(body.to ?? '') };
    const invalid = validateAnalysisRange(range, toDay(new Date()));
    if (invalid) throw new HttpError(400, invalid);

    const { data: cRow } = await db.from('campaigns').select('*').eq('organization_id', org).eq('platform', platform).eq('external_campaign_id', campaignId).maybeSingle();
    if (!cRow) throw new HttpError(404, 'Campaña inexistente o sin acceso');
    const cr = cRow as { external_campaign_id: string; name: string; objective: string; status: Campaign['status']; currency: string };
    const campaign: Campaign = { id: cr.external_campaign_id, organizationId: org, platform, name: cr.name, objective: cr.objective, status: cr.status, currency: cr.currency };

    const { data: mRows, error: mErr } = await db
      .from('campaign_metrics_daily')
      .select('metric_date, currency, spend, impressions, clicks, platform_leads')
      .eq('organization_id', org)
      .eq('platform', platform)
      .eq('external_campaign_id', campaignId)
      .gte('metric_date', range.from)
      .lte('metric_date', range.to);
    if (mErr) throw new Error(mErr.message);
    const rows: CampaignMetricsDaily[] = (mRows as Array<{ metric_date: string; currency: string; spend: string | number; impressions: number; clicks: number; platform_leads: number }>).map((r) => ({
      organizationId: org,
      platform,
      campaignId,
      date: r.metric_date,
      currency: r.currency,
      spend: Number(r.spend),
      impressions: r.impressions,
      clicks: r.clicks,
      platformLeads: r.platform_leads,
    }));

    // Solo estado y fechas de los leads: el nombre y el contacto no hacen falta para el análisis.
    const { data: lRows, error: lErr } = await db
      .from('leads')
      .select('id, status, source, created_at, updated_at')
      .eq('organization_id', org)
      .eq('external_campaign_id', campaignId)
      .gte('created_at', `${range.from}T00:00:00Z`)
      .lte('created_at', `${range.to}T23:59:59.999Z`);
    if (lErr) throw new Error(lErr.message);
    const leads: Lead[] = (lRows as Array<{ id: string; status: Lead['status']; source: string; created_at: string; updated_at: string }>).map((l) => ({
      id: l.id,
      organizationId: org,
      name: '',
      source: l.source,
      campaignId,
      status: l.status,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    }));

    const { data: pRow } = await db.from('prompt_versions').select('id, version, prompt_text').eq('organization_id', org).eq('name', 'campaign_analyst').eq('status', 'active').maybeSingle();
    const p = pRow as { id: string; version: string; prompt_text: string } | null;

    const rec = await analyzeWithAi({
      campaign,
      rows,
      leads,
      window: range,
      now: new Date().toISOString(),
      prompt: p ? { id: p.id, version: p.version, promptText: p.prompt_text } : null,
      call: claudeCall(c.config),
    });

    const { data: run, error: rErr } = await db
      .from('recommendation_runs')
      .insert({
        organization_id: org,
        platform,
        campaign_id: campaignId,
        window_from: range.from,
        window_to: range.to,
        engine: rec.engine,
        version: rec.version,
        prompt_version_id: rec.engine === 'ai' ? rec.promptVersionId : null,
        priority: rec.priority,
        problem_area: rec.problemArea,
        confidence: rec.confidence,
        payload: toRecommendationJson(rec),
      })
      .select('*')
      .single();
    if (rErr) throw new Error(rErr.message);
    return Response.json({ run: toRun(run as RunRow), rec });
  } catch (e) {
    return jsonError(e);
  }
}
