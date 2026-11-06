// E2E de P3 (modo demo): AI Growth Recommendations, feedback persistente, AI Governance, oportunidades y alertas.
// Uso: BASE_URL=http://localhost:3000 node e2e/p3.mjs [carpeta-capturas]
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.argv[2];
const results = [];
const check = (cond, label) => {
  results.push([cond, label]);
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
});
page.on('dialog', (d) => d.accept());
const shot = async (name, fullPage = false) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
const role = async (r) => page.getByLabel('Rol de la demo').selectOption(r);
const toast = (re) => page.locator('.toast').filter({ hasText: re }).first().waitFor();
const version = (v) => page.locator('.versions button').filter({ hasText: `Analista de campañas · ${v}` }).first();
const detail = page.locator('section[aria-labelledby=pd]');

await page.goto(BASE + '/system');
await page.getByRole('button', { name: 'Restaurar datos demo' }).click();
await toast(/restaurados/);

// 1. AI Growth Recommendations
await page.goto(BASE + '/recommendations?org=cardys_fiat');
await page.getByRole('heading', { name: 'AI Growth Recommendations', level: 1 }).waitFor();
check(await page.locator('.toolbar').getByText('Respaldo de reglas').isVisible(), 'en demo se ve el estado Respaldo de reglas');
check(await page.getByRole('button', { name: '✧ Ejecutar análisis IA' }).isDisabled(), 'Ejecutar análisis IA está deshabilitado en demo');
const firstCard = page.locator('article.rec').first();
check((await firstCard.locator('.rec-cols .section-title').allTextContents()).join('|') === 'Diagnóstico|Problema detectado|Acción recomendada', 'la ficha tiene las tres columnas del diagnóstico');
check((await firstCard.locator('.rec-teams .section-title').count()) === 2, 'acciones separadas para marketing y ventas');
check(await firstCard.getByText(/Confianza \d+%/).isVisible(), 'la ficha muestra la confianza');
check((await page.getByText(/CHUI/).count()) === 0, 'sin rastros de CHUI');
await shot('20-recommendations');
await page.getByRole('button', { name: 'Ver JSON' }).first().click();
const jsonText = await page.locator('pre.json').textContent();
check(/"model_or_rule_version": "rules-v2"/.test(jsonText) && /"data_gaps"/.test(jsonText) && /"confidence"/.test(jsonText), 'el JSON sigue el contrato del spec');
await page.keyboard.press('Escape');

// 2. Feedback persistente
await firstCard.getByRole('button', { name: 'Útil', exact: true }).click();
await toast(/marcada como útil/);
await firstCard.getByRole('button', { name: 'No útil' }).click();
const fb = page.getByRole('dialog', { name: '¿Qué no sirvió?' });
await fb.locator('textarea').fill('La acción de pauta no aplica a este mes');
await fb.getByRole('button', { name: 'Guardar feedback' }).click();
await toast(/no útil/);
check(await firstCard.getByText('0/1 útil').isVisible(), 'cambiar la respuesta reemplaza el feedback propio (no lo duplica)');
await page.reload();
await page.locator('article.rec').first().getByText('0/1 útil').waitFor();
check(true, 'el feedback persiste al recargar');

// 3. AI Governance: KPIs calculados y aprendizaje honesto
await page.goto(BASE + '/governance?org=cardys_fiat');
await page.getByRole('heading', { name: 'AI Governance', level: 1 }).waitFor();
const statValue = (label) => page.locator('.stat').filter({ hasText: label }).locator('.value').textContent();
check((await statValue('Feedback de recomendaciones')) === '1', 'KPI de feedback calculado (1)');
check((await statValue('Tasa útil')) === '0%', 'tasa útil calculada (0%)');
check((await statValue('Versiones de prompt')) === '3', 'cuenta las versiones de Cardys');
check(await page.getByText(/hacen falta al menos 5/).isVisible(), 'con poco feedback no saca conclusiones');
check(await page.getByText('“La acción de pauta no aplica a este mes”').isVisible(), 'el comentario no útil llega a Governance');

// 4. Revisión → aprobación → publicación → rollback (Super Admin)
check(await detail.getByRole('heading', { name: /v1\.2/ }).isVisible(), 'abre la versión en revisión');
check((await detail.locator('.diff .add').count()) > 0, 'muestra el diff contra la versión activa');
await shot('21-governance');
await detail.getByRole('button', { name: 'Aprobar' }).click();
await toast(/v1\.2: aprobada/);
await detail.getByRole('button', { name: 'Publicar' }).click();
await page.getByRole('dialog', { name: 'Publicar · v1.2' }).getByRole('button', { name: 'Publicar' }).click();
await toast(/v1\.2: activa/);
check(await version('v1.2').getByText('Activa').isVisible(), 'v1.2 queda activa');
check(await version('v1.1').getByText('Retirada').isVisible(), 'v1.1 queda retirada');
await version('v1.1').click();
await detail.getByRole('button', { name: 'Volver a esta versión' }).click();
const rb = page.getByRole('dialog', { name: 'Volver a esta versión · v1.1' });
await rb.getByRole('button', { name: 'Volver a esta versión' }).click();
check(await rb.getByText(/Escribí el motivo/).isVisible(), 'el rollback exige motivo');
await rb.locator('textarea').fill('v1.2 sugiere tiempos de contacto que no medimos');
await rb.getByRole('button', { name: 'Volver a esta versión' }).click();
await toast(/v1\.1: activa/);
check(await version('v1.1').getByText('Activa').isVisible() && (await version('v1.2').getByText('Retirada').isVisible()), 'el rollback reactiva v1.1');
check(await detail.getByText('“v1.2 sugiere tiempos de contacto que no medimos”').isVisible(), 'el historial guarda el motivo del rollback');

