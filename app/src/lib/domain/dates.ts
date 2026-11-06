import type { DateRange } from './types';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function toDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export function isValidDay(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false;
  return toDay(parseDay(s)) === s;
}

export function inRange(dayOrIso: string, range: DateRange): boolean {
  const day = dayOrIso.slice(0, 10);
  return day >= range.from && day <= range.to;
}

/** Lista de días del rango, inclusive. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export type RangePreset = '7d' | '30d' | '90d' | 'this_month' | 'last_month';

export const PRESET_LABEL: Record<RangePreset, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  this_month: 'Este mes',
  last_month: 'Mes anterior',
};

export function presetRange(preset: RangePreset, today: string): DateRange {
  const t = parseDay(today);
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'this_month':
      return { from: toDay(new Date(t.getFullYear(), t.getMonth(), 1)), to: today };
    case 'last_month':
      return {
        from: toDay(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: toDay(new Date(t.getFullYear(), t.getMonth(), 0)),
      };
  }
}

/** Valida un rango que llega de la URL; si es inválido devuelve el de los últimos 30 días. */
export function sanitizeRange(from: unknown, to: unknown, today: string): DateRange {
  if (isValidDay(from) && isValidDay(to) && from <= to) return { from, to };
  return presetRange('30d', today);
}

export function formatDay(day: string): string {
  const d = parseDay(day.slice(0, 10));
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}
