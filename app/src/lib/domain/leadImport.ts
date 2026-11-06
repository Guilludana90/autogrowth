import { parseCsv } from './csv';
import { normalizeArPhone, normalizeEmail } from './phone';
import { scoreLead } from './scoring';
import type { Lead, OrganizationId } from './types';
import { isOrganizationId } from './types';

export const COLUMN_ALIASES = {
  name: ['nombre', 'name', 'nombre y apellido', 'contacto', 'cliente'],
  phone: ['telefono', 'teléfono', 'phone', 'celular', 'whatsapp', 'tel'],
  email: ['email', 'e-mail', 'correo', 'mail'],
  organization: ['client_id', 'cliente_id', 'concesionario', 'empresa', 'organizacion', 'organización'],
  model: ['modelo', 'model', 'interes', 'interés', 'vehiculo', 'vehículo'],
  source: ['origen', 'source', 'fuente', 'canal'],
  campaign: ['campaign_id', 'campaña', 'campana', 'campaign'],
} as const;

export type ImportField = keyof typeof COLUMN_ALIASES;
export type ColumnMapping = Partial<Record<ImportField, number>>;

export function detectMapping(headers: readonly string[]): ColumnMapping {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const mapping: ColumnMapping = {};
  for (const field of Object.keys(COLUMN_ALIASES) as ImportField[]) {
    const idx = norm.findIndex((h) => (COLUMN_ALIASES[field] as readonly string[]).includes(h));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

function resolveOrg(raw: string, fallback: OrganizationId | undefined): OrganizationId | undefined {
  if (isOrganizationId(raw)) return raw;
  if (/overland|jeep|ram/i.test(raw)) return 'overland_motors';
  if (/cardys|fiat/i.test(raw)) return 'cardys_fiat';
  return raw.trim() ? undefined : fallback;
}

export type RowOutcome =
  | { row: number; kind: 'create'; lead: Lead }
  | { row: number; kind: 'update'; leadId: string; changes: Partial<Lead>; name: string }
  | { row: number; kind: 'duplicate'; leadId: string; name: string }
  | { row: number; kind: 'error'; message: string };

export interface ImportPreview {
  headers: string[];
  mapping: ColumnMapping;
  outcomes: RowOutcome[];
  counts: { create: number; update: number; duplicate: number; error: number };
}

export interface PreviewOptions {
  existing: readonly Lead[];
  defaultOrg?: OrganizationId;
  now: string; // ISO
  newId: () => string;
}

/**
 * Dry-run del importador: no modifica nada. Deduplica por organización + teléfono E.164 o email
 * normalizado, contra la base existente y contra filas anteriores del mismo archivo.
 */
export function previewImport(text: string, opts: PreviewOptions): ImportPreview {
  const rows = parseCsv(text);
  const headers = rows.shift()?.map((h) => h.trim()) ?? [];
  const mapping = detectMapping(headers);
  const outcomes: RowOutcome[] = [];
  const counts = { create: 0, update: 0, duplicate: 0, error: 0 };

  if (!headers.length) {
    return { headers, mapping, outcomes, counts };
  }
  if (mapping.name === undefined || (mapping.phone === undefined && mapping.email === undefined)) {
    outcomes.push({ row: 1, kind: 'error', message: 'Faltan columnas obligatorias: nombre y teléfono o email.' });
    counts.error++;
    return { headers, mapping, outcomes, counts };
  }

  const known = [...opts.existing];
  const get = (r: string[], f: ImportField) => {
    const i = mapping[f];
    return i === undefined ? '' : (r[i] ?? '').trim();
  };

  rows.forEach((r, i) => {
    const rowNum = i + 2; // 1-based + header
    const name = get(r, 'name');
    const phoneRaw = get(r, 'phone');
    const emailRaw = get(r, 'email');
    const phoneE164 = normalizeArPhone(phoneRaw);
    const email = normalizeEmail(emailRaw);
    const org = resolveOrg(get(r, 'organization'), opts.defaultOrg);

    const errors: string[] = [];
    if (!name) errors.push('sin nombre');
    if (!phoneE164 && !email) errors.push(phoneRaw || emailRaw ? 'teléfono/email inválido' : 'sin teléfono ni email');
    if (!org) errors.push('concesionario no reconocido');
    if (errors.length || !org) {
      outcomes.push({ row: rowNum, kind: 'error', message: errors.join(', ') });
      counts.error++;
      return;
    }

    const match = known.find(
      (l) => l.organizationId === org && ((phoneE164 && l.phoneE164 === phoneE164) || (email && l.email === email)),
    );
    const model = get(r, 'model');
    if (match) {
      const changes: Partial<Lead> = {};
      if (model && match.modelInterest !== model) changes.modelInterest = model;
      if (email && !match.email) changes.email = email;
      if (phoneE164 && !match.phoneE164) changes.phoneE164 = phoneE164;
      if (Object.keys(changes).length) {
        outcomes.push({ row: rowNum, kind: 'update', leadId: match.id, changes, name: match.name });
        Object.assign(match, changes);
        counts.update++;
      } else {
        outcomes.push({ row: rowNum, kind: 'duplicate', leadId: match.id, name: match.name });
        counts.duplicate++;
      }
      return;
    }

    const base = {
      id: opts.newId(),
      organizationId: org,
      name,
      phoneE164,
      email,
      source: get(r, 'source') || 'CSV Tecnom',
      campaignId: get(r, 'campaign') || undefined,
      modelInterest: model || undefined,
      status: 'new' as const,
      createdAt: opts.now,
      updatedAt: opts.now,
    };
    const { score, reason } = scoreLead(base);
    const lead: Lead = { ...base, score, scoreReason: reason };
    known.push(lead);
    outcomes.push({ row: rowNum, kind: 'create', lead });
    counts.create++;
  });

  return { headers, mapping, outcomes, counts };
}
