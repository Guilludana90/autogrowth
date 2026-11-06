import type { AppointmentEvent, ConsentEvent, ConversationMessage, KnowledgeArticle, OrganizationId, PartsRequest, ServiceAppointment } from '../domain/types';

/* Filas P4 (snake_case) y su conversión. */

export interface AppointmentRow {
  id: string;
  organization_id: OrganizationId;
  lead_id: string | null;
  customer_name: string;
  phone_e164: string | null;
  vehicle: string;
  plate: string | null;
  mileage: number | null;
  service_type: ServiceAppointment['serviceType'];
  scheduled_at: string;
  duration_min: number;
  bay: string;
  advisor_id: string | null;
  status: ServiceAppointment['status'];
  notes: string | null;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const toAppointment = (r: AppointmentRow): ServiceAppointment => ({
  id: r.id,
  organizationId: r.organization_id,
  leadId: r.lead_id ?? undefined,
  customerName: r.customer_name,
  phoneE164: r.phone_e164 ?? undefined,
  vehicle: r.vehicle,
  plate: r.plate ?? undefined,
  mileage: r.mileage ?? undefined,
  serviceType: r.service_type,
  scheduledAt: r.scheduled_at,
  durationMin: r.duration_min,
  bay: r.bay,
  advisorId: r.advisor_id ?? undefined,
  status: r.status,
  notes: r.notes ?? undefined,
  statusReason: r.status_reason ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface AppointmentEventRow {
  id: string;
  appointment_id: string;
  from_status: AppointmentEvent['fromStatus'] | null;
  to_status: AppointmentEvent['toStatus'];
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export const toAppointmentEvent = (r: AppointmentEventRow, names: Map<string, string>): AppointmentEvent => ({
  id: r.id,
  appointmentId: r.appointment_id,
  fromStatus: r.from_status ?? undefined,
  toStatus: r.to_status,
  actorName: r.actor_id ? names.get(r.actor_id) : undefined,
  reason: r.reason ?? undefined,
  createdAt: r.created_at,
});

export interface PartsRow {
  id: string;
  organization_id: OrganizationId;
  kind: PartsRequest['kind'];
  appointment_id: string | null;
  lead_id: string | null;
  customer_name: string;
  part_number: string | null;
  description: string;
  quantity: number;
  unit_price: string | number | null;
  currency: string;
  eta: string | null;
  status: PartsRequest['status'];
  status_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const toParts = (r: PartsRow): PartsRequest => ({
  id: r.id,
  organizationId: r.organization_id,
  kind: r.kind,
  appointmentId: r.appointment_id ?? undefined,
  leadId: r.lead_id ?? undefined,
  customerName: r.customer_name,
  partNumber: r.part_number ?? undefined,
  description: r.description,
  quantity: r.quantity,
  unitPrice: r.unit_price === null ? undefined : Number(r.unit_price),
  currency: r.currency,
  eta: r.eta ?? undefined,
  status: r.status,
  statusReason: r.status_reason ?? undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface KnowledgeRow {
  id: string;
  organization_id: OrganizationId;
  article_key: string;
  version: number;
  title: string;
  body: string;
  language: KnowledgeArticle['language'];
  category: KnowledgeArticle['category'];
  model: string | null;
  valid_from: string;
  valid_to: string | null;
  status: KnowledgeArticle['status'];
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  review_note: string | null;
  created_at: string;
}

export const toKnowledge = (r: KnowledgeRow, names: Map<string, string>): KnowledgeArticle => ({
  id: r.id,
  organizationId: r.organization_id,
  articleKey: r.article_key,
  version: r.version,
  title: r.title,
  body: r.body,
  language: r.language,
  category: r.category,
  model: r.model ?? undefined,
  validFrom: r.valid_from,
  validTo: r.valid_to ?? undefined,
  status: r.status,
  createdBy: r.created_by,
  createdByName: names.get(r.created_by),
  approvedByName: r.approved_by ? names.get(r.approved_by) : undefined,
  approvedAt: r.approved_at ?? undefined,
  reviewNote: r.review_note ?? undefined,
  createdAt: r.created_at,
});

export interface ConsentRow {
  id: string;
  organization_id: OrganizationId;
  lead_id: string;
  channel: ConsentEvent['channel'];
  granted: boolean;
  source: string;
  evidence: string | null;
  actor_id: string;
  created_at: string;
}

export const toConsent = (r: ConsentRow, names: Map<string, string>): ConsentEvent => ({
  id: r.id,
  organizationId: r.organization_id,
  leadId: r.lead_id,
  channel: r.channel,
  granted: r.granted,
  source: r.source,
  evidence: r.evidence ?? undefined,
  actorName: names.get(r.actor_id),
  createdAt: r.created_at,
});

export interface MessageRow {
  id: string;
  organization_id: OrganizationId;
  lead_id: string;
  channel: ConversationMessage['channel'];
  direction: ConversationMessage['direction'];
  body: string;
  occurred_at: string;
  logged_by: string;
  created_at: string;
}

export const toMessage = (r: MessageRow, names: Map<string, string>): ConversationMessage => ({
  id: r.id,
  organizationId: r.organization_id,
  leadId: r.lead_id,
  channel: r.channel,
  direction: r.direction,
  body: r.body,
  occurredAt: r.occurred_at,
  loggedByName: names.get(r.logged_by),
  createdAt: r.created_at,
});
