import { addDays } from '../domain/dates';
import type { AppointmentEvent, ConsentEvent, ConversationMessage, KnowledgeArticle, Lead, PartsRequest, ServiceAppointment } from '../domain/types';

/** Postventa, conocimiento e inbox de ejemplo. Todo ficticio; los precios son orientativos de demo. */

export const DEMO_BAYS = ['Box 1', 'Box 2', 'Elevador 1', 'Lavadero'] as const;

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`).toISOString();

export function demoAppointments(today: string, leads: readonly Lead[]): { appointments: ServiceAppointment[]; events: AppointmentEvent[] } {
  const c = leads.filter((l) => l.organizationId === 'cardys_fiat' && l.status === 'won');
  const o = leads.filter((l) => l.organizationId === 'overland_motors' && l.status === 'won');
  const base = (id: string, over: Partial<ServiceAppointment>): ServiceAppointment => ({
    id,
    organizationId: 'cardys_fiat',
    customerName: 'Cliente demo',
    vehicle: 'Fiat Cronos Drive 1.3',
    serviceType: 'maintenance',
    scheduledAt: at(addDays(today, 1), '09:00'),
    durationMin: 90,
    bay: 'Box 1',
    status: 'scheduled',
    createdAt: at(addDays(today, -3), '10:00'),
    updatedAt: at(addDays(today, -3), '10:00'),
    ...over,
  });
  const appointments: ServiceAppointment[] = [
    base('svc-1', { leadId: c[0]?.id, customerName: c[0]?.name ?? 'Cliente demo', phoneE164: c[0]?.phoneE164, plate: 'AF482KD', mileage: 9800, scheduledAt: at(today, '08:30'), status: 'in_progress', advisorId: 'ps-cardys' }),
    base('svc-2', { customerName: 'Rocío Gómez', vehicle: 'Fiat Pulse Impetus', plate: 'AE119TR', mileage: 20150, scheduledAt: at(today, '10:00'), bay: 'Box 2', status: 'checked_in', serviceType: 'repair', notes: 'Ruido en tren delantero' }),
    base('svc-3', { customerName: 'Hernán Paz', vehicle: 'Fiat Strada Volcano', plate: 'AD301LM', scheduledAt: at(today, '15:00'), bay: 'Elevador 1', status: 'confirmed', serviceType: 'warranty' }),
    base('svc-4', { leadId: c[1]?.id, customerName: c[1]?.name ?? 'Cliente demo', vehicle: 'Fiat Argo Drive', plate: 'AG777PZ', scheduledAt: at(addDays(today, 1), '09:00'), status: 'scheduled' }),
    base('svc-5', { customerName: 'Marina Ledesma', vehicle: 'Fiat Cronos Precision', scheduledAt: at(addDays(today, -1), '11:00'), status: 'no_show', statusReason: 'No atendió dos llamados' }),
    base('svc-6', { customerName: 'Gustavo Ibarra', vehicle: 'Fiat Toro Freedom', plate: 'AC555XY', scheduledAt: at(addDays(today, -1), '09:00'), status: 'delivered', bay: 'Box 2' }),
    base('svc-7', { organizationId: 'overland_motors', leadId: o[0]?.id, customerName: o[0]?.name ?? 'Cliente demo', vehicle: 'Jeep Compass Limited', plate: 'AF900QS', mileage: 15000, scheduledAt: at(today, '09:30'), status: 'ready', advisorId: 'ps-overland' }),
    base('svc-8', { organizationId: 'overland_motors', customerName: 'Pablo Sosa', vehicle: 'RAM 1500 Laramie', plate: 'AE321RA', scheduledAt: at(addDays(today, 2), '10:00'), bay: 'Elevador 1', serviceType: 'recall' }),
  ];
  const flow: Record<ServiceAppointment['status'], ServiceAppointment['status'][]> = {
    scheduled: ['scheduled'],
    confirmed: ['scheduled', 'confirmed'],
    checked_in: ['scheduled', 'confirmed', 'checked_in'],
    in_progress: ['scheduled', 'confirmed', 'checked_in', 'in_progress'],
    ready: ['scheduled', 'confirmed', 'checked_in', 'in_progress', 'ready'],
    delivered: ['scheduled', 'confirmed', 'checked_in', 'in_progress', 'ready', 'delivered'],
    cancelled: ['scheduled', 'cancelled'],
    no_show: ['scheduled', 'confirmed', 'no_show'],
  };
  const events: AppointmentEvent[] = appointments.flatMap((a) =>
    flow[a.status].map((s, i, arr) => ({
      id: `${a.id}-ev-${i}`,
      appointmentId: a.id,
      fromStatus: i ? arr[i - 1] : undefined,
      toStatus: s,
      actorName: a.organizationId === 'cardys_fiat' ? 'Taller Cardys (demo)' : 'Taller Overland (demo)',
      reason: s === a.status ? a.statusReason : undefined,
      createdAt: new Date(Date.parse(a.createdAt) + i * 3_600_000).toISOString(),
    })),
  );
  return { appointments, events };
}

export function demoParts(today: string): PartsRequest[] {
  const p = (id: string, over: Partial<PartsRequest>): PartsRequest => ({
    id,
    organizationId: 'cardys_fiat',
    kind: 'part',
    customerName: 'Cliente demo',
    description: 'Repuesto',
    quantity: 1,
    currency: 'ARS',
    status: 'requested',
    createdAt: at(addDays(today, -4), '10:00'),
    updatedAt: at(addDays(today, -4), '10:00'),
    ...over,
  });
  return [
    p('prt-1', { appointmentId: 'svc-2', customerName: 'Rocío Gómez', partNumber: '52046328', description: 'Bieleta de suspensión delantera', quantity: 2, unitPrice: 48_500, status: 'ordered', eta: addDays(today, -1) }),
    p('prt-2', { customerName: 'Hernán Paz', kind: 'accessory', description: 'Lona marítima para caja', unitPrice: 310_000, status: 'quoted' }),
    p('prt-3', { appointmentId: 'svc-1', customerName: 'Cliente de service', partNumber: '55282942', description: 'Filtro de aceite', quantity: 1, unitPrice: 18_900, status: 'received' }),
    p('prt-4', { customerName: 'Mostrador', kind: 'accessory', description: 'Alfombras de goma Cronos', quantity: 1, status: 'requested' }),
    p('prt-5', { organizationId: 'overland_motors', customerName: 'Pablo Sosa', partNumber: '68312345AA', description: 'Kit de actualización por recall', quantity: 1, status: 'ordered', eta: addDays(today, 5) }),
  ];
}

export function demoKnowledge(today: string): KnowledgeArticle[] {
  const k = (id: string, over: Partial<KnowledgeArticle>): KnowledgeArticle => ({
    id,
    organizationId: 'cardys_fiat',
    articleKey: 'x',
    version: 1,
    title: '',
    body: '',
    language: 'es',
    category: 'postventa',
    validFrom: addDays(today, -60),
    status: 'published',
    createdBy: 'ps-cardys',
    createdByName: 'Taller Cardys (demo)',
    approvedByName: 'Gerencia Cardys (demo)',
    approvedAt: at(addDays(today, -59), '12:00'),
    createdAt: at(addDays(today, -60), '12:00'),
    ...over,
  });
  return [
    k('kb-1', {
      articleKey: 'service-10000',
      title: 'Service de 10.000 km: qué incluye',
      body: 'Cambio de aceite y filtro, control de niveles, frenos y neumáticos, escaneo de fallas. Duración estimada: 90 minutos. Pedir turno con 48 h de anticipación. Valores de ejemplo para la demo: consultar la lista vigente antes de informar un precio.',
      model: 'Cronos / Argo / Pulse',
    }),
    k('kb-2', {
      articleKey: 'garantia-fabrica',
      title: 'Garantía de fábrica: condiciones generales',
      body: 'La garantía se mantiene si los services se hacen en la red oficial en los kilometrajes indicados en el manual. Ante una consulta puntual, derivar a postventa con la patente y el kilometraje.',
      category: 'garantia',
    }),
    k('kb-3', {
      articleKey: 'objecion-cuota',
      title: 'Objeción: "la cuota es muy alta"',
      body: 'Preguntar cuánto puede pagar por mes y con qué anticipo. Comparar plazos en el cotizador y aclarar la diferencia entre cuota ilustrativa y contractual. No prometer tasas que no estén en la lista vigente.',
      category: 'objeciones',
      createdBy: 'mgr-cardys',
      createdByName: 'Gerencia Cardys (demo)',
      approvedByName: 'Usuario demo',
    }),
    k('kb-4', {
      articleKey: 'service-10000',
      version: 2,
      title: 'Service de 10.000 km: qué incluye',
      body: 'Cambio de aceite y filtro, control de niveles, frenos y neumáticos, escaneo de fallas y actualización de software si corresponde. Duración estimada: 2 horas. Pedir turno con 48 h de anticipación.',
      model: 'Cronos / Argo / Pulse',
      status: 'in_review',
      approvedByName: undefined,
      approvedAt: undefined,
      createdAt: at(addDays(today, -1), '12:00'),
    }),
    k('kb-5', {
      organizationId: 'overland_motors',
      articleKey: 'recall-ram',
      title: 'Campaña de seguridad RAM 1500',
      body: 'Verificar por VIN si la unidad está alcanzada. La actualización es sin cargo y demora 1 hora. Agendar como "Campaña de seguridad (recall)".',
      category: 'garantia',
      model: 'RAM 1500',
      createdBy: 'ps-overland',
      createdByName: 'Taller Overland (demo)',
      approvedByName: 'Gerencia Overland (demo)',
    }),
  ];
}

export function demoInbox(today: string, leads: readonly Lead[]): { consents: ConsentEvent[]; messages: ConversationMessage[] } {
  const pick = (org: Lead['organizationId'], n: number) => leads.filter((l) => l.organizationId === org && l.status !== 'lost').slice(0, n);
  const [a, b, c] = pick('cardys_fiat', 3);
  const [d] = pick('overland_motors', 1);
  const consents: ConsentEvent[] = [];
  const messages: ConversationMessage[] = [];
  const ts = (dayOffset: number, hhmm: string) => at(addDays(today, dayOffset), hhmm);
  let n = 0;
  const m = (l: Lead | undefined, channel: ConversationMessage['channel'], direction: 'in' | 'out', body: string, occurredAt: string) => {
    if (l) messages.push({ id: `msg-${++n}`, organizationId: l.organizationId, leadId: l.id, channel, direction, body, occurredAt, loggedByName: 'Usuario demo', createdAt: occurredAt });
  };
  if (a) {
    consents.push({ id: 'cons-1', organizationId: a.organizationId, leadId: a.id, channel: 'whatsapp', granted: true, source: 'Formulario de Meta Ads', evidence: 'Casilla de consentimiento marcada', actorName: 'Usuario demo', createdAt: ts(-3, '10:00') });
    m(a, 'whatsapp', 'in', '¿Tienen el Cronos con entrega inmediata?', ts(-2, '10:05'));
    m(a, 'whatsapp', 'out', 'Sí, te paso las versiones disponibles y la cuota orientativa.', ts(-2, '10:25'));
    m(a, 'whatsapp', 'in', '¿Puedo ir el sábado a verlo?', ts(0, '08:40'));
  }
  if (b) {
    m(b, 'instagram', 'in', 'Precio del Pulse?', ts(-1, '19:10'));
    m(b, 'instagram', 'out', 'Hola! Te dejo el link para cotizar y te llamamos.', ts(-1, '19:40'));
  }
  if (c) {
    consents.push({ id: 'cons-2', organizationId: c.organizationId, leadId: c.id, channel: 'whatsapp', granted: true, source: 'Verbal en salón', actorName: 'Usuario demo', createdAt: ts(-10, '12:00') });
    consents.push({ id: 'cons-3', organizationId: c.organizationId, leadId: c.id, channel: 'whatsapp', granted: false, source: 'Pidió no recibir más mensajes', actorName: 'Usuario demo', createdAt: ts(-2, '12:00') });
    m(c, 'phone', 'in', 'Llamó para preguntar por usados.', ts(-1, '11:00'));
  }
  if (d) m(d, 'whatsapp', 'in', 'Quiero turno para el service de la Compass.', ts(0, '09:15'));
  return { consents, messages };
}
