// Prueba E2E de humo sobre la app en modo demo. Uso: BASE_URL=http://localhost:3000 node e2e/smoke.mjs [carpeta-capturas]
// Verifica: todas las rutas cargan sin errores de JS, filtros globales persisten al navegar, rango recalcula KPIs,
// alta de lead con validación, cambio de estado con motivo de pérdida, importación CSV idempotente con rollback,
// y que el rol Solo lectura no ve acciones de escritura. También verifica que no salga ninguna request externa.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

// 1. Rutas
for (const route of ['/', '/leads', '/pipeline', '/campaigns', '/system', '/login']) {
  await page.goto(BASE + route);
  await page.waitForLoadState('networkidle');
  check((await page.locator('h1').count()) > 0, `ruta ${route} renderiza`);
}

// 2. Filtros globales en la URL y persistencia al navegar
await page.goto(BASE + '/');
await page.getByLabel('Concesionario').selectOption('cardys_fiat');
await page.waitForURL(/org=cardys_fiat/);
await page.getByRole('link', { name: 'Leads & CRM' }).click();
await page.waitForURL(/\/leads\?.*org=cardys_fiat/);
check(true, 'el filtro de concesionario se conserva al navegar');
const orgs = await page.locator('tbody tr td:nth-child(2)').allTextContents();
check(orgs.length > 0 && orgs.every((t) => t.includes('Cardys')), 'Leads muestra solo Cardys');

// 3. El rango recalcula los KPIs
await page.goto(BASE + '/?org=cardys_fiat');
await page.getByLabel('Rango de fechas').selectOption('7d');
await page.waitForURL(/from=/);
const spend7 = await page.locator('.stat .value').first().textContent();
await page.getByLabel('Rango de fechas').selectOption('90d');
await page.waitForFunction((prev) => document.querySelector('.stat .value')?.textContent !== prev, spend7);
const spend90 = await page.locator('.stat .value').first().textContent();
check(spend7 !== spend90, `cambiar el rango recalcula inversión (${spend7} → ${spend90})`);
await page.getByLabel('Rango de fechas').selectOption('30d');
await shot('01-command-center');

// 4. Alta de lead con validación
await page.goto(BASE + '/leads?org=cardys_fiat');
await page.getByRole('button', { name: '+ Nuevo lead' }).click();
await page.getByRole('button', { name: 'Crear lead' }).click();
check(await page.getByText('Ingresá nombre y apellido').isVisible(), 'validación de nombre');
check(await page.getByText('Cargá teléfono o email').isVisible(), 'validación teléfono o email');
await page.locator('input[name=name]').fill('Prueba E2E');
await page.locator('input[name=phone]').fill('02392 15 444555');
await page.locator('input[name=modelInterest]').fill('Fiat Cronos');
await page.getByRole('button', { name: 'Crear lead' }).click();
await page.getByText('Lead creado: Prueba E2E').waitFor();
check(await page.getByRole('cell', { name: /Prueba E2E/ }).isVisible(), 'lead creado aparece en la tabla');
check(await page.getByText('+54 9 2392 444-555').isVisible(), 'teléfono normalizado a E.164');

// 5. Perdido exige motivo
await page.getByLabel('Estado de Prueba E2E').selectOption('lost');
await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
await page.getByText('Prueba E2E: Perdido').waitFor();
check(await page.getByRole('row', { name: /Prueba E2E/ }).getByText('Precio').isVisible(), 'motivo de pérdida guardado');

// 6. Importación CSV idempotente + rollback
const csvPath = path.join(os.tmpdir(), 'tecnom-e2e.csv');
fs.writeFileSync(csvPath, 'nombre;telefono;concesionario;modelo\nImport Uno;2392 600100;Cardys;Fiat Pulse\nImport Dos;2392 600200;Cardys;Fiat Toro\nSin Tel;;Cardys;Mobi\n');
const importOnce = async () => {
  await page.getByRole('button', { name: '↑ Importar CSV' }).click();
  await page.getByLabel('Archivo CSV').setInputFiles(csvPath);
  await page.getByText(/Crear: \d+/).waitFor();
  return page.getByRole('dialog').locator('.tag').allTextContents();
};
let tags = await importOnce();
check(tags.includes('Crear: 2') && tags.includes('Error: 1'), `vista previa: ${tags.join(', ')}`);
await shot('04-import-preview');
await page.getByRole('button', { name: /Confirmar importación/ }).click();
await page.getByText(/Importación aplicada/).waitFor();
tags = await importOnce();
check(tags.includes('Crear: 0') && tags.includes('Duplicado: 2'), `segunda importación no duplica: ${tags.join(', ')}`);
await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Revertir' }).first().click();
await page.getByText('Importación revertida').waitFor();
check((await page.getByRole('cell', { name: /Import Uno/ }).count()) === 0, 'rollback borra los leads importados');
await shot('02-leads');

// 7. Campañas y diagnóstico
await page.goto(BASE + '/campaigns');
await page.getByRole('button', { name: 'Analizar' }).first().click();
check(await page.getByRole('dialog').getByText('Acción recomendada').isVisible(), 'diagnóstico de campaña');
await page.getByRole('dialog').getByRole('button', { name: 'Ver JSON' }).click();
check(await page.locator('pre.json').last().isVisible(), 'JSON del análisis');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await shot('03-campaigns');
await page.goto(BASE + '/pipeline');
await shot('05-pipeline');

// 8. Rol Solo lectura
await page.goto(BASE + '/leads');
await page.getByLabel('Rol de la demo').selectOption('read_only');
check((await page.getByRole('button', { name: '+ Nuevo lead' }).count()) === 0, 'Solo lectura no ve "Nuevo lead"');
check((await page.getByRole('button', { name: '↑ Importar CSV' }).count()) === 0, 'Solo lectura no ve importar');
check((await page.locator('tbody select').count()) === 0, 'Solo lectura no puede cambiar estado ni asesor');
await page.getByLabel('Rol de la demo').selectOption('sales_advisor');
check((await page.locator('tbody select[aria-label^="Asesor"]').count()) === 0, 'Sales Advisor no reasigna asesores');
await page.getByLabel('Rol de la demo').selectOption('super_admin');

// 9. Mobile sin scroll horizontal
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const m = await mobile.newPage();
for (const route of ['/', '/leads', '/campaigns']) {
  await m.goto(BASE + route);
  await m.waitForLoadState('networkidle');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `mobile ${route} sin scroll horizontal (${overflow}px)`);
}
await m.getByRole('button', { name: 'Abrir menú' }).click();
check(await m.getByRole('link', { name: 'Pipeline' }).isVisible(), 'menú mobile abre la navegación');
await m.waitForTimeout(350);
if (SHOTS) await m.screenshot({ path: path.join(SHOTS, '06-mobile-menu.png') });

check(errors.length === 0, `sin errores de JS${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
check(external.length === 0, `modo demo sin requests externas${external.length ? ': ' + external.slice(0, 3).join(', ') : ''}`);

await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificaciones OK`);
process.exit(failed ? 1 : 0);
