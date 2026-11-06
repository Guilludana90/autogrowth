import { describe, expect, it } from 'vitest';
import { activeDocument, parseArMoney, parsePriceList } from '@/lib/domain/priceList';
import { canTransition, computeQuote, headline, validUntil } from '@/lib/domain/quotes';
import type { PriceDocument } from '@/lib/domain/types';

describe('flujo de aprobación de cotizaciones', () => {
  it('el autor envía borradores o rechazadas', () => {
    expect(canTransition('submit', 'draft', 'sales_advisor', true)).toBe(true);
    expect(canTransition('submit', 'rejected', 'sales_advisor', true)).toBe(true);
    expect(canTransition('submit', 'draft', 'sales_advisor', false)).toBe(false);
    expect(canTransition('submit', 'approved', 'sales_advisor', true)).toBe(false);
  });
  it('solo la gerencia aprueba, y nunca lo propio salvo Super Admin', () => {
    expect(canTransition('approve', 'pending_approval', 'sales_advisor', false)).toBe(false);
    expect(canTransition('approve', 'pending_approval', 'dealership_admin', false)).toBe(true);
    expect(canTransition('approve', 'pending_approval', 'dealership_admin', true)).toBe(false);
    expect(canTransition('approve', 'pending_approval', 'super_admin', true)).toBe(true);
    expect(canTransition('reject', 'draft', 'super_admin', false)).toBe(false);
  });
  it('vigencia por defecto de 7 días', () => {
    expect(validUntil('2026-11-28')).toBe('2026-12-05');
  });
});

describe('computeQuote', () => {
  it('financiación', () => {
    const r = computeQuote('financing', { price: 30_000_000, downPayment: 10_000_000, months: 12, tnaPercent: 0 });
    expect(r.installment).toBeCloseTo(1_666_666.67, 2);
    expect(headline('financing', r)).toEqual({ label: 'Cuota mensual', value: r.installment });
  });
  it('plan de ahorro sin mes de adjudicación', () => {
    const r = computeQuote('savings', { mobileValue: 24_000_000, months: 84, adminFeePercent: 10, vatPercent: 21, awardMonth: 0 });
    expect(r.balanceAtAward).toBeUndefined();
    expect(headline('savings', r).value).toBeCloseTo(285_714.29 + 28_571.43 + 6_000, 1);
  });
  it('usado con estado regular', () => {
    expect(computeQuote('used', { marketValue: 10_000_000, marginPercent: 10, condition: 2, mileageKm: 50_000 }).estimate).toBe(8_300_000);
  });
  it('propaga errores de validación', () => {
    expect(() => computeQuote('financing', { price: 10, downPayment: 20, months: 12, tnaPercent: 0 })).toThrow();
  });
});

describe('listas de precios', () => {
  it.each([
    ['$ 30.500.000', 30_500_000],
    ['30500000', 30_500_000],
    ['30.500.000,50', 30_500_000.5],
    ['30,500,000.50', 30_500_000.5],
    ['1.250', 1250],
    ['abc', undefined],
    ['-5', undefined],
  ])('parseArMoney(%j) = %j', (raw, expected) => {
    expect(parseArMoney(raw)).toBe(expected);
  });

  it('valida filas, detecta repetidas y precios inválidos', () => {
    const p = parsePriceList('Modelo;Versión;Precio lista\nCronos;Drive 1.3;$ 30.500.000\nCronos;Drive 1.3;31000000\nPulse;Audace;consultar\n;x;1\nToro;Volcano;45.900.000');
    expect(p.rows).toEqual([
      { model: 'Cronos', version: 'Drive 1.3', price: 30_500_000 },
      { model: 'Toro', version: 'Volcano', price: 45_900_000 },
    ]);
    expect(p.errors.map((e) => e.row)).toEqual([3, 4, 5]);
  });

  it('exige columnas obligatorias', () => {
    expect(parsePriceList('marca,valor\nFiat,1').errors[0]?.message).toContain('obligatorias');
    expect(parsePriceList('').errors[0]?.message).toContain('vacío');
  });

  it('documento activo respeta vigencia y organización', () => {
    const base: PriceDocument = { id: '1', organizationId: 'cardys_fiat', category: 'price_list', title: 'x', fileName: 'x', validFrom: '2026-11-01', validTo: '2026-11-30', rows: [], status: 'active', createdAt: '' };
    expect(activeDocument([base], 'price_list', 'cardys_fiat', '2026-11-06')?.id).toBe('1');
    expect(activeDocument([base], 'price_list', 'cardys_fiat', '2026-12-01')).toBeUndefined();
    expect(activeDocument([base], 'price_list', 'overland_motors', '2026-11-06')).toBeUndefined();
    expect(activeDocument([{ ...base, status: 'archived' }], 'price_list', 'cardys_fiat', '2026-11-06')).toBeUndefined();
  });
});
