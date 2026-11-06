# Auditoría visual y funcional de las seis capturas originales

**Método:** observación directa de los PNG originales. Los datos visibles son históricos de agosto de 2026 y no una fuente de métricas actuales. Lo que está fuera del recorte se describe como *por definir*, no se inventa.

## Elementos compartidos de escritorio

- Sidebar fija izquierda de ~355 px en capturas 1890×850. Encabezado `2B AUTOGROWTH OS`, subtítulo `Super Admin`, control para colapsar; navegación jerárquica y sección activa destacada.
- Header superior: logo al inicio del área de contenido, título de pantalla y subtítulo por cliente, selector `Language EN`, selector de cliente `Cardys - Fiat`, rango de fechas `Aug 1 — Aug 12`, alternador de tema, búsqueda, campana con contador `4`, usuario `Dana Guillermina / Super Admin`.
- UI original: índigo oscuro, paneles degradados violeta, bordes púrpura, tipografía geométrica, píldoras y esquinas redondeadas, dorado/amarillo para CTA/prioridad. **Implementación aprobada posterior:** diseño más sobrio y logo real, estrella ✧ y sin robot/muñequito CHUI.
- Comportamiento requerido: los filtros globales afectan todas las pantallas relevantes; fecha y cliente deben mantener selección al navegar, cambiar el título contextual y recalcular datos. Usuario/rol condiciona permisos, no solo la etiqueta visual.

## 01 — Command Center

Archivo: `reference-screenshots/01-command-center.png`

**Se ve:** `HOME > Command Center` desplegado; título `Welcome to 2B AutoGrowth OS`; subtítulo sobre performance, leads y turnos; `AI PRIORITY SCORE 92`; cuatro tarjetas `TOTAL SPENT $10,835`, `LEADS GENERATED 3`, `COST PER LEAD $3611.67`, `APPOINTMENTS BOOKED 0`. Tarjeta de tendencia `30 DAY TREND / Lead performance` con gráfico y panel `AI Growth Recommendations` con una señal MEDIUM sobre ventas perdidas después de concertar una cita.

**Lógica objetivo:** agregación por período/cliente/plataforma. `CPL = gasto atribuible / leads atribuibles` con manejo de división por cero. Diferenciar sincronizaciones Meta (90 campañas en el ejemplo) de leads recientes CRM. El score 92 debe tener reglas/versión, timestamp, factores y explicación, no un número fijo. Gráfico con serie temporal y filtros. Recomendación clickeable hacia detalle. Estados vacío, loading, error, stale sync.

**Brecha actual:** dashboard demostrativo, barras ilustrativas, sin serie temporal real ni fórmula de priority score ni sincronización.

## 02 — Campaign Intelligence

Archivo: `reference-screenshots/02-campaign-intelligence.png`

**Se ve:** `CAMPAIGNS` desplegado con `Campaign Intelligence`, `Channel Metrics`, `Export Reports`. Cabecera `CAMPAIGN LEDGER / Active and recent campaigns`; tabs `All`, `Meta Ads`, `Google Ads`; un selector adicional `All`; botones `Export metrics` y `Import metrics`. Tabla `CAMPAIGN`, `PLATFORM`, `SPEND`, `LEADS`, `CPL`, `CTR`, `STATUS` y menú de acciones `…` por fila. Ejemplos `CP_WHATS_VENTA CONVECIONAL_MAYO` (captura muestra `5897.36`, 2 leads, `2948.68` CPL y `2.28%` CTR), `SECUENCIA_PDA_MAYO- JUNIO` (`4937.64`, 1 lead, `4937.64`, `1.66%`), campañas pausadas en cero.

**Lógica objetivo:** importador con validación de columnas, moneda, período, identificador estable de cuenta/campaña y deduplicación/upsert; exportación del filtro aplicado; tabs por plataforma; selector de estado/objetivo (valor exacto no legible en imagen, elegir semántica documentada); búsqueda, orden, paginación, abrir detalles, sincronización identificada y timestamps. `spend`, `leads`, `ctr` y `cpl` deben ser derivados de la misma ventana temporal.

**Brecha actual:** tabla snapshot y exportación; importación solo valida y no guarda métricas, no hay paginación/sort ni sync real.

## 03 — AI Growth Recommendations

Archivo: `reference-screenshots/03-ai-recommendations.png`

**Se ve:** `AI INTELLIGENCE` expandido con `CHUI Recommendations`, `Conversation Summaries`, `Detected Opportunities`, `Missing Data Alerts`. Barra con dropdown `All campaigns`, estado `RULES FALLBACK`, botones `View JSON`, `Run AI analysis`. Ficha para `CP_WHATS_VENTA CONVECIONAL_MAYO` con `MEDIUM PRIORITY`, CPL `$2948.68`, CTR `2.28%`, BOOKED 0, CLOSED 0. Tres columnas `PERFORMANCE DIAGNOSIS`, `MAIN ISSUE DETECTED`, `RECOMMENDED ACTION`. Dos bloques separados para `Marketing team` y `Sales / advisor team`. Footer con spend, impresiones, CPC, CPM, response time, contactados y feedback útil/no útil.

**Lógica objetivo:** diagnosticar de campañas+CRM con evidencia y ventana temporal, detectar leads que conversan fuera del CRM, separar problema de medios del de ventas, acciones asignables por equipo, almacenar feedback, detectar datos faltantes, exponer JSON estructurado validado, dar fallback por reglas cuando IA no esté disponible, versionar reglas/modelo y registrar análisis. No inventar contactos o cierres si la plataforma solo informa leads. Renombrar `CHUI Recommendations` a `AI Growth Recommendations` (sin personaje).

