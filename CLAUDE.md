# AutoGrowth OS — instrucciones para Claude Code

Tu tarea es transformar el MVP estático de `dist/` en un CRM SaaS automotriz full-stack manteniendo el diseño que aprobó Guillermina Dana.

## Leer antes de modificar código

1. `docs/reference-screenshots/` — abrir **las seis imágenes**, una por una.
2. `docs/SCREENSHOT_SPEC.md` — correspondencia exacta screenshot→pantalla, campos y acciones.
3. `docs/FUNCTIONAL_SPEC.md` — reglas y criterios de aceptación.
4. `docs/IMPLEMENTATION_PLAN.md` — secuencia P0–P4.
5. `AGENTS.md` — restricciones y controles de seguridad.
6. `dist/index.html`, `dist/enhanced.css`, `dist/enhanced.js` — implementación actual.

## Decisiones innegociables

- Diseño oscuro **sobrio** (carbón/índigo/lavanda), estrellita `✧`, logo real `dist/autogrowth-logo.png`.
- **Sin personaje flotante de CHUI.** Conservar análisis, recomendaciones y AI Governance como capacidades sin mascota.
- Solamente dos organizaciones piloto: `cardys_fiat` y `overland_motors`. No inventar clientes activos.
- No intervenir Tecnom ni WhatsApp operativos. `DEMO_MODE=true` desactiva envíos/sync externo.
- Los números de las capturas pertenecen a snapshots históricos *distintos*. Nunca presentarlos como métricas actuales ni mezclarlos.
- Tokens y secretos solo en servidor. RLS por organización; auditoría y control de roles.

## Qué entregás

Implementación funcional en Next.js/React/TypeScript + Supabase (o una alternativa explícitamente justificada), tests, migraciones, seeds y guía de ejecución. Todo botón visible debe tener resultado real, validación y estados loading/error/empty. No declarar conectada ninguna integración sin prueba.

## Primer ciclo de trabajo

1. Auditá las seis imágenes y creá una tabla `pantalla / componente / comportamiento / estado actual / brecha / test`.
2. Inicializá una app modular en una **carpeta nueva** `app/` sin borrar ni alterar `dist/` hasta verificar paridad.
3. Aplicá el esquema inicial `scaffold/supabase/migrations/0001_core.sql` en una base local de desarrollo, nunca en producción por defecto.
4. Portá layout, sidebar, header, filtros de organización/fecha, dashboard y campañas; implementá guards de roles.
5. Portá leads, asignación, tareas, cotizadores y recomendaciones con tests.
6. Implementá AI Governance: prompt draft → review → approve/reject → activate/rollback con aprobación exclusiva Super Admin.
7. Mostrá un preview, corré tests y documentá lo hecho vs. pendiente.

## Contratos iniciales de ejemplo

- `scaffold/src/lib/finance.ts`: cuotas sistema francés y valuación estimativa de usado, sin precios comerciales inventados.
- `scaffold/src/lib/recommendations.ts`: diagnóstico basado en reglas con evidencia y faltantes de datos.
- `scaffold/src/types/domain.ts`: tipos de dominio.
- `scaffold/supabase/migrations/0001_core.sql`: esquema base multiempresa y políticas RLS.

No confundas este scaffold con un backend de producción completado: amplialo, testealo e integralo antes de exponer operaciones reales.
