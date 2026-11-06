# AutoGrowth OS · app (fases P0 + P1 + P2 + P3)

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
| `npm test` | Dominio: métricas, rangos, finanzas (francés, plan de ahorro, usados), recomendaciones, importador CSV, teléfonos, permisos, datos demo, tareas (vencimientos/orden), cotizaciones (transiciones, autoaprobación, vigencia), listas de precios, importador de métricas (Meta/Google CSV, es/en), conciliación Ads↔CRM, normalización de Meta Insights, state OAuth firmado; en P3: diagnóstico rules-v2 con contrato JSON, confianza y datos faltantes, fusión con IA sin tocar evidencia, respaldo de reglas, transiciones de prompts, diff, feedback y aprendizaje, oportunidades y alertas de datos; en P4: turnos (transiciones, superposición de box, patentes, recordatorio), repuestos (pasos y demoras), conocimiento (nadie aprueba lo propio, búsqueda sin acentos, vigencia, versiones), consentimiento y ventana de 24 h, hilos del inbox y mediana de respuesta |
| `npm run test:db` | Levanta un Postgres temporal, aplica `supabase/migrations/*` y corre `supabase/tests/*_test.sql` (aislamiento por organización, roles, governance de prompts, auditoría; en P1: tareas, historial, cotizaciones con aprobación, listas de precios, alta de miembros; en P2: lotes de métricas transaccionales y reversibles, integraciones y tokens inaccesibles desde la API; en P3: corridas inmutables, IA solo con prompt activo, feedback uno por usuario y sin cruzar organizaciones, historial de prompts escrito por trigger, edición de borradores solo por el autor; en P4: turnos sin superposición ni fechas pasadas y con historial por trigger, repuestos con pasos validados, conocimiento con una sola versión publicada y sin autoaprobación, consentimiento solo agregable, mensajes inmutables que respetan consentimiento y ventana de 24 h, aislamiento entre concesionarios) |
| `npm run build` | Build de producción |
| `npm run test:e2e` | Con la app corriendo (`BASE_URL=…`): rutas, filtros globales, alta/validación, motivo de pérdida, importación idempotente + rollback, roles, mobile, sin requests externas. `e2e/p1.mjs`: ficha del lead, tareas, listas de precios, flujo de aprobación de cotizaciones, propuesta imprimible, usuarios y roles. `e2e/p2.mjs`: importación de métricas, idempotencia, detalle de campaña, canal, lotes y reversión, Meta apagada en demo. `e2e/p3.mjs`: recomendaciones con motor visible y JSON, feedback persistente, revisión/aprobación/publicación/rollback de prompts por rol, oportunidades → tarea, alertas de datos, IA apagada en demo. `e2e/p4.mjs`: agenda por box, avance y cancelación con motivo, conflicto de box, recordatorio como tarea, circuito de repuestos, revisión/aprobación de artículos con diff, inbox con consentimiento revocado, ventana de Instagram, roles y mobile |

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

## Qué incluye P1

- **Ficha del lead** (clic en el nombre en Leads o Pipeline): datos, tareas, cotizaciones e historial. El historial lo escriben triggers de la base (alta, cambio de estado, asignación, tareas, cotizaciones, importación); a mano solo se agregan notas.
- **Tareas** (`/tasks`): vencidas primero, filtros por vista y responsable, prioridad, completar/reabrir. El Command Center avisa vencidas.
- **Cotizadores** (`/quotes`): financiación (francés), plan de ahorro y toma de usado. El precio sale de la lista activa de la organización. Flujo borrador → pendiente → aprobada/rechazada (con motivo). Aprueba un gerente o Super Admin, nunca el autor (salvo Super Admin). Vigencia 7 días. Propuesta imprimible en `/quotes/view?id=`, marcada como NO VÁLIDA si no está aprobada o venció.
- **Documentos** (`/documents`): listas de precios CSV con vista previa y validación (filas repetidas, precios inválidos). Una sola versión activa por categoría; activar archiva la anterior.
- **Usuarios** (`/users`): alta por email con roles que el rol actual puede otorgar (un gerente no crea administradores) y baja.
- Migración `supabase/migrations/0003_sales_ops.sql`: `lead_activities`, extensiones de `tasks`, `price_documents`, `quotes` con numeración por organización, RPCs `quote_transition`, `activate_price_document`, `add_member_by_email`, auditoría por triggers.
- Los precios de las listas demo son **ficticios**; no son precios comerciales.

## Qué incluye P2

