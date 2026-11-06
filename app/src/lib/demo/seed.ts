import { addDays, parseDay } from '../domain/dates';
import { normalizeArPhone } from '../domain/phone';
import { scoreLead } from '../domain/scoring';
import type { Advisor, Campaign, CampaignMetricsDaily, Lead, LeadStatus, OrganizationId } from '../domain/types';

/**
 * Datos 100% ficticios para DEMO_MODE. Se generan de forma determinista respecto de "hoy" para que todos
 * los rangos tengan datos. No son métricas reales de Cardys ni de Overland.
 */

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export const DEMO_ADVISORS: Advisor[] = [
  { id: 'adv-lucia', name: 'Lucía Torres', organizationId: 'cardys_fiat' },
  { id: 'adv-federico', name: 'Federico Ruiz', organizationId: 'cardys_fiat' },
  { id: 'adv-martin', name: 'Martín Díaz', organizationId: 'overland_motors' },
  { id: 'adv-sol', name: 'Sol Benítez', organizationId: 'overland_motors' },
];

export const DEMO_CAMPAIGNS: Campaign[] = [
  { id: 'meta-cronos-fin', organizationId: 'cardys_fiat', platform: 'meta', name: 'Cronos · Financiación', objective: 'OUTCOME_LEADS', status: 'active', currency: 'ARS' },
  { id: 'meta-pda', organizationId: 'cardys_fiat', platform: 'meta', name: 'Plan de Ahorro · Secuencia', objective: 'OUTCOME_LEADS', status: 'active', currency: 'ARS' },
  { id: 'google-strada', organizationId: 'cardys_fiat', platform: 'google', name: 'Strada · Search', objective: 'LEAD_GENERATION', status: 'active', currency: 'ARS' },
  { id: 'meta-cardys-feb', organizationId: 'cardys_fiat', platform: 'meta', name: 'Cardys · Leads Febrero', objective: 'LEAD_GENERATION', status: 'paused', currency: 'ARS' },
  { id: 'meta-compass', organizationId: 'overland_motors', platform: 'meta', name: 'Compass · Test drive', objective: 'OUTCOME_LEADS', status: 'active', currency: 'ARS' },
  { id: 'google-rampage', organizationId: 'overland_motors', platform: 'google', name: 'RAM Rampage · Search', objective: 'LEAD_GENERATION', status: 'active', currency: 'ARS' },
];

/** Perfil ficticio por campaña: inversión diaria, CTR, conversión clic→lead, captura en CRM y tasa de contacto. */
const PROFILE: Record<string, { spend: number; ctr: number; cvr: number; capture: number; contact: number }> = {
  'meta-cronos-fin': { spend: 42000, ctr: 2.2, cvr: 0.0045, capture: 0.9, contact: 0.8 },
  'meta-pda': { spend: 31000, ctr: 1.6, cvr: 0.004, capture: 0.45, contact: 0.7 },
  'google-strada': { spend: 26000, ctr: 3.4, cvr: 0.004, capture: 0.85, contact: 0.75 },
  'meta-compass': { spend: 38000, ctr: 1.9, cvr: 0.004, capture: 0.85, contact: 0.35 },
  'google-rampage': { spend: 24000, ctr: 3.1, cvr: 0.0035, capture: 0.7, contact: 0.7 },
};

export function demoMetrics(today: string, days = 120): CampaignMetricsDaily[] {
  const rnd = prng(42);
  const rows: CampaignMetricsDaily[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    for (const c of DEMO_CAMPAIGNS) {
      const p = PROFILE[c.id];
      if (!p || c.status !== 'active') continue;
      const spend = Math.round(p.spend * (0.7 + rnd() * 0.6));
      const cpm = 1800 + rnd() * 900;
      const impressions = Math.round((spend / cpm) * 1000);
      const clicks = Math.round((impressions * p.ctr * (0.8 + rnd() * 0.4)) / 100);
      const platformLeads = Math.round(clicks * p.cvr * (0.5 + rnd()));
      rows.push({ organizationId: c.organizationId, platform: c.platform, campaignId: c.id, date, currency: c.currency, spend, impressions, clicks, platformLeads });
    }
  }
  return rows;
}