**Brecha actual:** motor de reglas superficial, JSON y feedback visual; no hay persistencia de resultados/feedback ni análisis IA generativo, CPC/CPM reales o vínculo de conversaciones.

## 04 — Sales Quote Tools

Archivo: `reference-screenshots/04-sales-quote-tools.png`

**Se ve:** `SALES` desplegado: `Lead CRM`, `Conversation Inbox`, `Advisor Assignment`, `Follow-ups & Tasks`, `Documents & Agreements`, `Sales Quote Tools`. Tres tabs: `Used Vehicle Quote`, `Savings Plan Quote`, `Factory Financing Quote`. Cotización usado con campos BRAND Fiat, MODEL Argo, TRIM Precision 1.8, YEAR 2019, MILEAGE 94000, CONDITION Good, FUEL TYPE Gasoline, TRANSMISSION Manual, LOCATION Buenos Aires, ESTIMATED MARKET VALUE 18600000 y `BREAKAGE / TRADE-IN MARGIN %` parcialmente visible. Panel derecho `ESTIMATE SUMMARY`, `View Calculation`, advertencia de confirmación gerencial y `Monthly Documents` con tabs `PDA` y `Factory Financing`; registro activo de un XLSX con fechas y número de filas.

**Lógica objetivo:** tres cotizadores independientes que comparten cliente, modelo, versión de lista de precios y aprobaciones. Usados: valor de mercado, depreciación/ajustes trazables, estado/km/margen, propuesta editable, aprobación gerencial. Plan fábrica: anticipo, integración con lista vigente, adjudicación pactada, cuotas y costos contractuales. Convencional: crédito, TNA, plazo, gastos, cronograma y total. Guardar versiones, generar PDF, registrar aceptación/rechazo. Documentos mensuales con categoría, fecha inicio/fin, filas importadas, estado activo y aprobación. No usar cifras de screenshot como precio actual.

**Brecha actual:** cálculo matemático orientativo y registros de metadatos sin archivo; falta flujo de aprobación, XLSX real, versiones, PDFs y cotizaciones persistentes.

## 05 — AI Governance / Continuous Improvement

Archivo: `reference-screenshots/05-ai-governance.png`

**Se ve:** `SETTINGS` expandido: `Customer-Facing Agent`, `Connected Channels`, `Users & Roles`, `Integrations`, `System Status`, `Client Settings`, `CHUI Continuous Improvement`, `Clients`. Cabecera de mejora continua gobernada: el sistema nunca modifica prompts de producción solo; todo cambio queda como draft hasta aprobación Super Admin. KPI `RECOMMENDATION FEEDBACK 18`, `USEFUL RATE 84%`, `PROMPT VERSIONS 7` (2 active, 1 awaiting approval). Lista `Prompt Versions`, ejemplo `Campaign recommendation analyst · v3.2 ACTIVE`, autor y aprobador, y panel `Learning insights` con hallazgos basados en feedback.

**Lógica objetivo:** módulo de **AI Governance** (sin personaje CHUI), registro de versiones de prompt, borrador → revisión → aprobación/rechazo → publicación controlada → rollback; historial inmutable con usuario/fecha/motivo; métricas de feedback y aprendizaje; ninguna promoción automática. Integración con recomendaciones. Solo Super Admin aprueba.

**Brecha actual:** esta pantalla específica y su workflow todavía no existen; debe ser prioridad funcional. Los valores 18, 84%, 7 son históricos ilustrativos, no métricas actuales.

## 06 — Legacy compact/mobile recommendation view

Archivo: `reference-screenshots/06-legacy-mobile-recommendations.png`

**Se ve:** header estrecho con menú hamburguesa, logo, título truncado, idioma EN, tema, búsqueda, notificaciones 4, avatar. Heading `THE INTELLIGENCE LAYER / Turn performance signals into action.` Dropdown `All campaigns`, etiqueta `CLAUDE ANALYSIS`, acciones `View JSON`, `Run AI analysis`. Tarjeta campaña con `HIGH PRIORITY`, CPL `$9652.71`, CTR `0.96%`, booked 0, closed 0; diagnóstico menciona spend `$762,564.27`, 79 leads, CPL 6.8% por encima del blended `$9035.99` del account. Bottom tabs `HOME`, `LEADS`, `INBOX`, `PARTS`.

**Lógica objetivo:** diseño responsive con navegación inferior en pantallas pequeñas (siempre priorizar accesibilidad y no tapar contenido); filtros y acciones accesibles con teclado; tarjetas apiladas; diagnóstico completo y estados de motor (`Claude analysis`/fallback), sin robot flotante. Las cifras ilustran una ventana/cuenta diferente de la captura 03: **no combinarlas** como si fueran del mismo dataset.

## Menús inferidos, pero contenidos no visibles

En las capturas se observan los encabezados `HOME`, `SALES`, `AI INTELLIGENCE`, `CAMPAIGNS`, `CLIENT KNOWLEDGE`, `POST-SALES & PARTS`, `SETTINGS`. Los submenús de SALES, AI INTELLIGENCE, CAMPAIGNS y SETTINGS están visibles; `CLIENT KNOWLEDGE` y `POST-SALES & PARTS` están cerrados, por lo que sus opciones actuales en `dist/enhanced.js` son hipótesis de producto y deben validarse con la usuaria antes de tratarlas como reproducción exacta.

### Reglas de no confusión

- Las seis imágenes **no son seis vistas con cifras coherentes entre sí**: muestran fechas, filtros y versiones diferentes.
- El número `4` de notificaciones y valores KPI no prueban que las integraciones sigan activas hoy.
- `CHUI` aparece en capturas históricas, pero la preferencia actual es **sin dibujo/mascota**; mantener inteligencia y governance.