// 5. Gerente: borrador y envío, sin poder aprobar
await role('dealership_admin');
await page.getByRole('button', { name: '+ Nuevo borrador' }).click();
const nd = page.getByRole('dialog', { name: 'Nuevo borrador de prompt' });
check((await nd.getByLabel('Versión *').inputValue()) === 'v1.3', 'sugiere la próxima versión');
await nd.getByRole('button', { name: 'Crear borrador' }).click();
check(await nd.getByText(/Contá qué cambia/).isVisible(), 'el borrador exige nota de cambio');
await nd.getByLabel('Qué cambia y por qué *').fill('Pide separar Plan de Ahorro de venta convencional');
await nd.getByLabel('Texto del prompt (system) *').fill((await nd.getByLabel('Texto del prompt (system) *').inputValue()) + '\n- Separá Plan de Ahorro de venta convencional.');
await nd.getByRole('button', { name: 'Crear borrador' }).click();
await toast(/Borrador v1\.3 creado/);
check(await version('v1.3').getByText('Borrador').isVisible(), 'el borrador nace en estado Borrador');
await detail.getByRole('button', { name: 'Enviar a revisión' }).click();
await toast(/v1\.3: en revisión/);
check((await detail.getByRole('button', { name: 'Aprobar' }).count()) === 0, 'el Gerente no puede aprobar');
check(await detail.getByText('Solo Super Admin aprueba, rechaza, publica o vuelve a esta versión.').isVisible(), 'explica quién aprueba');
await role('super_admin');
await detail.getByRole('button', { name: 'Rechazar' }).click();
const rj = page.getByRole('dialog', { name: 'Rechazar · v1.3' });
await rj.locator('textarea').fill('Falta definir cómo se identifica Plan de Ahorro');
await rj.getByRole('button', { name: 'Rechazar' }).click();
await toast(/v1\.3: rechazada/);
check(await version('v1.3').getByText('Rechazada').isVisible(), 'Super Admin rechaza con motivo');

// 6. Otros roles
await role('sales_advisor');
check((await page.getByRole('button', { name: '+ Nuevo borrador' }).count()) === 0, 'un asesor no crea borradores');
await role('post_sales');
check(await page.getByText('Tu rol no tiene acceso a AI Governance.').isVisible(), 'postventa no accede a Governance');
await role('read_only');
await page.goto(BASE + '/recommendations?org=cardys_fiat');
check(await page.locator('article.rec').first().getByText(/útil|Tu rol no califica/).first().isVisible(), 'solo lectura ve el resultado pero no califica');
check((await page.locator('article.rec').first().getByRole('button', { name: 'No útil' }).count()) === 0, 'solo lectura no tiene botones de feedback');
await role('super_admin');

// 7. Oportunidades y alertas
await page.goto(BASE + '/opportunities?org=cardys_fiat');
await page.getByRole('heading', { name: 'Oportunidades detectadas', level: 1 }).waitFor();
const rows = page.locator('section[aria-labelledby=ops] tbody tr');
const nOps = await rows.count();
check(nOps > 0 || (await page.getByText(/No hay oportunidades/).isVisible()), `oportunidades calculadas (${nOps})`);
if (nOps > 0) {
  await rows.first().getByRole('button', { name: '+ Tarea' }).click();
  const td = page.getByRole('dialog', { name: /Nueva tarea/ });
  await td.locator('input[name=title]').fill('Llamar por oportunidad detectada');
  await td.getByRole('button', { name: /Crear tarea|Guardar/ }).click();
  await toast(/Tarea creada/);
  check(true, 'desde una oportunidad se crea una tarea real');
}
await shot('22-opportunities');
await page.goto(BASE + '/data-alerts?org=cardys_fiat');
await page.getByRole('heading', { name: 'Alertas de datos faltantes', level: 1 }).waitFor();
const nAlerts = await page.locator('.alert-card').count();
check(nAlerts > 0 || (await page.getByText(/No se detectan datos faltantes/).isVisible()), `alertas calculadas (${nAlerts})`);
if (nAlerts > 0) check(await page.locator('.alert-card').first().getByText(/Cómo corregir:/).isVisible(), 'cada alerta dice cómo corregirla');
await shot('23-data-alerts');

// 8. La IA no corre en demo, ni desde la API
const st = await (await page.request.get(BASE + '/api/ai/status')).json();
check(st.enabled === false && /Modo demo/.test(st.reason), 'la API informa IA desactivada en demo');
const an = await page.request.post(BASE + '/api/ai/analyze', { data: { organizationId: 'cardys_fiat', platform: 'meta', campaignId: 'x', from: '2026-10-01', to: '2026-10-31' } });
check(an.status() === 503, 'la API rechaza analizar en demo');

// 9. Navegación
check(await page.getByRole('link', { name: 'AI Governance' }).isVisible(), 'AI Governance está en el menú');
check(await page.getByRole('link', { name: 'Oportunidades detectadas' }).isVisible(), 'Oportunidades está en el menú');

// 10. Mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + '/recommendations?org=cardys_fiat');
await page.locator('article.rec').first().waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check(!overflow, 'Recommendations sin scroll horizontal en mobile');
await shot('24-recommendations-mobile');

check(errors.length === 0, `sin errores de JS${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
check(external.length === 0, 'modo demo sin requests externas');
await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificaciones OK`);
process.exit(failed ? 1 : 0);
