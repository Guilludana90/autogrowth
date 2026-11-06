/**
 * Normaliza teléfonos argentinos a E.164 móvil (+549 + área + número, 10 dígitos nacionales).
 * Devuelve undefined si no se puede normalizar con seguridad (mejor un dato vacío que uno inventado).
 */
export function normalizeArPhone(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, '');
  if (!d) return undefined;

  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);

  // Prefijo móvil local "15" después del código de área (2 a 4 dígitos): 11 15 xxxx-xxxx
  if (d.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === '15') {
        d = d.slice(0, areaLen) + d.slice(areaLen + 2);
        break;
      }
    }
  }

  if (d.length !== 10) return undefined;
  return `+549${d}`;
}

export function formatArPhone(e164: string | undefined): string {
  if (!e164) return '—';
  const m = /^\+549(\d{10})$/.exec(e164);
  if (!m) return e164;
  const n = m[1]!;
  return `+54 9 ${n.slice(0, 4)} ${n.slice(4, 7)}-${n.slice(7)}`;
}

export function normalizeEmail(raw: string | undefined | null): string | undefined {
  const e = raw?.trim().toLowerCase();
  if (!e) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}
