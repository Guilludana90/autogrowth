# Plan de implementación para Codex

## P0 — Auditoría y fundación

- Capturas comparadas en checklist con pantallas actuales.
- Modularizar el frontend; tests de navegación, selectores, cotizadores y recomendación.
- Introducir DB y migraciones; tenants/usuarios/RBAC/RLS; distinguir DEMO_MODE de integración real.
- Semillas reproducibles, incluyendo snapshots históricos **etiquetados**, no mezclados.

**Salida:** login, aislamiento por tenant, CRUD persistente y CI verde.

## P1 — Operación CRM y Sales

- Leads, pipeline, asignaciones, tareas, timeline y auditoría.
- CSV Tecnom con preview/mapeo/idempotencia y reporte de errores.
- Borradores de documentos, acuerdos y tres cotizadores con fuentes versionadas y tests financieros.

**Salida:** flujo completo lead → asesor → seguimiento → cotización → revisión.

## P2 — Campaign Intelligence y Command Center

- Importador de métricas y normalización diaria; filtros globales de cliente, canal, rango.
- Dashboard derivado de datos, detalles de campañas, exportación y breakdown.
- Meta OAuth/sync en sandbox, sin tocar cuentas activas hasta prueba y autorización específica.

**Salida:** discrepancias Ads/CRM visibles, KPIs reproducibles y verificables.

## P3 — Intelligence + Governance

- Diagnóstico reglas/IA trazable, JSON validado y confidence/data gaps.
- Feedback persistente, oportunidades y alertas.
- Versionado de prompts con revisión humana, publicación explícita y rollback.

**Salida:** diagnóstico explica tanto pauta como embudo comercial; ninguna acción autónoma no autorizada.

## P4 — Postventa, multicanal y SaaS

- Service, parts, knowledge base, roles más granulares, reportes PDF.
- WhatsApp/IG/Messenger, Google/TikTok/LinkedIn por fases, cada una con consentimiento, webhooks seguros, reintentos, observabilidad, límites de cuota y pruebas.
- Billing/planes, monitoreo, backups, métricas operativas, seguridad y documentación de despliegue.

**Salida:** piloto auditable, luego onboarding multicliente.

## Primer prompt de Codex

> Abrí AGENTS.md y revisá las seis capturas de docs/reference-screenshots junto con SCREENSHOT_SPEC.md y FUNCTIONAL_SPEC.md. Compará visual y funcionalmente cada pantalla con dist/. Creá una matriz de brechas y empezá implementando P0 y la parte crítica de P1. No hagas un simple rediseño: cada botón, filtro, estado y flujo debe estar conectado a datos y tests. Conservá el logo y estilo sobrio, usá estrella ✧ y no agregues un robot o chatbot CHUI flotante. Trabajá con Cardys/Overland como únicas organizaciones piloto, sin tocar Tecnom/WhatsApp en producción. Entregá cambios verificables, capturas de QA y lista explícita de integraciones pendientes.