- **Importar métricas** (Campañas o Canales conectados): CSV de Meta Ads Manager o Google Ads, en español o inglés, con desglose por día. Detecta plataforma y moneda, suma filas por anuncio al total diario de la campaña, rechaza filas de varios días, fechas futuras y valores inválidos, y muestra qué es nuevo, qué corrige y qué no cambia. Al confirmar se guarda un lote; reimportar el mismo archivo no cambia nada.
- **Lotes reversibles**: se revierte el más reciente de cada plataforma; restaura valores anteriores y borra las campañas que creó el lote. En Supabase la importación es una sola RPC transaccional (`import_campaign_metrics`) y nadie escribe métricas fuera de un lote.
- **Conciliación Ads ↔ CRM**: columna en Campañas (Concilia / Revisar / Fuga) con umbrales en `src/lib/domain/reconcile.ts` (10% y 25%, ignora diferencias de ±2). El Command Center avisa campañas con fuga, días sin métricas y hasta qué fecha hay datos.
- **Filtro global de canal** (`?ch=meta|google`) en Command Center, Campañas y detalle; se conserva al navegar.
- **Detalle de campaña** (`/campaigns/view`): KPIs, CPL de plataforma vs. CPL real (sobre leads del CRM), costo por venta, gráfico diario, diagnóstico y desglose diario exportable. Los días sin métricas se marcan, no se estiman.
- **Métricas por canal** (`/channels`): Meta vs. Google por concesionario, sin mezclar cuentas.
- **Meta en sandbox** (`/integrations` + `src/app/api/integrations/meta/*`): OAuth con `ads_read`, state firmado (HMAC, 10 min), canje del código y token de larga duración en el servidor, `appsecret_proof`, prueba real de la cuenta antes de marcarla conectada, sincronización de Insights por día con la identidad del usuario. Solo cuentas listadas en `META_ALLOWED_AD_ACCOUNTS`. Los tokens viven en `integration_secrets` (sin acceso para usuarios). En modo demo todo esto responde 503 y la UI lo muestra desactivado.
- Migración `supabase/migrations/0004_campaign_intelligence.sql`.

### Probar Meta en sandbox (no se hizo todavía)

1. Crear una app de Meta en modo desarrollo con el producto Marketing API y agregar `META_REDIRECT_URI` como URI de redirección válida.
2. Completar las variables de Meta en `.env.local` (ver `.env.example`), con `NEXT_PUBLIC_DEMO_MODE=false` y Supabase local.
3. En Canales conectados, ingresar la cuenta `act_…` autorizada y conectar. Solo queda "Conectada y probada" si Meta responde la consulta de la cuenta.

## Qué incluye P3

- **AI Growth Recommendations** (`/recommendations`): una ficha por campaña con prioridad, motor (reglas, respaldo o IA), área del problema (pauta, captura al CRM, gestión comercial, datos) y confianza. Tres columnas (diagnóstico, problema, acción), acciones separadas para marketing y para ventas, datos faltantes, KPIs de Ads y del CRM, y "Ver JSON" con el contrato del spec validado con zod (`RecommendationJsonSchema`). El CPL real usa leads del CRM; no se inventan turnos ni tiempos de respuesta que el CRM no registra.
- **Motor de reglas `rules-v2`** (`src/lib/domain/recommendations.ts`): evidencia numérica, ventana analizada y confianza que baja con pocos días de métricas, sin leads en CRM o sin métricas.
- **IA opcional, solo servidor** (`/api/ai/analyze`, `src/lib/ai/*`): Claude (`claude-opus-5-5` por defecto) con salida estructurada validada. Recibe solo agregados (sin nombres, teléfonos ni emails), usa la versión de prompt **activa** de AI Governance y no puede cambiar la evidencia ni subir la confianza. Si no hay prompt activo, no hay métricas, el modelo falla o la respuesta no cumple el contrato, se guarda y muestra el diagnóstico de reglas con el motivo. Apagada salvo `NEXT_PUBLIC_DEMO_MODE=false` + `AI_ANALYSIS_ENABLED=true` + `ANTHROPIC_API_KEY`. Ninguna recomendación ejecuta campañas ni envía mensajes.
- **Feedback persistente**: útil / no útil con comentario. La primera respuesta guarda la corrida (snapshot inmutable) y el feedback queda atado a ella; responder de nuevo cambia la respuesta propia.
- **AI Governance** (`/governance`): KPIs calculados (feedback, tasa útil, versiones activas y en espera, diagnósticos guardados), lista de versiones con autor y aprobador, diff contra la versión activa, historial inmutable con usuario, fecha y motivo, y aprendizaje a partir del feedback (no saca conclusiones con menos de 5 respuestas). Flujo: borrador (Super Admin o Gerente) → revisión (autor) → aprobar / rechazar con motivo → publicar → volver a una versión anterior con motivo. Solo Super Admin aprueba, publica o vuelve atrás; nada se promueve solo.
- **Oportunidades detectadas** (`/opportunities`): leads calientes sin contactar (24 h a 30 días), negociaciones sin movimiento ni tarea, cotizaciones aprobadas sin cierre o vencidas, perdidos por precio con lista nueva. Cada una con evidencia y botón para crear la tarea.
- **Alertas de datos faltantes** (`/data-alerts`): leads sin teléfono ni email, nuevos sin asesor, leads de pauta sin campaña, campañas activas con métricas viejas, campañas con leads en Ads y ninguno en el CRM, cotizaciones en borrador viejas. Con cantidad, ejemplos y cómo corregir.
- Migración `supabase/migrations/0005_ai_intelligence.sql`: `recommendation_runs` (sin update ni delete), `recommendation_feedback`, `prompt_version_events` (lo escribe un trigger), RPC `prompt_update_draft` y vista `prompt_versions_named`.

