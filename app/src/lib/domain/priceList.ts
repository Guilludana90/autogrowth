import { parseCsv } from './csv';
import type { PriceDocument, PriceRow } from './types';

const MODEL = ['modelo', 'model'];
const VERSION = ['version', 'versión', 'trim', 'version/trim'];
const PRICE = ['precio', 'price', 'precio lista', 'precio de lista', 'pvp', 'valor', 'valor movil', 'valor móvil'];

/** Interpreta importes argentinos: "$ 30.500.000", "30500000", "30.500.000,50", "30,500,000". */
export function parseArMoney(raw: string): number | undefined {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return undefined;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot) {
    // coma decimal (es-AR): 30.500.000,50
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma >= 0) {
    // coma de miles (en-US): 30,500,000.50
    s = s.replace(/,/g, '');
  } else if (lastDot >= 0 && /\.\d{3}$/.test(s)) {
    // solo puntos con 3 dígitos al final: separador de miles
    s = s.replace(/\./g, '');
  } else if (lastComma >= 0 && /,\d{3}$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface PriceListParse {
  rows: PriceRow[];
  errors: Array<{ row: number; message: string }>;
}

/** Valida una lista de precios exportada a CSV (desde el XLSX mensual de fábrica). */
export function parsePriceList(text: string): PriceListParse {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iModel = idx(MODEL);
  const iVersion = idx(VERSION);
  const iPrice = idx(PRICE);
  if (!header.length) return { rows: [], errors: [{ row: 1, message: 'El archivo está vacío' }] };
  if (iModel < 0 || iPrice < 0) {
    return { rows: [], errors: [{ row: 1, message: 'Faltan columnas: modelo y precio son obligatorias' }] };
  }
  const out: PriceRow[] = [];
  const errors: PriceListParse['errors'] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 2;
    const model = (r[iModel] ?? '').trim();
    const version = iVersion >= 0 ? (r[iVersion] ?? '').trim() : '';
    const price = parseArMoney(r[iPrice] ?? '');
    if (!model) return errors.push({ row, message: 'sin modelo' });
    if (price === undefined) return errors.push({ row, message: `precio inválido: "${r[iPrice] ?? ''}"` });
    const key = `${model}|${version}`.toLowerCase();
    if (seen.has(key)) return errors.push({ row, message: `fila repetida: ${model} ${version}` });
    seen.add(key);
    out.push({ model, version, price });
  });
  return { rows: out, errors };
}

/** Documento activo para la categoría y fecha; nunca devuelve uno vencido ni archivado. */
export function activeDocument(docs: readonly PriceDocument[], category: PriceDocument['category'], organizationId: string, today: string) {
  return docs.find(
    (d) =>
      d.organizationId === organizationId &&
      d.category === category &&
      d.status === 'active' &&
      d.validFrom <= today &&
      (!d.validTo || d.validTo >= today),
  );
}
