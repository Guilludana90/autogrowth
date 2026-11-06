// E2E de P1 (modo demo): ficha del lead, tareas, listas de precios, cotizaciones con aprobación y usuarios.
// Uso: BASE_URL=http://localhost:3000 node e2e/p1.mjs [carpeta-capturas]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.argv[2];
const results = [];
const check = (cond, label) => {
  results.push([cond, label]);
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
const external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
});
page.on('dialog', (d) => d.accept());
const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const role = async (r) => page.getByLabel('Rol de la demo').selectOption(r);
const toast = (re) => page.locator('.toast').filter({ hasText: re }).first().waitFor();

// Estado limpio
await page.goto(BASE + '/system');
await page.getByRole('button', { name: 'Restaurar datos demo' }).click();
await toast(/restaurados/);

// 1. Ficha del lead: historial, nota y tarea
await page.goto(BASE + '/leads?org=cardys_fiat');
const firstName = (await page.locator('tbody .linklike').first().textContent()).trim();
await page.locator('tbody .linklike').first().click();
const drawer = page.getByRole('dialog', { name: firstName });
await drawer.getByText(/Lead creado/).waitFor();
check(true, 'la ficha muestra el alta en el historial');
await drawer.getByPlaceholder(/Agregar una nota/).fill('Visitó el salón, pidió precio contado');
await drawer.getByRole('button', { name: 'Agregar nota' }).click();
await drawer.getByText('Visitó el salón, pidió precio contado').waitFor();
check(true, 'la nota aparece en el historial');
await drawer.getByRole('button', { name: '+ Tarea' }).click();
const taskDlg = page.getByRole('dialog', { name: /Nueva tarea/ });
await taskDlg.locator('input[name=title]').fill('Enviar precio contado E2E');
await taskDlg.getByRole('combobox', { name: 'Prioridad' }).selectOption('high');
await taskDlg.locator('input[name=due]').fill(new Date().toISOString().slice(0, 10));
await taskDlg.getByRole('button', { name: 'Crear tarea' }).click();
await drawer.getByText('Tarea creada: Enviar precio contado E2E').waitFor();
check(true, 'la tarea queda vinculada y en el historial');
await drawer.getByLabel(/Estado de|Estado/).first().count();
await shot('07-lead-drawer');
await page.keyboard.press('Escape');

// 2. Tareas: vencidas y completar
await page.goto(BASE + '/tasks?org=cardys_fiat');
const overdue = Number(await page.locator('.stat').nth(1).locator('.value').textContent());
check(overdue > 0, `hay tareas vencidas en la demo (${overdue})`);
check((await page.locator('tbody tr').first().locator('.due-overdue').count()) > 0, 'las vencidas aparecen primero');
await page.getByLabel('Estado de Enviar precio contado E2E').selectOption('done');
await toast(/Tarea completada/);
await page.getByRole('button', { name: 'Completadas' }).click();
check(await page.getByText('Enviar precio contado E2E').isVisible(), 'la tarea completada pasa a Completadas');
await shot('08-tasks');

// 3. Lista de precios: carga, errores, activación
const csv = path.join(os.tmpdir(), 'lista-e2e.csv');
fs.writeFileSync(csv, 'Modelo;Versión;Precio lista\nFiat Cronos;Drive 1.3;$ 30.000.000\nFiat Cronos;Drive 1.3;31000000\nFiat Pulse;Audace;consultar\n');
await page.goto(BASE + '/documents?org=cardys_fiat');
await page.getByRole('button', { name: '+ Cargar documento' }).click();
const up = page.getByRole('dialog', { name: 'Cargar documento' });
await up.locator('input[type=file]').setInputFiles(csv);
await up.getByText('Filas válidas: 1').waitFor();
check(await up.getByText('Errores: 2').isVisible(), 'la lista detecta fila repetida y precio inválido');
await up.getByPlaceholder(/Lista de precios FIAT/).fill('Lista E2E');
await up.getByRole('button', { name: 'Guardar como borrador' }).click();
await toast(/borrador/);
await page.getByRole('row', { name: /Lista E2E/ }).getByRole('button', { name: 'Activar' }).click();
await toast(/Activo: Lista E2E/);
check((await page.getByRole('row', { name: /Lista de precios FIAT · ficticia/ }).getByText('Archivado').count()) === 1, 'activar archiva la versión anterior');