### Probar la IA (no se hizo todavía)

1. Con Supabase local y `NEXT_PUBLIC_DEMO_MODE=false`, completar `AI_ANALYSIS_ENABLED=true` y `ANTHROPIC_API_KEY` en `.env.local` (ver `.env.example`).
2. Publicar una versión del prompt "Analista de campañas" en AI Governance.
3. En AI Growth Recommendations, elegir una campaña con métricas y "Ejecutar análisis IA". La corrida queda guardada con la versión de prompt y el modelo.

## Qué incluye P4 (primera parte: postventa, conocimiento e inbox)

- **Turnos de taller** (`/service`): agenda del día agrupada por box, próximos 14 días y cerrados. Alta con validación (patente argentina normalizada, kilometraje, no en el pasado) y aviso de superposición en el mismo box; la base lo vuelve a impedir (`23P01`). Estados: agendado → confirmado → recibido → en taller → listo → entregado, más cancelado y "no se presentó" (solo después de la hora), ambos con motivo obligatorio. Cada cambio queda en el historial del turno y en el del lead. El recordatorio es una **tarea interna** 24 h antes: no se envía nada al cliente.
- **Repuestos y accesorios** (`/parts`): pedido → cotizado (precio obligatorio) → pedido a fábrica (con llegada estimada) → recibido → entregado, o cancelado con motivo. Marca los pedidos demorados. El vendedor puede pedir; Postventa, Gerente y Super Admin gestionan. Los precios se cargan a mano: no hay lista de fábrica conectada.
- **Base de conocimiento** (`/knowledge`): artículos por categoría y modelo, con vigencia y versiones. Búsqueda sin acentos que exige todas las palabras y prioriza el título. Borrador → revisión → aprobado (archiva la versión anterior) o devuelto con comentario. Solo Gerente o Super Admin aprueban, y **nunca lo que escribieron**. La revisión muestra el diff contra la versión publicada.
- **Inbox de conversaciones** (`/inbox`): **registro manual**, no envía ni recibe mensajes. Hilos con los que esperan respuesta primero, mediana de tiempo de respuesta medida sobre lo registrado, consentimiento de WhatsApp y email como eventos que solo se agregan (otorga / revoca, con origen y evidencia). Una respuesta por WhatsApp o email exige consentimiento vigente; por Instagram o Messenger, que el cliente haya escrito en las últimas 24 h. Todo se valida también en la base.
- Roles: nuevas acciones `service:*`, `parts:*`, `knowledge:*` y `conversation:log` en `src/lib/domain/permissions.ts`, espejadas en las políticas RLS.
- Migración `supabase/migrations/0006_postventa_inbox.sql`: `service_appointments` + `appointment_events`, `parts_requests`, `knowledge_articles`, `consent_events`, `conversation_messages`; RPCs `appointment_transition`, `parts_transition`, `knowledge_update_draft`, `knowledge_transition`; triggers de validación, historial y auditoría.

## Pendiente (siguientes fases)

- P2 restante: probar Meta contra una app y cuenta reales de sandbox (requiere credenciales y autorización); Lead Ads y CAPI; Google Ads API; refresco programado de la sincronización.
- P3 restante: probar el análisis con IA contra la API real (requiere clave y autorización); registrar la hora del primer contacto para medir tiempo de respuesta; resúmenes de conversaciones (dependen del inbox de P4).
- P4 restante: conectar WhatsApp Business, Instagram y Messenger con webhooks firmados (requiere autorización explícita; hoy el inbox es manual); resúmenes de conversaciones con IA; reportes PDF; billing y planes; monitoreo y backups.
- En Supabase, la importación de **leads** todavía hace varias llamadas seguidas (la de métricas ya es transaccional); conviene moverla a una RPC antes de usarla con datos reales.
