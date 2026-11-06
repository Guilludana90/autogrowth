# AutoGrowth OS — instrucciones para Codex

## Objetivo

Recrear mediante código el producto de las seis capturas en `docs/reference-screenshots/`, no solamente sus colores. El objetivo es un CRM SaaS automotriz multicliente, operativo y verificable. Partir del código actual en `dist/` como prototipo; migrarlo gradualmente a una arquitectura de aplicación con backend y datos durables.

## Fuentes de verdad y prioridades

1. `docs/SCREENSHOT_SPEC.md` describe lo que se observa realmente en cada captura (sin inventar partes fuera del encuadre).
2. `docs/FUNCTIONAL_SPEC.md` define el comportamiento objetivo, datos y pruebas de aceptación.
3. El diseño sobrio actualmente publicado **tiene prioridad sobre la saturación visual de los screenshots antiguos**. Mantener fondo carbón, acentos índigo/lavanda y dorado champagne; conservar la estrellita `✧` y el logo real de `dist/autogrowth-logo.png`.
4. **No mostrar ni recrear el personaje/robot flotante de CHUI.** La usuaria aclaró que rechaza el dibujo, no el valor de las capacidades de inteligencia. Renombrar las áreas antiguas de CHUI a AI Growth Recommendations / AI Governance. No incluir chatbot interno flotante.
5. El piloto usa solo dos clientes reales como identidades de organización: `cardys_fiat` (Cardys – FIAT) y `overland_motors` (Overland Motors – Jeep/RAM). Todos los leads y métricas del prototipo son ejemplos, no registros auténticos.
6. No modificar Tecnom ni WhatsApp de producción. Importar CSV manual, reversible y auditado hasta autorización explícita para nuevas integraciones. `DEMO_MODE=true` debe impedir envíos externos.

## Modo de trabajo esperado

- Auditar las seis imágenes contra la implementación antes de escribir lógica nueva. Registrar por pantalla lo implementado, faltante y no visible en la referencia.
- Entregar código ejecutable y tests, no solo wireframes o documentación.
- Convertir elementos aparentes en comportamientos: selects y filtros persistentes, gráficos con períodos reales, navegación, detalles, CRUD, permisos, importación/exportación, cálculo, estados de carga/errores, auditoría y acciones reproducibles.
- No declarar conectada una API sin OAuth, credenciales server-side, verificación de alcance y prueba real; marcarla `not_connected`.
- Separar estrictamente media spend, leads de plataforma, leads CRM, contactos, turnos y ventas. No presentar cifras sintéticas como rendimiento real.
- Asegurar accesibilidad, responsive, privacidad por tenant, idempotencia y validación de entradas.
- Desarrollar por etapas verificables: primero datos/identidad y CRM; luego campañas y cotizadores; después IA y automatizaciones.

## Stack recomendado (sujeto al repositorio real)

Históricamente el MVP utilizaba Next.js 15, React 19, TypeScript, Tailwind, Supabase Auth/PostgreSQL/RLS, OpenAI y Recharts. Si no se dispone del repositorio original, migrar la demo estática con ese stack o equivalente respaldado por tests. Mantener el contrato funcional y no bloquear el prototipo mientras se migra.

## Evidencia antes de entregar

- Ejecutar tests unitarios, de integración y E2E para todos los menús y flujos críticos.
- Crear una matriz screenshot → ruta → componente → datos/API → pruebas.
- Comparar capturas de la app a 1890×850 (desktop) y 900×862 (vista compacta), y probar móvil.
- Documentar qué es demo, qué es real, qué queda sin conexión y qué requiere autorización del negocio.
- No publicar una integración operativa externa ni abrir el Site a público sin solicitud explícita.
