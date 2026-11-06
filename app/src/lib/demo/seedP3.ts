import { addDays } from '../domain/dates';
import type { PromptEvent, PromptVersion } from '../domain/types';

/**
 * Versiones de prompt de ejemplo para la demo. El texto es el que usaría el servidor como `system`
 * cuando la IA está habilitada; en la demo nunca se envía a ningún modelo.
 */
const BASE = `Sos analista de crecimiento de un concesionario automotor en Argentina.
Recibís métricas agregadas de una campaña (Ads y CRM) y el diagnóstico del motor de reglas.
No recibís datos personales y no tenés que pedirlos.

Reglas:
- Basá cada afirmación en la evidencia recibida. Si un dato no está, decilo en data_gaps; no lo inventes.
- No prometas resultados ni cifras que no surjan de la evidencia.
- Separá acciones de marketing (pauta, creatividades, formularios) de acciones comerciales (asesores, seguimiento, cotizaciones).
- Ninguna acción se ejecuta sola: escribí recomendaciones para que una persona decida.`;

export const PROMPT_V10 = `${BASE}

Respondé en español rioplatense, breve.`;

export const PROMPT_V11 = `${BASE}
- Si la diferencia entre leads de Ads y del CRM supera el 25%, la prioridad es la captura, antes que la pauta.
- Máximo tres acciones por bloque, ordenadas por impacto.

Respondé en español rioplatense, breve y concreto.`;

export const PROMPT_V12 = `${PROMPT_V11}
- Cuando haya leads sin contactar, sugerí un tiempo de primer contacto objetivo y quién debería hacerlo.`;

export function demoPrompts(today: string): { versions: PromptVersion[]; events: PromptEvent[] } {
  const at = (d: number, h = 10) => `${addDays(today, d)}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const versions: PromptVersion[] = [
    {
      id: 'pv-cardys-10',
      organizationId: 'cardys_fiat',
      name: 'campaign_analyst',
      version: 'v1.0',
      promptText: PROMPT_V10,
      changeNote: 'Versión inicial',
      status: 'rolled_back',
      createdBy: 'mgr-cardys',
      createdByName: 'Gerencia Cardys (demo)',
      approvedByName: 'Usuario demo',
      approvedAt: at(-40),
      submittedAt: at(-41),
      activatedAt: at(-40, 11),
      decidedReason: 'Reemplazada por v1.1',
      createdAt: at(-42),
    },
    {
      id: 'pv-cardys-11',
      organizationId: 'cardys_fiat',
      name: 'campaign_analyst',
      version: 'v1.1',
      promptText: PROMPT_V11,
      changeNote: 'Prioriza la captura cuando la brecha Ads/CRM es grande y limita las acciones a tres.',
      status: 'active',
      createdBy: 'mgr-cardys',
      createdByName: 'Gerencia Cardys (demo)',
      approvedByName: 'Usuario demo',
      approvedAt: at(-20),
      submittedAt: at(-21),
      activatedAt: at(-20, 11),
      createdAt: at(-22),
    },
    {
      id: 'pv-cardys-12',
      organizationId: 'cardys_fiat',
      name: 'campaign_analyst',
      version: 'v1.2',
      promptText: PROMPT_V12,
      changeNote: 'Agrega objetivo de primer contacto para leads sin gestionar.',
      status: 'in_review',
      createdBy: 'mgr-cardys',
      createdByName: 'Gerencia Cardys (demo)',
      submittedAt: at(-1),
      createdAt: at(-2),
    },
    {
      id: 'pv-overland-10',
      organizationId: 'overland_motors',
      name: 'campaign_analyst',
      version: 'v1.0',
      promptText: PROMPT_V10,
      changeNote: 'Versión inicial',
      status: 'active',
      createdBy: 'mgr-overland',
      createdByName: 'Gerencia Overland (demo)',
      approvedByName: 'Usuario demo',
      approvedAt: at(-30),
      submittedAt: at(-31),
      activatedAt: at(-30, 11),
      createdAt: at(-32),
    },
  ];
  const ev = (versionId: string, fromStatus: PromptEvent['fromStatus'], toStatus: PromptEvent['toStatus'], actorName: string, createdAt: string, reason?: string): PromptEvent => ({
    id: `${versionId}-${toStatus}-${createdAt}`,
    versionId,
    fromStatus,
    toStatus,
    actorName,
    reason,
    createdAt,
  });
  const events: PromptEvent[] = [
    ev('pv-cardys-10', undefined, 'draft', 'Gerencia Cardys (demo)', at(-42), 'Versión inicial'),
    ev('pv-cardys-10', 'draft', 'in_review', 'Gerencia Cardys (demo)', at(-41)),
    ev('pv-cardys-10', 'in_review', 'approved', 'Usuario demo', at(-40)),
    ev('pv-cardys-10', 'approved', 'active', 'Usuario demo', at(-40, 11)),
    ev('pv-cardys-11', undefined, 'draft', 'Gerencia Cardys (demo)', at(-22)),
    ev('pv-cardys-11', 'draft', 'in_review', 'Gerencia Cardys (demo)', at(-21)),
    ev('pv-cardys-11', 'in_review', 'approved', 'Usuario demo', at(-20)),
    ev('pv-cardys-10', 'active', 'rolled_back', 'Usuario demo', at(-20, 11), 'Reemplazada por v1.1'),
    ev('pv-cardys-11', 'approved', 'active', 'Usuario demo', at(-20, 11)),
    ev('pv-cardys-12', undefined, 'draft', 'Gerencia Cardys (demo)', at(-2)),
    ev('pv-cardys-12', 'draft', 'in_review', 'Gerencia Cardys (demo)', at(-1)),
    ev('pv-overland-10', undefined, 'draft', 'Gerencia Overland (demo)', at(-32), 'Versión inicial'),
    ev('pv-overland-10', 'draft', 'in_review', 'Gerencia Overland (demo)', at(-31)),
    ev('pv-overland-10', 'in_review', 'approved', 'Usuario demo', at(-30)),
    ev('pv-overland-10', 'approved', 'active', 'Usuario demo', at(-30, 11)),
  ];
  return { versions, events };
}
