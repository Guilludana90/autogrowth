import type {
  AppointmentStatus,
  Channel,
  ConsentChannel,
  ConsentEvent,
  ConversationMessage,
  KnowledgeArticle,
  KnowledgeStatus,
  PartsRequest,
  PartsStatus,
  Role,
  ServiceAppointment,
} from './types';

/**
 * Reglas de postventa, base de conocimiento, consentimiento e inbox. Son espejo de las funciones
 * de 0006_postventa_inbox.sql: la UI las usa para habilitar acciones, la base las vuelve a validar.
 */

// ───────────── Turnos de taller ─────────────

export type AppointmentAction = 'confirm' | 'check_in' | 'start' | 'ready' | 'deliver' | 'cancel' | 'no_show';

const APPT_NEXT: Record<AppointmentAction, { from: readonly AppointmentStatus[]; to: AppointmentStatus }> = {
  confirm: { from: ['scheduled'], to: 'confirmed' },
  check_in: { from: ['scheduled', 'confirmed'], to: 'checked_in' },
  start: { from: ['checked_in'], to: 'in_progress' },
  ready: { from: ['in_progress'], to: 'ready' },
  deliver: { from: ['ready'], to: 'delivered' },
  cancel: { from: ['scheduled', 'confirmed', 'checked_in'], to: 'cancelled' },
  no_show: { from: ['scheduled', 'confirmed'], to: 'no_show' },
};

export const APPOINTMENT_ACTION_LABEL: Record<AppointmentAction, string> = {
  confirm: 'Confirmar',
  check_in: 'Recibir vehículo',
  start: 'Pasar a taller',
  ready: 'Marcar listo',
  deliver: 'Entregar',
  cancel: 'Cancelar',
  no_show: 'No se presentó',
};

export const APPOINTMENT_NEEDS_REASON: ReadonlySet<AppointmentAction> = new Set(['cancel', 'no_show']);
export const SERVICE_ROLES: readonly Role[] = ['super_admin', 'dealership_admin', 'post_sales'];

export function appointmentActions(a: Pick<ServiceAppointment, 'status' | 'scheduledAt'>, now: Date): AppointmentAction[] {
  return (Object.keys(APPT_NEXT) as AppointmentAction[]).filter((k) => {
    if (!APPT_NEXT[k].from.includes(a.status)) return false;
    // "No se presentó" solo después de la hora del turno.
    if (k === 'no_show') return Date.parse(a.scheduledAt) <= now.getTime();
    return true;
  });
}

export function nextAppointmentStatus(action: AppointmentAction): AppointmentStatus {
  return APPT_NEXT[action].to;
}

/** Patente argentina: AAA123 (anterior) o AA123BB (Mercosur). Devuelve normalizada o undefined. */
export function normalizePlate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const p = raw.toUpperCase().replace(/[\s.-]/g, '');
  return /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(p) ? p : undefined;
}

export const BLOCKING: readonly AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];

/** Turnos del mismo box que se superponen en horario (los cancelados, ausentes, listos y entregados no ocupan lugar). */
export function findConflicts(
  candidate: Pick<ServiceAppointment, 'organizationId' | 'bay' | 'scheduledAt' | 'durationMin'> & { id?: string },
  all: readonly ServiceAppointment[],
): ServiceAppointment[] {
  const start = Date.parse(candidate.scheduledAt);
  const end = start + candidate.durationMin * 60_000;
  const bay = candidate.bay.trim().toLowerCase();
  return all.filter((a) => {
    if (a.id === candidate.id || a.organizationId !== candidate.organizationId || !BLOCKING.includes(a.status)) return false;
    if (a.bay.trim().toLowerCase() !== bay) return false;
    const s = Date.parse(a.scheduledAt);
    return s < end && start < s + a.durationMin * 60_000;
  });
}

export interface AppointmentDraft {
  customerName: string;
  vehicle: string;
  plate?: string;
  mileage?: number;
  bay: string;
  scheduledAt: string;
  durationMin: number;
}

/** Errores de validación de un turno nuevo, en el orden en que se muestran. */
export function validateAppointment(d: AppointmentDraft, now: Date): string[] {
  const errors: string[] = [];
  if (d.customerName.trim().length < 2) errors.push('Indicá el nombre del cliente.');
  if (d.vehicle.trim().length < 2) errors.push('Indicá el vehículo (modelo y versión).');
  if (d.plate && !normalizePlate(d.plate)) errors.push('La patente no tiene formato válido (AAA123 o AA123BB).');
  if (d.mileage !== undefined && (!Number.isFinite(d.mileage) || d.mileage < 0 || d.mileage > 2_000_000)) errors.push('Kilometraje inválido.');
  if (!d.bay.trim()) errors.push('Elegí el box o puesto de taller.');
  if (!Number.isFinite(Date.parse(d.scheduledAt))) errors.push('Fecha u hora inválida.');
  else if (Date.parse(d.scheduledAt) < now.getTime() - 5 * 60_000) errors.push('El turno no puede quedar en el pasado.');
  if (!Number.isInteger(d.durationMin) || d.durationMin < 15 || d.durationMin > 600) errors.push('La duración tiene que estar entre 15 y 600 minutos.');
  return errors;
}

