import { describe, expect, it } from 'vitest';
import {
  appointmentActions,
  canKnowledge,
  currentConsent,
  findConflicts,
  inboxThreads,
  isArticleCurrent,
  isPartsOverdue,
  medianResponseMinutes,
  nextArticleVersion,
  normalizePlate,
  outboundCheck,
  partsActions,
  reminderTask,
  searchKnowledge,
  validateAppointment,
  validatePartsStep,
} from '@/lib/domain/postventa';
import type { ConsentEvent, ConversationMessage, KnowledgeArticle, ServiceAppointment } from '@/lib/domain/types';

const now = new Date('2026-11-06T12:00:00Z');
const appt = (over: Partial<ServiceAppointment>): ServiceAppointment => ({
  id: Math.random().toString(36).slice(2),
  organizationId: 'cardys_fiat',
  customerName: 'Cliente',
  vehicle: 'Fiat Cronos',
  serviceType: 'maintenance',
  scheduledAt: '2026-11-10T12:00:00Z',
  durationMin: 60,
  bay: 'Box 1',
  status: 'scheduled',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('turnos de taller', () => {
  it('normaliza patentes argentinas', () => {
    expect(normalizePlate('ab 123 cd')).toBe('AB123CD');
    expect(normalizePlate('abc-123')).toBe('ABC123');
    expect(normalizePlate('A1B2C3')).toBeUndefined();
  });
  it('valida el alta', () => {
    expect(validateAppointment({ customerName: 'Ana', vehicle: 'Pulse', bay: 'Box 1', scheduledAt: '2026-11-07T10:00:00Z', durationMin: 60 }, now)).toEqual([]);
    const errs = validateAppointment({ customerName: '', vehicle: 'P', plate: 'XX', mileage: -1, bay: '', scheduledAt: '2026-11-01T10:00:00Z', durationMin: 5 }, now);
    expect(errs).toHaveLength(7);
  });
  it('detecta superposición en el mismo box, no en otro ni con cancelados', () => {
    const all = [appt({ id: 'a' }), appt({ id: 'b', bay: 'Box 2' }), appt({ id: 'c', status: 'cancelled' }), appt({ id: 'd', scheduledAt: '2026-11-10T13:00:00Z' })];
    expect(findConflicts({ organizationId: 'cardys_fiat', bay: ' box 1 ', scheduledAt: '2026-11-10T12:30:00Z', durationMin: 60 }, all).map((x) => x.id)).toEqual(['a', 'd']);
    expect(findConflicts({ id: 'a', organizationId: 'cardys_fiat', bay: 'Box 1', scheduledAt: '2026-11-10T12:00:00Z', durationMin: 60 }, all)).toEqual([]);
    expect(findConflicts({ organizationId: 'overland_motors', bay: 'Box 1', scheduledAt: '2026-11-10T12:00:00Z', durationMin: 60 }, all)).toEqual([]);
  });
  it('transiciones válidas y ausencia solo después de la hora', () => {
    expect(appointmentActions(appt({}), now)).toEqual(['confirm', 'check_in', 'cancel']);
    expect(appointmentActions(appt({ scheduledAt: '2026-11-06T09:00:00Z' }), now)).toContain('no_show');
    expect(appointmentActions(appt({ status: 'in_progress' }), now)).toEqual(['ready']);
    expect(appointmentActions(appt({ status: 'delivered' }), now)).toEqual([]);
  });
  it('el recordatorio es una tarea 24 h antes, nunca en el pasado', () => {
    expect(reminderTask(appt({ plate: 'AB123CD' }), now).dueAt).toBe('2026-11-09T12:00:00.000Z');
    expect(reminderTask(appt({ scheduledAt: '2026-11-06T18:00:00Z' }), now).dueAt).toBe(now.toISOString());
  });
});

describe('repuestos', () => {
  it('flujo y validaciones por paso', () => {
    expect(partsActions({ status: 'requested' })).toEqual(['quote', 'order', 'cancel']);
    expect(partsActions({ status: 'delivered' })).toEqual([]);
    expect(validatePartsStep('quote', {}, '2026-11-06')).toMatch(/precio/);
    expect(validatePartsStep('order', { eta: '2026-11-01' }, '2026-11-06')).toMatch(/pasada/);
    expect(validatePartsStep('cancel', { reason: ' ' }, '2026-11-06')).toMatch(/motivo/);
    expect(isPartsOverdue({ status: 'ordered', eta: '2026-11-05' }, '2026-11-06')).toBe(true);
    expect(isPartsOverdue({ status: 'received', eta: '2026-11-05' }, '2026-11-06')).toBe(false);
  });
});

const art = (over: Partial<KnowledgeArticle>): KnowledgeArticle => ({
  id: Math.random().toString(),
  organizationId: 'cardys_fiat',
  articleKey: 'k',
  version: 1,
  title: 'Service de 10.000 km',
  body: 'Incluye cambio de aceite y filtro.',
  language: 'es',
  category: 'postventa',
  validFrom: '2026-01-01',
  status: 'published',
  createdBy: 'u',
  createdAt: '',
  ...over,
});

describe('base de conocimiento', () => {
  it('nadie aprueba lo que escribió y solo admins publican', () => {
    expect(canKnowledge('submit', 'draft', 'post_sales', true)).toBe(true);
    expect(canKnowledge('submit', 'draft', 'post_sales', false)).toBe(false);
    expect(canKnowledge('approve', 'in_review', 'dealership_admin', true)).toBe(false);
    expect(canKnowledge('approve', 'in_review', 'dealership_admin', false)).toBe(true);
    expect(canKnowledge('approve', 'in_review', 'post_sales', false)).toBe(false);
    expect(canKnowledge('archive', 'published', 'super_admin', false)).toBe(true);
  });
  it('busca sin acentos, exige todas las palabras y prioriza el título', () => {
    const a = art({ id: 'a', title: 'Garantía de fábrica', body: 'Cubre 3 años.', category: 'garantia' });
    const b = art({ id: 'b', title: 'Service', body: 'La garantia se pierde si no se hace el service.' });
    expect(searchKnowledge([b, a], 'garantia').map((x) => x.id)).toEqual(['a', 'b']);
    expect(searchKnowledge([a, b], 'garantía service').map((x) => x.id)).toEqual(['b']);
  });
  it('vigencia y versionado', () => {
    expect(isArticleCurrent(art({ validTo: '2026-10-31' }), '2026-11-06')).toBe(false);
    expect(isArticleCurrent(art({}), '2026-11-06')).toBe(true);
    expect(isArticleCurrent(art({ status: 'in_review' }), '2026-11-06')).toBe(false);
    expect(nextArticleVersion([art({ version: 1 }), art({ version: 3 }), art({ articleKey: 'z', version: 9 })], 'k')).toBe(4);
  });
});

const consent = (over: Partial<ConsentEvent>): ConsentEvent => ({ id: Math.random().toString(), organizationId: 'cardys_fiat', leadId: 'l1', channel: 'whatsapp', granted: true, source: 'formulario', createdAt: '2026-11-01T00:00:00Z', ...over });
const msg = (over: Partial<ConversationMessage>): ConversationMessage => ({ id: Math.random().toString(), organizationId: 'cardys_fiat', leadId: 'l1', channel: 'whatsapp', direction: 'in', body: 'hola', occurredAt: '2026-11-06T10:00:00Z', createdAt: '', ...over });

describe('consentimiento e inbox', () => {
  it('WhatsApp exige consentimiento vigente; la revocación manda', () => {
    expect(outboundCheck('whatsapp', 'l1', [], [], now)).toMatchObject({ ok: false });
    expect(outboundCheck('whatsapp', 'l1', [consent({})], [], now)).toEqual({ ok: true });
    const revoked = [consent({}), consent({ granted: false, createdAt: '2026-11-05T00:00:00Z' })];
    expect(currentConsent(revoked, 'l1', 'whatsapp')!.granted).toBe(false);
    expect(outboundCheck('whatsapp', 'l1', revoked, [], now)).toMatchObject({ ok: false, reason: expect.stringMatching(/revocó/) });
  });
  it('Instagram solo responde dentro de 24 h; teléfono siempre se registra', () => {
    expect(outboundCheck('instagram', 'l1', [], [msg({ channel: 'instagram' })], now)).toEqual({ ok: true });
    expect(outboundCheck('instagram', 'l1', [], [msg({ channel: 'instagram', occurredAt: '2026-11-04T10:00:00Z' })], now)).toMatchObject({ ok: false });
    expect(outboundCheck('phone', 'l1', [], [], now)).toEqual({ ok: true });
  });
  it('hilos: primero los que esperan respuesta', () => {
    const ms = [msg({ leadId: 'a', direction: 'in', occurredAt: '2026-11-06T11:00:00Z' }), msg({ leadId: 'b', direction: 'in', occurredAt: '2026-11-06T09:00:00Z' }), msg({ leadId: 'b', direction: 'out', occurredAt: '2026-11-06T11:30:00Z' })];
    const t = inboxThreads(ms, now);
    expect(t.map((x) => [x.leadId, x.awaitingReply, x.waitingMinutes])).toEqual([['a', true, 60], ['b', false, undefined]]);
  });
  it('mediana del tiempo de respuesta medida, no estimada', () => {
    expect(medianResponseMinutes([])).toBeNull();
    const ms = [
      msg({ leadId: 'a', occurredAt: '2026-11-06T10:00:00Z' }),
      msg({ leadId: 'a', occurredAt: '2026-11-06T10:05:00Z' }),
      msg({ leadId: 'a', direction: 'out', occurredAt: '2026-11-06T10:30:00Z' }),
      msg({ leadId: 'b', occurredAt: '2026-11-06T10:00:00Z' }),
      msg({ leadId: 'b', direction: 'out', occurredAt: '2026-11-06T10:10:00Z' }),
    ];
    expect(medianResponseMinutes(ms)).toBe(20);
  });
});
