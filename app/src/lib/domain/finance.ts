/** Calculadoras orientativas. No constituyen una oferta comercial ni reemplazan condiciones de fábrica. */

function assertFinite(...xs: number[]) {
  if (!xs.every(Number.isFinite)) throw new Error('Valores inválidos');
}

export function frenchInstallment(principal: number, tnaPercent: number, months: number): number {
  assertFinite(principal, tnaPercent, months);
  if (principal < 0 || tnaPercent < 0 || !Number.isInteger(months) || months <= 0) {
    throw new Error('Monto, tasa o plazo inválidos');
  }
  const i = tnaPercent / 1200;
  if (i === 0) return principal / months;
  return (principal * i) / (1 - (1 + i) ** -months);
}

export interface FinancingInput {
  price: number;
  downPayment: number;
  months: number;
  tnaPercent: number;
  /** Gastos de otorgamiento sobre el monto financiado, % (se suman al costo total). */
  originationFeePercent?: number;
}

export function financingQuote(input: FinancingInput) {
  const { price, downPayment, months, tnaPercent, originationFeePercent = 0 } = input;
  assertFinite(price, downPayment, months, tnaPercent, originationFeePercent);
  if (price <= 0) throw new Error('El precio debe ser mayor a cero');
  if (downPayment < 0 || downPayment >= price) throw new Error('El anticipo debe ser menor al precio');
  const financed = price - downPayment;
  const installment = frenchInstallment(financed, tnaPercent, months);
  const fees = (financed * originationFeePercent) / 100;
  const totalPaid = installment * months + downPayment + fees;
  // TEA equivalente a la TNA con capitalización mensual.
  const tea = ((1 + tnaPercent / 1200) ** 12 - 1) * 100;
  return { financed, installment, fees, totalPaid, totalInterest: installment * months - financed, teaPercent: tea };
}

export interface SavingsPlanInput {
  /** Valor móvil vigente del vehículo según lista de fábrica. */
  mobileValue: number;
  months: number;
  /** Carga administrativa sobre la alícuota, % (suele estar entre 8% y 12%; validar contrato). */
  adminFeePercent: number;
  /** IVA aplicado a la carga administrativa, %. */
  vatPercent?: number;
  /** Seguro de vida mensual sobre el saldo de deuda, %. */
  lifeInsuranceMonthlyPercent?: number;
  /** Derecho de adjudicación sobre el valor móvil, % (se paga una vez al adjudicar). */
  awardFeePercent?: number;
  /** Cuotas pagadas antes de la adjudicación (para estimar saldo). */
  awardMonth?: number;
}

/**
 * Plan de ahorro: la cuota NO se calcula con tasa. Es alícuota (valor móvil / plazo) + carga administrativa
 * (+ IVA) + seguro de vida sobre el saldo. Los importes acompañan el valor móvil: si sube la lista, sube la cuota.
 */
export function savingsPlanQuote(input: SavingsPlanInput) {
  const {
    mobileValue,
    months,
    adminFeePercent,
    vatPercent = 21,
    lifeInsuranceMonthlyPercent = 0,
    awardFeePercent = 0,
    awardMonth,
  } = input;
  assertFinite(mobileValue, months, adminFeePercent, vatPercent, lifeInsuranceMonthlyPercent, awardFeePercent);
  if (mobileValue <= 0) throw new Error('El valor móvil debe ser mayor a cero');
  if (!Number.isInteger(months) || months <= 0) throw new Error('Plazo inválido');
  if (adminFeePercent < 0 || vatPercent < 0 || lifeInsuranceMonthlyPercent < 0 || awardFeePercent < 0) {
    throw new Error('Los porcentajes no pueden ser negativos');
  }
  if (awardMonth !== undefined && (!Number.isInteger(awardMonth) || awardMonth < 1 || awardMonth > months)) {
    throw new Error('Mes de adjudicación fuera del plazo');
  }

  const aliquot = mobileValue / months;
  const adminFee = (aliquot * adminFeePercent) / 100;
  const adminVat = (adminFee * vatPercent) / 100;
  const firstMonthBalance = mobileValue;
  const lifeInsurance = (firstMonthBalance * lifeInsuranceMonthlyPercent) / 100;
  const firstInstallment = aliquot + adminFee + adminVat + lifeInsurance;
  const awardFee = (mobileValue * awardFeePercent) / 100;
  const balanceAtAward = awardMonth === undefined ? undefined : mobileValue - aliquot * awardMonth;

  return { aliquot, adminFee, adminVat, lifeInsurance, firstInstallment, awardFee, balanceAtAward };
}

export interface UsedVehicleInput {
  marketValue: number;
  dealerMarginPercent: number;
  condition: 'excellent' | 'good' | 'fair';
  mileageKm: number;
}

const CONDITION_ADJ = { excellent: 0, good: 0.025, fair: 0.07 } as const;

export function usedVehicleEstimate(input: UsedVehicleInput) {
  const { marketValue, dealerMarginPercent, condition, mileageKm } = input;
  assertFinite(marketValue, dealerMarginPercent, mileageKm);
  if (marketValue <= 0 || dealerMarginPercent < 0 || dealerMarginPercent > 100 || mileageKm < 0) {
    throw new Error('Valores fuera de rango');
  }
  const conditionAdj = CONDITION_ADJ[condition];
  if (conditionAdj === undefined) throw new Error('Estado inválido');
  const mileageAdj = mileageKm > 100_000 ? 0.03 : 0;
  const marginAmount = (marketValue * dealerMarginPercent) / 100;
  const conditionAmount = marketValue * conditionAdj;
  const mileageAmount = marketValue * mileageAdj;
  const estimate = Math.max(0, marketValue - marginAmount - conditionAmount - mileageAmount);
  return { estimate, marginAmount, conditionAmount, mileageAmount };
}