/** Recordatorio = tarea interna 24 h antes (o ya, si falta menos). Nunca se envía un mensaje al cliente. */
export function reminderTask(a: Pick<ServiceAppointment, 'scheduledAt' | 'vehicle' | 'plate' | 'customerName'>, now: Date) {
  const due = new Date(Math.max(now.getTime(), Date.parse(a.scheduledAt) - 24 * 3_600_000));
  const when = new Date(a.scheduledAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
  return {
    title: `Confirmar turno de ${a.customerName} (${a.plate ?? a.vehicle}) del ${when}`,
    dueAt: due.toISOString(),
  };
}

// ───────────── Repuestos y accesorios ─────────────

export type PartsAction = 'quote' | 'order' | 'receive' | 'deliver' | 'cancel';
const PARTS_NEXT: Record<PartsAction, { from: readonly PartsStatus[]; to: PartsStatus }> = {
  quote: { from: ['requested'], to: 'quoted' },
  order: { from: ['requested', 'quoted'], to: 'ordered' },
  receive: { from: ['ordered'], to: 'received' },
  deliver: { from: ['received'], to: 'delivered' },
  cancel: { from: ['requested', 'quoted', 'ordered'], to: 'cancelled' },
};
export const PARTS_ACTION_LABEL: Record<PartsAction, string> = {
  quote: 'Cotizar',
  order: 'Pedir',
  receive: 'Recibir',
  deliver: 'Entregar',
  cancel: 'Cancelar',
};

export function partsActions(p: Pick<PartsRequest, 'status'>): PartsAction[] {
  return (Object.keys(PARTS_NEXT) as PartsAction[]).filter((k) => PARTS_NEXT[k].from.includes(p.status));
}
export const nextPartsStatus = (a: PartsAction): PartsStatus => PARTS_NEXT[a].to;

/** Datos que exige cada paso: precio para cotizar, motivo para cancelar, fecha estimada coherente. */
export function validatePartsStep(action: PartsAction, input: { unitPrice?: number; eta?: string; reason?: string }, today: string): string | undefined {
  if (action === 'quote' && !(input.unitPrice !== undefined && input.unitPrice > 0)) return 'Para cotizar hace falta un precio unitario mayor a 0.';
  if (action === 'order' && input.eta && input.eta < today) return 'La fecha estimada de llegada no puede ser pasada.';
  if (action === 'cancel' && !input.reason?.trim()) return 'Indicá el motivo de la cancelación.';
  return undefined;
}

export const isPartsOverdue = (p: Pick<PartsRequest, 'status' | 'eta'>, today: string) => p.status === 'ordered' && !!p.eta && p.eta < today;

// ───────────── Base de conocimiento ─────────────

export type KnowledgeAction = 'submit' | 'approve' | 'reject' | 'archive';
export const KNOWLEDGE_EDITORS: readonly Role[] = ['super_admin', 'dealership_admin', 'post_sales'];
export const KNOWLEDGE_APPROVERS: readonly Role[] = ['super_admin', 'dealership_admin'];
export const KNOWLEDGE_ACTION_LABEL: Record<KnowledgeAction, string> = {
  submit: 'Enviar a revisión',
  approve: 'Aprobar y publicar',
  reject: 'Devolver con comentarios',
  archive: 'Archivar',
};

/** Espejo de knowledge_transition(): nadie aprueba lo que escribió. */
export function canKnowledge(action: KnowledgeAction, status: KnowledgeStatus, role: Role | undefined, isAuthor: boolean): boolean {
  if (!role) return false;
  switch (action) {
    case 'submit':
      return status === 'draft' && isAuthor && KNOWLEDGE_EDITORS.includes(role);
    case 'approve':
    case 'reject':
      return status === 'in_review' && !isAuthor && KNOWLEDGE_APPROVERS.includes(role);
    case 'archive':
      return status === 'published' && KNOWLEDGE_APPROVERS.includes(role);
  }
}

export function nextKnowledgeStatus(a: KnowledgeAction): KnowledgeStatus {
  return ({ submit: 'in_review', approve: 'published', reject: 'draft', archive: 'archived' } as const)[a];
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const isArticleCurrent = (a: Pick<KnowledgeArticle, 'status' | 'validFrom' | 'validTo'>, today: string) =>
  a.status === 'published' && a.validFrom <= today && (!a.validTo || a.validTo >= today);

/** Búsqueda sin acentos sobre título, cuerpo y modelo. El título pesa más; todas las palabras tienen que aparecer. */
export function searchKnowledge(articles: readonly KnowledgeArticle[], query: string): KnowledgeArticle[] {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [...articles];
  return articles
    .map((a) => {
      const title = fold(a.title);
      const rest = fold(`${a.body} ${a.model ?? ''}`);
      if (!words.every((w) => title.includes(w) || rest.includes(w))) return null;
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (rest.split(w).length - 1), 0);
      return { a, score };
    })
    .filter((x): x is { a: KnowledgeArticle; score: number } => !!x)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

export function nextArticleVersion(articles: readonly Pick<KnowledgeArticle, 'articleKey' | 'version'>[], key: string): number {
  return Math.max(0, ...articles.filter((a) => a.articleKey === key).map((a) => a.version)) + 1;
}

// ───────────── Consentimiento e inbox ─────────────

export function currentConsent(events: readonly ConsentEvent[], leadId: string, channel: ConsentChannel): ConsentEvent | undefined {
  return events.filter((e) => e.leadId === leadId && e.channel === channel).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export const WINDOW_24H = 24 * 3_600_000;

/**
 * ¿Se puede registrar un mensaje saliente por este canal? WhatsApp y email exigen consentimiento vigente;
 * Instagram y Messenger solo como respuesta dentro de las 24 h del último mensaje del cliente.
 * Teléfono y en persona se registran sin restricción. Nada de esto envía mensajes: solo deja constancia.
 */
export function outboundCheck(
  channel: Channel,
  leadId: string,
  consents: readonly ConsentEvent[],
  messages: readonly ConversationMessage[],
  at: Date,
): { ok: true } | { ok: false; reason: string } {
  if (channel === 'whatsapp' || channel === 'email') {
    const c = currentConsent(consents, leadId, channel);
    if (!c) return { ok: false, reason: `No hay consentimiento registrado para ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}.` };
    if (!c.granted) return { ok: false, reason: `El cliente revocó el consentimiento para ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}.` };
    return { ok: true };
  }
  if (channel === 'instagram' || channel === 'messenger') {
    const lastIn = messages
      .filter((m) => m.leadId === leadId && m.channel === channel && m.direction === 'in' && Date.parse(m.occurredAt) <= at.getTime())
      .map((m) => Date.parse(m.occurredAt))
      .sort((a, b) => b - a)[0];
    if (lastIn === undefined || at.getTime() - lastIn > WINDOW_24H) return { ok: false, reason: 'Solo se responde dentro de las 24 h del último mensaje del cliente en ese canal.' };
  }
  return { ok: true };
}

export interface InboxThread {
  leadId: string;
  organizationId: ConversationMessage['organizationId'];
  last: ConversationMessage;
  count: number;
  channels: Channel[];
  /** El último mensaje es del cliente y no tiene respuesta registrada. */
  awaitingReply: boolean;
  waitingMinutes?: number;
}

export function inboxThreads(messages: readonly ConversationMessage[], now: Date): InboxThread[] {
  const byLead = new Map<string, ConversationMessage[]>();
  for (const m of messages) byLead.set(m.leadId, [...(byLead.get(m.leadId) ?? []), m]);
  return [...byLead.entries()]
    .map(([leadId, ms]) => {
      const sorted = [...ms].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const last = sorted[sorted.length - 1]!;
      const awaitingReply = last.direction === 'in';
      return {
        leadId,
        organizationId: last.organizationId,
        last,
        count: sorted.length,
        channels: [...new Set(sorted.map((m) => m.channel))],
        awaitingReply,
        waitingMinutes: awaitingReply ? Math.max(0, Math.round((now.getTime() - Date.parse(last.occurredAt)) / 60_000)) : undefined,
      };
    })
    .sort((a, b) => Number(b.awaitingReply) - Number(a.awaitingReply) || b.last.occurredAt.localeCompare(a.last.occurredAt));
}

/** Mediana de minutos entre un mensaje entrante y la primera respuesta registrada. null si no hay pares. */
export function medianResponseMinutes(messages: readonly ConversationMessage[]): number | null {
  const byLead = new Map<string, ConversationMessage[]>();
  for (const m of messages) byLead.set(m.leadId, [...(byLead.get(m.leadId) ?? []), m]);
  const waits: number[] = [];
  for (const ms of byLead.values()) {
    const sorted = [...ms].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    let pendingIn: number | undefined;
    for (const m of sorted) {
      if (m.direction === 'in') pendingIn ??= Date.parse(m.occurredAt);
      else if (pendingIn !== undefined) {
        waits.push((Date.parse(m.occurredAt) - pendingIn) / 60_000);
        pendingIn = undefined;
      }
    }
  }
  if (!waits.length) return null;
  waits.sort((a, b) => a - b);
  const mid = Math.floor(waits.length / 2);
  return waits.length % 2 ? waits[mid]! : (waits[mid - 1]! + waits[mid]!) / 2;
}
