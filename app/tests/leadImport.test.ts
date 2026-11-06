import { describe, expect, it } from 'vitest';
import { previewImport } from '@/lib/domain/leadImport';
import type { Lead } from '@/lib/domain/types';

const now = '2026-11-06T12:00:00.000Z';
let n = 0;
const opts = (existing: Lead[] = []) => ({ existing, now, newId: () => `id-${++n}`, defaultOrg: undefined });

const csv = [
  'nombre,telefono,email,concesionario,modelo',
  'Ana Gómez,2392 555 101,,Cardys,Fiat Cronos',
  'Ana G.,02392 15 555101,,Cardys,Fiat Pulse', // mismo teléfono → update de modelo
  'Beto,,beto@mail.com,Overland,Jeep Compass',
  'Sin contacto,,,Cardys,Toro',
  'Otra Org,2392 555 101,,Overland,RAM', // mismo teléfono pero otro tenant → create
].join('\n');

describe('previewImport', () => {
  it('cuenta creados, actualizados, duplicados y errores sin mutar la base', () => {
    const existing: Lead[] = [];
    const p = previewImport(csv, opts(existing));
    expect(p.counts).toEqual({ create: 3, update: 1, duplicate: 0, error: 1 });
    expect(existing).toHaveLength(0);
    const err = p.outcomes.find((o) => o.kind === 'error');
    expect(err).toMatchObject({ row: 5, message: 'sin teléfono ni email' });
  });

  it('importar dos veces el mismo archivo no duplica', () => {
    const first = previewImport(csv, opts());
    const created = first.outcomes.flatMap((o) => (o.kind === 'create' ? [o.lead] : []));
    for (const o of first.outcomes) {
      if (o.kind === 'update') Object.assign(created.find((l) => l.id === o.leadId)!, o.changes);
    }
    const second = previewImport(csv, opts(created));
    expect(second.counts.create).toBe(0);
    expect(second.counts.error).toBe(1);
  });

  it('archivo vacío devuelve preview vacía', () => {
    expect(previewImport('', opts()).counts).toEqual({ create: 0, update: 0, duplicate: 0, error: 0 });
  });

  it('falta de columnas obligatorias es un error explícito', () => {
    const p = previewImport('modelo\nCronos', opts());
    expect(p.counts.error).toBe(1);
    expect(p.outcomes[0]).toMatchObject({ kind: 'error' });
  });

  it('asigna score explicable a los creados', () => {
    const p = previewImport(csv, opts());
    const c = p.outcomes.find((o) => o.kind === 'create');
    expect(c && c.kind === 'create' && c.lead.scoreReason).toContain('teléfono válido');
  });
});
