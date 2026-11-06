# AutoGrowth OS · app (fase P0)

Aplicación Next.js + TypeScript que reemplaza gradualmente al prototipo estático de `../dist/` (que queda intacto como referencia).

## Correr en local

```bash
cd app
npm install
npm run dev            # http://localhost:3000, en modo demo
```

Por defecto `NEXT_PUBLIC_DEMO_MODE=true`: datos ficticios guardados en el navegador, sin login y **sin ninguna llamada externa** (la prueba E2E lo verifica).

## Verificaciones

| Comando | Qué prueba |
|---|---|
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Dominio: métricas, rangos, finanzas (francés, plan de ahorro, usados), recomendaciones, importador CSV, teléfonos, permisos, datos demo |
| `npm run test:db` | Levanta un Postgres temporal, aplica `supabase/migrations/*` y corre `supabase/tests/rls_test.sql` (aislamiento por organización, roles, governance de prompts, auditoría) |
| `npm run build` | Build de producción |
| `npm run test:e2e` | Con la app corriendo (`BASE_URL=…`): rutas, filtros globales, alta/validación, motivo de pérdida, importación idempotente + rollback, roles, mobile, sin requests externas |

## Conectar Supabase (solo desarrollo local hasta autorización)

1. `supabase start` (CLI de Supabase) y aplicar `supabase/migrations/` en orden.
2. Crear usuarios en Auth y sus filas en `profiles` y `memberships` (`organization_id` = `cardys_fiat` u `overland_motors`).
3. Copiar `.env.example` a `.env.local` con `NEXT_PUBLIC_DEMO_MODE=false`, URL y anon key.
4. Ingresar por `/login` (enlace mágico, solo usuarios existentes).

La seguridad está en la base (RLS), no en el cliente: la UI solo oculta acciones que la base igual rechazaría.

## Qué incluye P0

| Pantalla | Estado | Datos | Pruebas |
|---|---|---|---|
| Layout, sidebar, header | Hecho. Filtros de concesionario y rango en la URL (se conservan al navegar y se pueden compartir); selector de rol en demo; menú mobile | — | E2E |
| Command Center | KPIs de Ads y CRM en la misma ventana, gráfico Ads vs. CRM, recomendación prioritaria, leads abiertos, alertas operativas | Derivados, nada hardcodeado | unit + E2E |
| Leads & CRM | Búsqueda, filtros (estado, asesor), orden, alta con validación y deduplicación, estado con motivo de pérdida, asignación de asesor, export CSV, import CSV con vista previa, historial y rollback | Repositorio demo o Supabase | unit + E2E |
| Pipeline | 5 etapas, arrastrar y soltar o selector; "Perdido" pide motivo | Igual que Leads | E2E |
| Campaign Intelligence | Tabs por plataforma, estado, orden, export, diagnóstico por campaña con JSON | Métricas diarias + leads del CRM | unit + E2E |
| Estado del sistema | Estado honesto de cada integración; restaurar demo | — | E2E |
| Login | Enlace mágico de Supabase cuando no es demo | Supabase Auth | — |

Lo que figura en el menú con etiqueta P1–P4 está planificado y no es un link.

## Corrección de la migración del scaffold (`0002_governance_audit_imports.sql`)

- Un Dealership Admin podía insertar un prompt directamente como `active`: ahora toda alta nace en `draft` y los cambios de estado solo pasan por `prompt_transition()` (submit del autor; approve / reject / activate / rollback solo Super Admin; una sola versión activa; rechazo y rollback exigen motivo).
- `audit_events` se completa con triggers y nadie puede escribirla desde la API.
- `updated_at` automático, motivo de pérdida obligatorio, el asesor debe pertenecer a la organización, un lead no cambia de organización.
- Altas de `memberships` (Dealership Admin no crea Super Admins), `profiles`, `campaigns`, `import_jobs` con rollback por lote.

## Pendiente (siguientes fases)

- P1: tareas y seguimientos, cotizadores (las funciones de cálculo ya están en `src/lib/domain/finance.ts` con tests), documentos, usuarios y roles.
- P2: importador de métricas, Meta Ads en sandbox.
- P3: IA generativa opcional sobre el motor de reglas, feedback persistente, pantalla de AI Governance (la base ya está).
- P4: postventa, inbox, WhatsApp con consentimiento.
- En Supabase, la importación hace varias llamadas seguidas; conviene moverla a una RPC transaccional antes de usarla con datos reales.
