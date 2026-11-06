# Requisitos funcionales MVP → producto

## Núcleo y seguridad

Entidades: `organizations`, `branches`, `users`, `memberships`, `roles`, `audit_events`, `integration_connections`, `sync_jobs`, `import_jobs`, `import_rows`. Cada fila de negocio debe tener `organization_id` y políticas de acceso por tenant. Roles: Super Admin, Dealership Admin, Sales Advisor, Post-Sales & Parts, Read Only. Auditoría de cambios, idempotencia y validaciones server-side. No guardar tokens Ads/WhatsApp en navegador.

## CRM y ventas

- `leads`: identificación, cliente, sucursal, fuente, campaign/ad IDs, nombre, teléfono normalizado, email, consentimiento, modelo, score y explicación, estado, responsable, timestamps, historial.
- Deduplicación por `organization_id` y teléfono E.164 o email normalizado; upsert seguro, log de merges y posibles conflictos.
- Pipelines con etapas configurables; asignación a advisors por reglas/round-robin o manual; seguimiento SLA, citas y oportunidades; motivo de pérdida/cierre.
- Conversaciones y mensajes por canal, takeover humano, mapeo de identidad a lead. **En demo sin mensajes reales.**
- Tareas con prioridad, vencimiento, notas, recordatorio y trazabilidad; documentos y acuerdos vinculados a lead/cotización.
- Importador Tecnom CSV: vista previa de mapeo, validación, dry-run, creados/actualizados/duplicados/errores, rollback por lote y auditoría. Nunca escribir a Tecnom sin aprobación expresa.

## Campañas y atribución

- `ad_accounts`, `campaigns`, `ad_sets`, `ads`, `campaign_metrics_daily`, `attribution_links`, `campaign_recommendations`.
- Meta Ads OAuth/Lead Ads/CAPI como integración eventual con permisos, token server-side, refresh/error status y deduplicación por IDs. Google Ads después de Meta. TikTok y LinkedIn en fase posterior.
- Dimensiones: tenant, cuenta, campaña, canal, objetivo, fecha, moneda, gasto, impresiones, clics, leads, CTR, CPC, CPM, CPL, contactados, reservas, ventas y valor.
- Separar leads informados por Ads de leads capturados en CRM. Mostrar discrepancias e incertidumbre. Cálculos: CTR clics/impresiones, CPC gasto/clics, CPM gasto*1000/impresiones, CPL gasto/leads, tasa de contacto/contactados, tasa de reserva, cierre; división por cero → `—`.
- Import/export CSV con schema validado, errores por fila, preview, idempotencia y filtros conservados.

## Intelligence

- Analizador por campaña con payload estructurado: `diagnosis`, `main_issue`, `recommended_action`, `marketing_actions[]`, `sales_actions[]`, `priority`, `evidence[]`, `confidence`, `data_gaps[]`, `model_or_rule_version`, `generated_at`.
- Motor determinista siempre disponible, IA generativa opcional y claramente marcada. Recomendación nunca debe ejecutar campañas ni enviar WhatsApp automáticamente.
- `recommendation_feedback`: útil/no útil, usuario, fecha, comentario; KPIs calculados, no hardcoded.
- `prompt_versions`: tipo de analizador, versión, estado draft/in_review/approved/active/rejected/rolled_back, autor, aprobador, cambios, justificación, rollback; solo Super Admin puede publicar.
- Detectar oportunidades, resúmenes de conversaciones y alertas de datos faltantes sin fabricar eventos que no están en CRM.

## Cotizadores

- Productos: `used_vehicle_quote`, `savings_plan_quote`, `factory_financing_quote`, asociados a cliente, lead, vehículo, precios y documento fuente versionado.
- Usado: marca/modelo/versión/año/km/estado/combustible/transmisión/ubicación/valor mercado, margen, descuento por estado/km, resultado y desglose.
- Plan de fábrica: precio vigente, anticipo, grupo/orden si aplica, cuota ilustrativa vs contractual, adjudicación, gastos; aclaración de condiciones.
- Financiación de fábrica / crédito: TNA, TEA si aplica, cuota, plazo, monto financiado, seguros/gastos/impuestos y costo total. Fórmulas testeadas.
- Documentos mensuales: subir/listar XLSX/PDF, validar esquema y período, versionar, marcar activo y ver histórico; aprobación gerencial para propuesta final.
- PDF con número, vigencia, cláusulas, aprobador y trazabilidad. No enviar presupuestos automáticamente.

## Postventa y conocimiento

- Agenda service: turnos, estados, taller, vehículo, asesor, historial y recordatorios; solicitudes de repuestos y accesorios con inventario eventual.
- Knowledge base con artículos versionados, idioma, modelo, categoría, vigencia, aprobador y búsqueda.
- Configuración por cliente: marcas, sucursales, modelos, canales, SLA y reglas de leads.

## UI y experiencia

- Sidebar desplegable y colapsable; nav móvil; header con selectores globales de cliente, rango, idioma (ES/EN), tema, búsqueda, notificaciones y menú de usuario. `Search` debe buscar entidades permitidas; campana solo alertas reales.
- Rutas profundas y navegación por URL, estado persistido, filtros compartibles, skeletons, vacíos, errores, accesibilidad WCAG AA.
- Diseño sobrio aprobado; logo real y estrella; no personaje CHUI.

## Aceptación mínima automatizada

1. Todas las rutas del mapa cargan sin excepción JS ni elementos muertos.
2. Cambiar cliente filtra leads, campañas, resultados y cotizaciones sin ver datos de otro tenant en API ni UI.
3. Cambiar rango recalcula tarjetas, serie de tiempo y CPL con fixtures verificables.
4. Importar CSV dos veces no duplica leads, reporta conteos y conserva un historial de importación.
5. Una campaña conecta su detalle a diagnóstico, JSON, feedback y acciones de ambos equipos.
6. Un analista crea prompt draft; solo Super Admin puede aprobar/publicar y rollback conserva historial.
7. Cada tipo de cotización calcula/desglosa, guarda borrador y requiere aprobación antes de generar documento final.
8. Demo mode bloquea todos los envíos y escrituras externas; tests prueban ausencia de llamadas de salida.
9. Usuario Read Only no puede modificar estado ni ver acciones de escritura; Sales Advisor no administra integraciones.
10. Mobile y desktop no ocultan campos críticos, ni desbordan lateralmente, ni superponen CTA con navegación.
