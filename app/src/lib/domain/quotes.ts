import { addDays } from './dates';
import { financingQuote, savingsPlanQuote, usedVehicleEstimate } from './finance';
import type { QuoteKind, QuoteStatus, Role } from './types';

export type QuoteAction = 'submit' | 'approve' | 'reject';

/**
 * Reglas de transición (espejo de quote_transition() en la base):
 * el autor envía a aprobación; la gerencia aprueba o rechaza con motivo; nadie aprueba lo propio salvo Super Admin.
 */
export function canTransition(action: QuoteAction, status: QuoteStatus, role: Role, isAuthor: boolean): boolean {
  if (action === 'submit') return isAuthor && (status === 'draft' || status === 'rejected');
  if (status !== 'pending_approval') return false;
  if (role !== 'super_admin' && role !== 'dealership_admin') return false;
  return !isAuthor || role === 'super_admin';
}

export function nextStatus(action: QuoteAction): QuoteStatus {
  return action === 'submit' ? 'pending_approval' : action === 'approve' ? 'approved' : 'rejected';
}

export const DEFAULT_VALIDITY_DAYS = 7;
export const validUntil = (today: string, days = DEFAULT_VALIDITY_DAYS) => addDays(today, days);

type Num = Record<string, number>;

/** Calcula el resultado de cada tipo de cotización con las funciones probadas de finance.ts. */
export function computeQuote(kind: QuoteKind, input: Num): Record<string, number | undefined> {
  switch (kind) {
    case 'used': {
      const condition = input.condition === 0 ? 'excellent' : input.condition === 2 ? 'fair' : 'good';
      return usedVehicleEstimate({ marketValue: input.marketValue!, dealerMarginPercent: input.marginPercent!, condition, mileageKm: input.mileageKm! });
    }
    case 'savings':
      return savingsPlanQuote({
        mobileValue: input.mobileValue!,
        months: input.months!,
        adminFeePercent: input.adminFeePercent!,
        vatPercent: input.vatPercent,
        lifeInsuranceMonthlyPercent: input.lifeInsuranceMonthlyPercent,
        awardFeePercent: input.awardFeePercent,
        awardMonth: input.awardMonth || undefined,
      });
    case 'financing':
      return financingQuote({
        price: input.price!,
        downPayment: input.downPayment!,
        months: input.months!,
        tnaPercent: input.tnaPercent!,
        originationFeePercent: input.originationFeePercent,
      });
  }
}

/** Resultado principal para listar: cuota mensual o valor de toma. */
export function headline(kind: QuoteKind, result: Record<string, number | undefined>): { label: string; value: number | undefined } {
  if (kind === 'used') return { label: 'Valor de toma', value: result.estimate };
  if (kind === 'savings') return { label: 'Primera cuota', value: result.firstInstallment };
  return { label: 'Cuota mensual', value: result.installment };
}
