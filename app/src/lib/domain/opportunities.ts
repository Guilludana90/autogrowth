import { addDays } from './dates';
import type { Campaign, CampaignMetricsDaily, Lead, PriceDocument, Quote, Task } from './types';

/**
 * Oportunidades y alertas de datos derivadas solo de lo que hay en el CRM.
 * No se infieren conversaciones, citas ni cierres que no estén registrados.
 */

export type OpportunityKind = 'hot_uncontacted' | 'stalled_negotiation' | 'approved_quote_open' | 'expired_quote' | 'price_reactivation';

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  organizationId: Lead['organizationId'];
  leadId: string;
  leadName: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  evidence: string[];
  since: string; // ISO o YYYY-MM-DD: desde cuándo está la situación
}

export const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = {
  hot_uncontacted: 'Lead caliente sin contactar',
  stalled_negotiation: 'Negociación sin movimiento',
  approved_quote_open: 'Cotización aprobada sin cierre',
  expired_quote: 'Cotización vencida con lead abierto',
  price_reactivation: 'Perdido por precio: nueva lista disponible',
};

const HOURS = 3_600_000;
const open = (l: Lead) => l.status !== 'won' && l.status !== 'lost';
const hoursSince = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / HOURS;
const PRICE_RE = /precio|financ|cuota|caro|presupuesto/i;
const RANK = { high: 0, medium: 1, low: 2 } as const;
/** Un lead caliente de más de 30 días ya no es una oportunidad caliente: queda en Alertas de datos (sin asesor) o en el pipeline. */
export const HOT_MAX_DAYS = 30;

export interface OpportunityInput {
  leads: readonly Lead[];
  tasks: readonly Task[];
  quotes: readonly Quote[];
  priceDocs: readonly PriceDocument[];
  now: Date;
}

export function detectOpportunities({ leads, tasks, quotes, priceDocs, now }: OpportunityInput): Opportunity[] {
  const today = now.toISOString().slice(0, 10);
  const out: Opportunity[] = [];
  const openTaskLeads = new Set(tasks.filter((t) => t.status !== 'done' && t.leadId).map((t) => t.leadId!));

  for (const l of leads) {
    if (l.status === 'new' && (l.score ?? 0) >= 70 && hoursSince(l.createdAt, now) >= 24 && hoursSince(l.createdAt, now) <= HOT_MAX_DAYS * 24) {
      const h = Math.floor(hoursSince(l.createdAt, now));
      out.push({
        id: `hot:${l.id}`,
        kind: 'hot_uncontacted',
        organizationId: l.organizationId,
        leadId: l.id,
        leadName: l.name,
        title: OPPORTUNITY_LABEL.hot_uncontacted,
        detail: `Score ${l.score} y ${h >= 48 ? `${Math.floor(h / 24)} días` : `${h} h`} sin primer contacto${l.advisorId ? '' : ', sin asesor asignado'}.`,
        priority: 'high',
        evidence: [`score=${l.score}`, `estado=nuevo`, `alta=${l.createdAt.slice(0, 10)}`],
        since: l.createdAt,
      });
    }
    if (l.status === 'negotiation' && hoursSince(l.updatedAt, now) >= 7 * 24 && !openTaskLeads.has(l.id)) {
      out.push({
        id: `stall:${l.id}`,
        kind: 'stalled_negotiation',
        organizationId: l.organizationId,
        leadId: l.id,
        leadName: l.name,
        title: OPPORTUNITY_LABEL.stalled_negotiation,
        detail: `En negociación desde hace ${Math.floor(hoursSince(l.updatedAt, now) / 24)} días sin cambios y sin tarea abierta.`,
        priority: 'medium',
        evidence: ['estado=negociación', `última actualización=${l.updatedAt.slice(0, 10)}`, 'tareas abiertas=0'],
        since: l.updatedAt,
      });
    }
  }

  const leadById = new Map(leads.map((l) => [l.id, l]));
  for (const q of quotes) {
    const l = q.leadId ? leadById.get(q.leadId) : undefined;
    if (!l || !open(l) || q.status !== 'approved') continue;
    const expired = q.validUntil < today;
    const daysLeft = Math.round((Date.parse(q.validUntil) - Date.parse(today)) / (24 * HOURS));
    out.push({
      id: `quote:${q.id}`,
      kind: expired ? 'expired_quote' : 'approved_quote_open',
      organizationId: q.organizationId,
      leadId: l.id,
      leadName: l.name,
      title: OPPORTUNITY_LABEL[expired ? 'expired_quote' : 'approved_quote_open'],
      detail: expired
        ? `La cotización N.º ${q.number} (${q.vehicle}) venció el ${q.validUntil}: renovarla con la lista vigente.`
        : `Cotización N.º ${q.number} (${q.vehicle}) aprobada; vence ${daysLeft === 0 ? 'hoy' : `en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`}.`,
      priority: expired || daysLeft <= 2 ? 'high' : 'medium',
      evidence: [`cotización=${q.number}`, `estado=aprobada`, `vigencia=${q.validUntil}`, `lead=${l.status}`],
      since: q.decidedAt ?? q.createdAt,
    });
  }

  for (const l of leads) {
    if (l.status !== 'lost' || !l.lostReason || !PRICE_RE.test(l.lostReason)) continue;
    const lostOn = l.updatedAt.slice(0, 10);
    if (lostOn < addDays(today, -60)) continue;
    const newer = priceDocs.find((d) => d.organizationId === l.organizationId && d.status === 'active' && d.category === 'price_list' && d.validFrom > lostOn);
    if (!newer) continue;
    out.push({
      id: `react:${l.id}`,
      kind: 'price_reactivation',
      organizationId: l.organizationId,
      leadId: l.id,
      leadName: l.name,
      title: OPPORTUNITY_LABEL.price_reactivation,
      detail: `Se perdió por "${l.lostReason}" el ${lostOn}; desde el ${newer.validFrom} rige "${newer.title}".`,
      priority: 'low',
      evidence: [`motivo=${l.lostReason}`, `perdido=${lostOn}`, `lista=${newer.title}`],
      since: newer.validFrom,
    });
  }
  return out.sort((a, b) => RANK[a.priority] - RANK[b.priority] || (a.since < b.since ? -1 : 1));
}

