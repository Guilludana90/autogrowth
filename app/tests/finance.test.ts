import { describe, expect, it } from 'vitest';
import { financingQuote, frenchInstallment, savingsPlanQuote, usedVehicleEstimate } from '@/lib/domain/finance';

describe('frenchInstallment', () => {
  it('tasa cero divide en partes iguales', () => {
    expect(frenchInstallment(1_200_000, 0, 12)).toBe(100_000);
  });
  it('coincide con la fórmula de sistema francés', () => {
    // 1.000.000 al 60% TNA a 12 meses → i = 5% mensual → 112.825,41
    expect(frenchInstallment(1_000_000, 60, 12)).toBeCloseTo(112_825.41, 2);
  });
  it('rechaza plazos inválidos', () => {
    expect(() => frenchInstallment(1000, 10, 0)).toThrow();
    expect(() => frenchInstallment(1000, 10, 1.5)).toThrow();
  });
});

describe('financingQuote', () => {
  it('calcula monto financiado, gastos y TEA', () => {
    const q = financingQuote({ price: 30_000_000, downPayment: 10_000_000, months: 12, tnaPercent: 60, originationFeePercent: 2 });
    expect(q.financed).toBe(20_000_000);
    expect(q.fees).toBe(400_000);
    expect(q.teaPercent).toBeCloseTo(79.59, 2);
    expect(q.totalPaid).toBeCloseTo(q.installment * 12 + 10_000_000 + 400_000, 6);
  });
  it('anticipo mayor o igual al precio es inválido', () => {
    expect(() => financingQuote({ price: 10, downPayment: 10, months: 12, tnaPercent: 0 })).toThrow('anticipo');
  });
});

describe('savingsPlanQuote', () => {
  it('no usa tasa: alícuota + carga administrativa + IVA + seguro', () => {
    const q = savingsPlanQuote({
      mobileValue: 24_000_000,
      months: 84,
      adminFeePercent: 10,
      vatPercent: 21,
      lifeInsuranceMonthlyPercent: 0.05,
      awardFeePercent: 2,
      awardMonth: 6,
    });
    expect(q.aliquot).toBeCloseTo(285_714.29, 2);
    expect(q.adminFee).toBeCloseTo(28_571.43, 2);
    expect(q.adminVat).toBeCloseTo(6_000, 2);
    expect(q.lifeInsurance).toBe(12_000);
    expect(q.firstInstallment).toBeCloseTo(285_714.29 + 28_571.43 + 6_000 + 12_000, 1);
    expect(q.awardFee).toBe(480_000);
    expect(q.balanceAtAward).toBeCloseTo(24_000_000 - 285_714.2857 * 6, 2);
  });
  it('valida mes de adjudicación', () => {
    expect(() => savingsPlanQuote({ mobileValue: 1, months: 12, adminFeePercent: 10, awardMonth: 13 })).toThrow();
  });
});

describe('usedVehicleEstimate', () => {
  it('descuenta margen, estado y kilometraje', () => {
    const r = usedVehicleEstimate({ marketValue: 18_600_000, dealerMarginPercent: 10, condition: 'good', mileageKm: 120_000 });
    expect(r.marginAmount).toBe(1_860_000);
    expect(r.conditionAmount).toBe(465_000);
    expect(r.mileageAmount).toBe(558_000);
    expect(r.estimate).toBe(15_717_000);
  });
});
