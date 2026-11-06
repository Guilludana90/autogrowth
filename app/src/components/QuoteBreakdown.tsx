import { formatMoney, formatNumber } from '@/lib/domain/metrics';
import type { QuoteKind } from '@/lib/domain/types';

const BREAKDOWN: Record<QuoteKind, Array<[string, string]>> = {
  used: [['marginAmount', 'Margen'], ['conditionAmount', 'Ajuste por estado'], ['mileageAmount', 'Ajuste por kilometraje'], ['estimate', 'Valor de toma estimado']],
  savings: [['aliquot', 'Alícuota (valor móvil / plazo)'], ['adminFee', 'Carga administrativa'], ['adminVat', 'IVA sobre carga'], ['lifeInsurance', 'Seguro de vida'], ['firstInstallment', 'Primera cuota'], ['awardFee', 'Derecho de adjudicación (una vez)'], ['balanceAtAward', 'Saldo al adjudicar']],
  financing: [['financed', 'Monto financiado'], ['installment', 'Cuota mensual'], ['totalInterest', 'Intereses totales'], ['fees', 'Gastos de otorgamiento'], ['totalPaid', 'Costo total (con anticipo)'], ['teaPercent', 'TEA %']],
};

export function Breakdown({ kind, result }: { kind: QuoteKind; result: Record<string, number | undefined> }) {
  return (
    <table className="breakdown">
      <tbody>
        {BREAKDOWN[kind]
          .filter(([k]) => result[k] !== undefined)
          .map(([k, label]) => (
            <tr key={k}>
              <td>{label}</td>
              <td>{k === 'teaPercent' ? `${formatNumber(result[k]!, 2)}%` : formatMoney(result[k]!)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