// ───────────── Alertas de datos faltantes ─────────────

export type DataAlertKind = 'no_contact_channel' | 'missing_attribution' | 'unassigned_new' | 'stale_metrics' | 'ads_without_crm' | 'stale_quote_draft';

export interface DataAlert {
  kind: DataAlertKind;
  title: string;
  why: string;
  fix: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  samples: Array<{ id: string; label: string; organizationId: Lead['organizationId'] }>;
  target: 'lead' | 'campaign' | 'quote';
}

const ADS_SOURCE_RE = /meta|facebook|instagram|google|ads|tiktok/i;

export interface DataAlertInput {
  leads: readonly Lead[];
  quotes: readonly Quote[];
  campaigns: readonly Campaign[];
  metrics: readonly CampaignMetricsDaily[];
  now: Date;
}

export function detectDataAlerts({ leads, quotes, campaigns, metrics, now }: DataAlertInput): DataAlert[] {
  const today = now.toISOString().slice(0, 10);
  const alerts: DataAlert[] = [];
  const add = (a: Omit<DataAlert, 'count' | 'samples'>, items: Array<{ id: string; label: string; organizationId: Lead['organizationId'] }>) => {
    if (items.length) alerts.push({ ...a, count: items.length, samples: items.slice(0, 8) });
  };
  const leadItem = (l: Lead) => ({ id: l.id, label: l.name, organizationId: l.organizationId });

  add(
    { kind: 'no_contact_channel', title: 'Leads sin teléfono ni email', why: 'No se los puede contactar ni deduplicar.', fix: 'Completar teléfono (formato +549…) o email desde la ficha.', severity: 'high', target: 'lead' },
    leads.filter((l) => open(l) && !l.phoneE164 && !l.email).map(leadItem),
  );
  add(
    { kind: 'unassigned_new', title: 'Leads nuevos sin asesor hace más de 24 h', why: 'Nadie es responsable del primer contacto.', fix: 'Asignar asesor desde Leads.', severity: 'high', target: 'lead' },
    leads.filter((l) => l.status === 'new' && !l.advisorId && hoursSince(l.createdAt, now) >= 24).map(leadItem),
  );
  add(
    { kind: 'missing_attribution', title: 'Leads de pauta sin campaña', why: 'El origen dice Ads pero no tienen campaña: no cuentan en la conciliación ni en el CPL real.', fix: 'Completar la campaña al cargar o importar.', severity: 'medium', target: 'lead' },
    leads.filter((l) => !l.campaignId && ADS_SOURCE_RE.test(l.source)).map(leadItem),
  );

  const lastByCampaign = new Map<string, string>();
  for (const m of metrics) {
    const k = `${m.organizationId}|${m.campaignId}`;
    if ((lastByCampaign.get(k) ?? '') < m.date) lastByCampaign.set(k, m.date);
  }
  add(
    { kind: 'stale_metrics', title: 'Campañas activas con métricas desactualizadas', why: 'Sin datos de los últimos 3 días el diagnóstico mira el pasado.', fix: 'Importar el CSV reciente o sincronizar.', severity: 'medium', target: 'campaign' },
    campaigns
      .filter((c) => c.status === 'active')
      .filter((c) => (lastByCampaign.get(`${c.organizationId}|${c.id}`) ?? '') < addDays(today, -3))
      .map((c) => ({ id: c.id, label: `${c.name} (último dato ${lastByCampaign.get(`${c.organizationId}|${c.id}`) ?? 'nunca'})`, organizationId: c.organizationId })),
  );

  const from30 = addDays(today, -30);
  const adsLeads = new Map<string, number>();
  for (const m of metrics) if (m.date >= from30) adsLeads.set(`${m.organizationId}|${m.campaignId}`, (adsLeads.get(`${m.organizationId}|${m.campaignId}`) ?? 0) + m.platformLeads);
  const crmCampaigns = new Set(leads.filter((l) => l.campaignId && l.createdAt.slice(0, 10) >= from30).map((l) => `${l.organizationId}|${l.campaignId}`));
  add(
    { kind: 'ads_without_crm', title: 'Campañas con leads en Ads y ninguno en el CRM (30 días)', why: 'La captura no está llegando o no se atribuye.', fix: 'Revisar el destino del formulario/WhatsApp y cargar la campaña en cada lead.', severity: 'high', target: 'campaign' },
    campaigns
      .filter((c) => (adsLeads.get(`${c.organizationId}|${c.id}`) ?? 0) > 0 && !crmCampaigns.has(`${c.organizationId}|${c.id}`))
      .map((c) => ({ id: c.id, label: `${c.name} (${adsLeads.get(`${c.organizationId}|${c.id}`)} leads en Ads)`, organizationId: c.organizationId })),
  );
  add(
    { kind: 'stale_quote_draft', title: 'Cotizaciones en borrador hace más de 7 días', why: 'Quedan sin enviar a aprobación ni al cliente.', fix: 'Enviarlas a aprobación o descartarlas.', severity: 'low', target: 'quote' },
    quotes.filter((q) => q.status === 'draft' && hoursSince(q.createdAt, now) >= 7 * 24).map((q) => ({ id: q.id, label: `N.º ${q.number} · ${q.vehicle}`, organizationId: q.organizationId })),
  );
  return alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
}
