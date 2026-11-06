/** Calculadoras matemáticas de ejemplo. No constituyen una oferta comercial. */
export function calculateFrenchInstallment(principal: number, annualNominalRatePercent: number, months: number): number {
  if (![principal, annualNominalRatePercent, months].every(Number.isFinite)) throw new Error('Valores inválidos');
  if (principal < 0 || annualNominalRatePercent < 0 || !Number.isInteger(months) || months <= 0) throw new Error('Precio, tasa o plazo inválidos');
  const monthlyRate = annualNominalRatePercent / 1200;
  if (monthlyRate === 0) return principal / months;
  return principal * monthlyRate / (1 - (1 + monthlyRate) ** -months);
}

export interface UsedVehicleEstimateInput {
  marketValue: number;
  dealerMarginPercent: number;
  condition: 'excellent' | 'good' | 'fair';
  mileageKm: number;
}

export function estimateUsedVehicle(input: UsedVehicleEstimateInput) {
  const { marketValue, dealerMarginPercent, condition, mileageKm } = input;
  if (![marketValue, dealerMarginPercent, mileageKm].every(Number.isFinite)) throw new Error('Valores inválidos');
  if (marketValue <= 0 || dealerMarginPercent < 0 || dealerMarginPercent > 100 || mileageKm < 0) throw new Error('Valores fuera de rango');
  const conditionAdjustment = { excellent: 0, good: 0.025, fair: 0.07 }[condition];
  if (conditionAdjustment === undefined) throw new Error('Estado inválido');
  const mileageAdjustment = mileageKm > 100_000 ? 0.03 : 0;
  const marginAmount = marketValue * dealerMarginPercent / 100;
  const conditionAmount = marketValue * conditionAdjustment;
  const mileageAmount = marketValue * mileageAdjustment;
  const estimate = Math.max(0, marketValue - marginAmount - conditionAmount - mileageAmount);
  return { estimate, marketValue, marginAmount, conditionAmount, mileageAmount };
}