// 4. Cotización: precio de la lista activa → borrador → aprobación
await page.goto(BASE + '/quotes?org=cardys_fiat');
{
  const sel = page.getByLabel('Modelo de la lista activa');
  const labels = await sel.locator('option').allTextContents();
  const pick = labels.find((l) => /Fiat Cronos Drive 1.3/.test(l));
  check(!!pick, 'la lista activa ofrece el Cronos Drive 1.3');
  await sel.selectOption({ label: pick });
}
check((await page.getByLabel('Precio (ARS)').inputValue()) === '30000000', 'el precio sale de la lista activa');
await page.getByLabel('Anticipo (ARS)').fill('40000000');
check(await page.getByText('El anticipo debe ser menor al precio').isVisible(), 'valida anticipo mayor al precio');
await page.getByLabel('Anticipo (ARS)').fill('12000000');
await page.getByLabel('TNA %').fill('30');
await page.getByRole('button', { name: 'Guardar borrador' }).click();
await toast(/guardada como borrador/);
const row = page.getByRole('row', { name: /Fiat Cronos Drive 1.3/ }).filter({ hasText: 'Borrador' });
await row.getByRole('button', { name: 'Enviar a aprobación' }).click();
await toast(/enviada a aprobación/);
await role('dealership_admin');
const mine = page.getByRole('row', { name: /Fiat Cronos Drive 1.3/ }).filter({ hasText: 'Usuario demo' }).filter({ hasText: 'Pendiente' });
check((await mine.getByRole('button', { name: 'Aprobar' }).count()) === 0, 'un gerente no aprueba su propia cotización');
const other = page.getByRole('row', { name: /Lucía Torres/ });
await other.getByRole('button', { name: 'Rechazar' }).click();
const rej = page.getByRole('dialog', { name: /Rechazar cotización/ });
check(await rej.getByRole('button', { name: 'Rechazar' }).isDisabled(), 'rechazar exige motivo');
await rej.getByLabel(/Motivo/).fill('Anticipo mínimo 40%');
await rej.getByRole('button', { name: 'Rechazar' }).click();
await toast(/rechazada/);
await role('sales_advisor');
check((await page.getByRole('button', { name: 'Aprobar' }).count()) === 0, 'un asesor no ve Aprobar');
await role('super_admin');
await mine.getByRole('button', { name: 'Aprobar' }).click();
await toast(/aprobada/);
await page.getByRole('row', { name: /Fiat Cronos Drive 1.3/ }).filter({ hasText: 'Aprobada' }).getByRole('button', { name: 'Ver' }).click();
await page.getByText('Propuesta comercial N.º').waitFor();
check((await page.locator('.watermark').count()) === 0, 'la propuesta aprobada sale sin marca de borrador');
check(await page.getByText('Lista E2E').isVisible(), 'la propuesta cita la lista de precios usada');
await shot('09-proposal');
await page.goto(BASE + '/quotes?org=cardys_fiat');
await page.getByRole('row', { name: /Lucía Torres/ }).getByRole('button', { name: 'Ver' }).click();
await page.getByText('Propuesta comercial N.º').waitFor();
check(await page.locator('.watermark').isVisible(), 'una cotización rechazada sale marcada como NO VÁLIDA');
await page.goto(BASE + '/quotes?org=cardys_fiat');
await shot('10-quotes');

// 5. Usuarios
await page.goto(BASE + '/users?org=cardys_fiat');
await page.locator('input[name=email]').fill('nuevo.asesor@cardys.demo');
await page.locator('select[name=role]').selectOption('sales_advisor');
await page.getByRole('button', { name: 'Dar acceso' }).click();
await toast(/nuevo.asesor/);
check(await page.getByText('nuevo.asesor@cardys.demo').isVisible(), 'alta de usuario');
await role('dealership_admin');
const opts = await page.locator('select[name=role] option').allTextContents();
check(!opts.some((o) => /Admin/.test(o)), `un gerente solo otorga roles operativos (${opts.join(', ')})`);
await role('read_only');
check(await page.getByText('Solo los administradores ven y gestionan usuarios.').isVisible(), 'solo lectura no ve usuarios');
await role('post_sales');
await page.goto(BASE + '/quotes');
check(await page.getByText('Tu rol no tiene acceso a cotizaciones.').isVisible(), 'postventa no ve cotizaciones');
await role('super_admin');

// 6. Command Center refleja P1
await page.goto(BASE + '/?org=cardys_fiat');
check(await page.getByText(/tareas vencidas/).isVisible(), 'el Command Center muestra tareas vencidas');

check(errors.length === 0, `sin errores de JS${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
check(external.length === 0, 'modo demo sin requests externas');
await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificaciones OK`);
process.exit(failed ? 1 : 0);