const FIRST = ['María', 'Juan', 'Sofía', 'Carlos', 'Valentina', 'Pedro', 'Camila', 'Lucas', 'Julieta', 'Diego', 'Martina', 'Nicolás', 'Paula', 'Tomás', 'Agustina', 'Facundo'];
const LAST = ['González', 'Pérez', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Sosa', 'Romero', 'Álvarez', 'Benítez', 'Acosta', 'Medina'];
const MODELS = {
  cardys_fiat: ['Fiat Cronos', 'Fiat Pulse', 'Fiat Strada', 'Fiat Toro', 'Fiat Fastback', 'Fiat Mobi'],
  overland_motors: ['Jeep Compass', 'Jeep Renegade', 'Jeep Commander', 'RAM Rampage', 'RAM Dakota'],
} as const;
const AREA = { cardys_fiat: '2392', overland_motors: '2926' } as const;

/**
 * Leads del CRM derivados de las métricas: cada lead de plataforma llega al CRM según la tasa de captura de su
 * campaña (para que se vea la fuga Ads → CRM), más leads orgánicos (WhatsApp, salón, referidos).
 */
export function demoLeads(today: string, metrics: readonly CampaignMetricsDaily[] = demoMetrics(today)): Lead[] {
  const rnd = prng(7);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const leads: Lead[] = [];

  const make = (org: OrganizationId, date: string, campaign: Campaign | undefined, contactRate: number) => {
    const i = leads.length;
    const source = campaign ? (campaign.platform === 'meta' ? 'Meta Ads' : 'Google Ads') : pick(['WhatsApp', 'Referido', 'Salón', 'CSV Tecnom']);
    const ageDays = Math.round((parseDay(today).getTime() - parseDay(date).getTime()) / 86_400_000);
    const createdAt = `${date}T${String(9 + Math.floor(rnd() * 10)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000Z`;
    let status: LeadStatus = 'new';
    if (rnd() < contactRate && ageDays >= 1) {
      const r = rnd();
      status = ageDays < 3 || r < 0.45 ? 'contacted' : r < 0.7 ? 'negotiation' : r < 0.85 ? 'won' : 'lost';
    }
    const advisors = DEMO_ADVISORS.filter((a) => a.organizationId === org);
    const hasAdvisor = status !== 'new' || rnd() < 0.4;
    const phoneE164 = rnd() < 0.94 ? normalizeArPhone(`${AREA[org]} ${Math.floor(400000 + rnd() * 599999)}`) : undefined;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const email =
      rnd() < 0.5 || !phoneE164
        ? `${name.split(' ')[0]!.toLowerCase()}.${i}@ejemplo.com`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : undefined;
    const modelInterest = rnd() < 0.9 ? pick(MODELS[org]) : undefined;
    const base = { phoneE164, email, modelInterest, source, campaignId: campaign?.id };
    const { score, reason } = scoreLead(base);
    leads.push({
      id: `demo-${i + 1}`,
      organizationId: org,
      name,
      ...base,
      score,
      scoreReason: reason,
      status,
      lostReason: status === 'lost' ? pick(['Precio', 'Compró en otro concesionario', 'Sin financiación aprobada', 'No responde']) : undefined,
      advisorId: hasAdvisor ? pick(advisors).id : undefined,
      createdAt,
      updatedAt: createdAt,
    });
  };

  for (const m of metrics) {
    const campaign = DEMO_CAMPAIGNS.find((c) => c.id === m.campaignId)!;
    const p = PROFILE[m.campaignId]!;
    for (let k = 0; k < m.platformLeads; k++) if (rnd() < p.capture) make(m.organizationId, m.date, campaign, p.contact);
  }
  const days = [...new Set(metrics.map((m) => m.date))];
  for (const date of days) {
    for (const org of ['cardys_fiat', 'overland_motors'] as const) if (rnd() < 0.45) make(org, date, undefined, 0.75);
  }
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
