import { addDays } from '../domain/dates';
import { computeQuote, validUntil } from '../domain/quotes';
import type { Lead, Member, PriceDocument, Quote, Task } from '../domain/types';
import { DEMO_ADVISORS } from './seed';

/** Todo ficticio. Los precios son de ejemplo y no representan listas reales de fábrica. */

export const DEMO_USER_ID = 'demo-user';

export const DEMO_MEMBERS: Member[] = [
  { userId: DEMO_USER_ID, name: 'Usuario demo', email: 'demo@autogrowth.local', organizationId: 'cardys_fiat', role: 'super_admin' },
  { userId: DEMO_USER_ID, name: 'Usuario demo', email: 'demo@autogrowth.local', organizationId: 'overland_motors', role: 'super_admin' },
  { userId: 'mgr-cardys', name: 'Gerencia Cardys (demo)', email: 'gerencia@cardys.demo', organizationId: 'cardys_fiat', role: 'dealership_admin' },
  { userId: 'mgr-overland', name: 'Gerencia Overland (demo)', email: 'gerencia@overland.demo', organizationId: 'overland_motors', role: 'dealership_admin' },
  ...DEMO_ADVISORS.map<Member>((a) => ({
    userId: a.id,
    name: a.name,
    email: `${a.id.replace('adv-', '')}@${a.organizationId === 'cardys_fiat' ? 'cardys' : 'overland'}.demo`,
    organizationId: a.organizationId,
    role: 'sales_advisor',
  })),
  { userId: 'ps-cardys', name: 'Taller Cardys (demo)', email: 'taller@cardys.demo', organizationId: 'cardys_fiat', role: 'post_sales' },
  { userId: 'ps-overland', name: 'Taller Overland (demo)', email: 'taller@overland.demo', organizationId: 'overland_motors', role: 'post_sales' },
];

const row = (model: string, version: string, price: number) => ({ model, version, price });

export function demoPriceDocuments(today: string): PriceDocument[] {
  const monthStart = `${today.slice(0, 8)}01`;
  const prevStart = addDays(monthStart, -30).slice(0, 8) + '01';
  return [
    {
      id: 'doc-cardys-prev',
      organizationId: 'cardys_fiat',
      category: 'price_list',
      title: 'Lista de precios FIAT (mes anterior) · ficticia',
      fileName: 'lista-fiat-anterior.csv',
      validFrom: prevStart,
      validTo: addDays(monthStart, -1),
      rows: [row('Fiat Cronos', 'Drive 1.3', 27_900_000), row('Fiat Pulse', 'Drive 1.3', 31_200_000)],
      status: 'archived',
      createdAt: `${prevStart}T12:00:00.000Z`,
    },
    {
      id: 'doc-cardys',
      organizationId: 'cardys_fiat',
      category: 'price_list',
      title: 'Lista de precios FIAT · ficticia',
      fileName: 'lista-fiat.csv',
      validFrom: monthStart,
      rows: [
        row('Fiat Mobi', 'Trekking 1.0', 21_400_000),
        row('Fiat Cronos', 'Drive 1.3', 28_900_000),
        row('Fiat Cronos', 'Precision 1.3 CVT', 33_100_000),
        row('Fiat Pulse', 'Drive 1.3', 32_400_000),
        row('Fiat Fastback', 'Audace T200', 39_800_000),
        row('Fiat Strada', 'Freedom 1.3 CD', 31_700_000),
        row('Fiat Toro', 'Freedom 1.3T', 41_500_000),
      ],
      status: 'active',
      createdAt: `${monthStart}T12:00:00.000Z`,
    },
    {
      id: 'doc-overland',
      organizationId: 'overland_motors',
      category: 'price_list',
      title: 'Lista de precios Jeep/RAM · ficticia',
      fileName: 'lista-jeep-ram.csv',
      validFrom: monthStart,
      rows: [
        row('Jeep Renegade', 'Sport 1.3T', 41_900_000),
        row('Jeep Compass', 'Longitude 1.3T', 52_600_000),
        row('Jeep Commander', 'Limited 1.3T', 64_300_000),
        row('RAM Rampage', 'Rebel 2.0T', 61_800_000),
        row('RAM Dakota', 'Laramie 2.2', 58_900_000),
      ],
      status: 'active',
      createdAt: `${monthStart}T12:00:00.000Z`,
    },
  ];
}

export function demoTasks(today: string, leads: readonly Lead[]): Task[] {
  const open = leads.filter((l) => l.status === 'new' || l.status === 'contacted' || l.status === 'negotiation').slice(0, 14);
  const titles = ['Llamar para confirmar interés', 'Enviar cotización', 'Coordinar test drive', 'Pedir documentación para crédito', 'Seguimiento por WhatsApp'];
  return open.map((l, i) => {
    const due = addDays(today, (i % 7) - 3);
    return {
      id: `task-${i + 1}`,
      organizationId: l.organizationId,
      leadId: l.id,
      title: `${titles[i % titles.length]} · ${l.name}`,
      priority: i % 4 === 0 ? 'high' : i % 4 === 3 ? 'low' : 'normal',
      status: i % 6 === 5 ? 'done' : i % 5 === 1 ? 'in_progress' : 'pending',
      dueAt: `${due}T15:00:00.000Z`,
      assigneeId: l.advisorId,
      createdAt: l.createdAt,
      completedAt: i % 6 === 5 ? `${today}T10:00:00.000Z` : undefined,
    };
  });
}

export function demoQuotes(today: string, leads: readonly Lead[]): Quote[] {
  const cardys = leads.find((l) => l.organizationId === 'cardys_fiat' && l.status === 'negotiation');
  const overland = leads.find((l) => l.organizationId === 'overland_motors' && l.status === 'negotiation');
  const out: Quote[] = [];
  if (cardys) {
    const input = { price: 28_900_000, downPayment: 12_000_000, months: 18, tnaPercent: 29, originationFeePercent: 2 };
    out.push({
      id: 'quote-1',
      organizationId: 'cardys_fiat',
      number: 1,
      leadId: cardys.id,
      kind: 'financing',
      vehicle: 'Fiat Cronos Drive 1.3',
      input,
      result: computeQuote('financing', input),
      priceDocumentId: 'doc-cardys',
      status: 'pending_approval',
      validUntil: validUntil(today),
      createdBy: 'adv-lucia',
      createdByName: 'Lucía Torres',
      createdAt: `${addDays(today, -1)}T16:20:00.000Z`,
    });
  }
  if (overland) {
    const input = { marketValue: 19_500_000, marginPercent: 10, condition: 1, mileageKm: 87_000 };
    out.push({
      id: 'quote-2',
      organizationId: 'overland_motors',
      number: 1,
      leadId: overland.id,
      kind: 'used',
      vehicle: 'Jeep Renegade Sport 2019 (toma)',
      input,
      result: computeQuote('used', input),
      status: 'approved',
      validUntil: validUntil(addDays(today, -2)),
      createdBy: 'adv-martin',
      createdByName: 'Martín Díaz',
      decidedByName: 'Gerencia Overland (demo)',
      decidedAt: `${addDays(today, -2)}T11:00:00.000Z`,
      createdAt: `${addDays(today, -2)}T09:30:00.000Z`,
    });
  }
  return out;
}
