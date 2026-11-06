# AutoGrowth OS — Codex handoff

**Site privado actual:** https://autogrowth-os-mvp-guille.dana-guillermina.chatgpt.site

Este repositorio contiene el MVP visual interactivo que se recreó de los screenshots de agosto de 2026. El frontend actual (`dist/`) es HTML/CSS/JS estático, usa datos demo y `localStorage`; no implementa autenticación real, bases de datos multi-tenant ni integración con Ads/WhatsApp. La documentación adjunta permite llevarlo a una aplicación full-stack reproducible.

## Para Codex

1. Leer `AGENTS.md` completo.
2. Abrir las seis imágenes en `docs/reference-screenshots/` y contrastarlas con `docs/SCREENSHOT_SPEC.md`.
3. Leer `docs/FUNCTIONAL_SPEC.md` y `docs/IMPLEMENTATION_PLAN.md`.
4. Auditar `dist/index.html`, `dist/enhanced.js`, `dist/enhanced.css`; ejecutar y probar el prototipo.
5. Implementar de forma incremental y con tests. No sustituir pantallas funcionales por placeholders.

## Preview local

El sitio es estático: servir la carpeta `dist/` con cualquier servidor HTTP local, por ejemplo `npx serve dist`, cuando el entorno permita esa herramienta. `dist/index.html` no requiere build. El manifiesto `.openai/hosting.json` conserva el Site existente; no cambiar `project_id`.

## Lo que incluye hoy

- Navegación por grupos desplegables: HOME, SALES, AI INTELLIGENCE, CAMPAIGNS, CLIENT KNOWLEDGE, POST-SALES & PARTS, SETTINGS.
- Dashboard, leads/pipeline, inbox ficticio, asignación, tareas, registro de documentos, tres cotizadores, Campaign Intelligence, recomendaciones, reportes, base de conocimiento, postventa y paneles administrativos.
- Importación CSV local de leads, exportación CSV, cálculos y persistencia local.

## Lo que falta para producción

- Auth/RBAC/RLS multi-tenant, persistencia SQL, almacenamiento de documentos, audit log, migraciones.
- Captura de leads, deduplicación y mapeo; API Meta Ads real con OAuth/CAPI; Google Ads y canales adicionales.
- IA sobre métricas verificadas, aprobación humana de versiones de prompts, trazabilidad de recomendaciones.
- Conversaciones operativas, turnos, cotizaciones con tarifas/versiones y PDFs, permisos y automatizaciones seguras.

La guía de aceptación y secuencia está desarrollada en los documentos de `docs/`.
