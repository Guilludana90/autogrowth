// E2E de P2 (modo demo): importación de métricas, conciliación Ads/CRM, detalle de campaña, canal, lotes y Meta apagada.
// Uso: BASE_URL=http://localhost:3000 node e2e/p2.mjs [carpeta-capturas]
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const role = async (r) => page.getByLabel('Rol de la demo').selectOption(r);
const toast = (re) => page.locator('.toast').filter({ hasText: re }).first().waitFor();
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Estado limpio
await page.goto(BASE + '/system');
await page.getByRole('button', { name: 'Restaurar datos demo' }).click();
await toast(/restaurados/);

// 1. Conciliación visible en Campañas
await page.goto(BASE + '/campaigns?org=cardys_fiat');
await page.getByRole('columnheader', { name: /Ads vs CRM/ }).waitFor();
const pda = page.getByRole('row', { name: /Plan de Ahorro · Secuencia/ });
check((await pda.getByText('Fuga').count()) === 1, 'la campaña con baja captura en CRM aparece como Fuga');
await shot('11-campaigns-gap');

// 2. Importar CSV de Meta: una corrección, una campaña nueva y una fila con error
const csv = [
  'Nombre de la campaña,Identificador de la campaña,Día,Importe gastado (ARS),Impresiones,Clics en el enlace,Clientes potenciales',
  `Cronos · Financiación,meta-cronos-fin,${day(-3)},"99.999,99",50000,900,40`,
  `E2E Nueva Campaña,e2e-nueva,${day(-3)},"10.000",8000,120,9`,
  `E2E Nueva Campaña,e2e-nueva,${day(-2)},"12.000",9000,130,11`,
  `E2E Nueva Campaña,e2e-nueva,fecha-mala,1,1,1,1`,
].join('\n');
await page.getByRole('button', { name: '↑ Importar métricas' }).click();
const dlg = page.getByRole('dialog', { name: 'Importar métricas de pauta' });
await dlg.locator('select[name=metric-org]').selectOption('cardys_fiat');
await dlg.locator('input[name=metric-file]').setInputFiles({ name: 'meta-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
await dlg.getByText('Nuevos: 2').waitFor();
check(await dlg.getByText('Corrige: 1').isVisible(), 'la vista previa detecta la corrección de un día existente');
check(await dlg.getByText('Errores: 1').isVisible(), 'la vista previa marca la fila con fecha inválida');
check(await dlg.getByText('Campañas nuevas: 1').isVisible(), 'la vista previa avisa la campaña nueva');
check(await dlg.locator('span.tag', { hasText: /^Meta Ads$/ }).isVisible(), 'detecta la plataforma por encabezados');
await shot('12-metric-import-preview');
await dlg.getByRole('button', { name: /Confirmar \(3 días/ }).click();
await toast(/Métricas importadas: 2 días nuevos, 1 corregidos/);
check(await page.getByRole('row', { name: /E2E Nueva Campaña/ }).isVisible(), 'la campaña nueva aparece en el listado');

// 3. Reimportar el mismo archivo no cambia nada
await page.getByRole('button', { name: '↑ Importar métricas' }).click();
await dlg.locator('select[name=metric-org]').selectOption('cardys_fiat');
await dlg.locator('input[name=metric-file]').setInputFiles({ name: 'meta-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
await dlg.getByText('Sin cambios: 3').waitFor();
check(await dlg.getByRole('button', { name: /Confirmar \(0 días/ }).isDisabled(), 'reimportar el mismo archivo es idempotente');
await dlg.getByRole('button', { name: 'Cancelar' }).click();

// 4. Detalle de campaña
await page.getByRole('row', { name: /E2E Nueva Campaña/ }).getByRole('link').click();
await page.getByRole('heading', { level: 1, name: 'E2E Nueva Campaña' }).waitFor();
check(await page.getByText('ID e2e-nueva', { exact: false }).isVisible(), 'el detalle muestra el ID de la campaña');
check((await page.locator('.stat').filter({ hasText: 'Leads Ads' }).textContent()).includes('20'), 'el detalle suma los leads de Ads del período');
check(await page.getByText(/ninguno figura en el CRM/).isVisible(), 'el detalle explica la fuga Ads→CRM');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '↓ Exportar desglose diario' }).click()]);
check(/^campania-e2e-nueva-/.test(dl.suggestedFilename()), 'exporta el desglose diario');
await shot('13-campaign-detail');

// 5. Filtro global de canal
await page.goto(BASE + '/campaigns?org=cardys_fiat');
await page.getByLabel('Canal').selectOption('google');
await page.waitForURL(/ch=google/);
check((await page.getByRole('row', { name: /Strada · Search/ }).count()) === 1, 'canal Google muestra Strada');
check((await page.getByRole('row', { name: /Cronos · Financiación/ }).count()) === 0, 'canal Google oculta campañas de Meta');
await page.getByRole('link', { name: 'Command Center' }).click();
await page.waitForURL((u) => u.pathname === '/' && u.search.includes('ch=google'));
check(await page.getByText(/solo Google Ads/).isVisible(), 'el canal se conserva al navegar');

// 6. Métricas por canal
await page.goto(BASE + '/channels?org=cardys_fiat');
check((await page.getByRole('row', { name: /Meta Ads/ }).count()) === 1 && (await page.getByRole('row', { name: /Google Ads/ }).count()) === 1, 'métricas por canal compara Meta y Google');
await shot('14-channels');

// 7. Canales conectados: Meta apagada en demo, lotes y reversión
await page.goto(BASE + '/integrations?org=cardys_fiat');
check(await page.getByText(/Modo demo: la conexión con Meta está desactivada/).isVisible(), 'Meta figura desactivada en modo demo');
check(await page.getByText('No conectada').first().isVisible(), 'Meta no figura como conectada');
await page.locator('input[name=meta-account-cardys_fiat]').isDisabled().then((d) => check(d, 'no se puede iniciar OAuth en demo'));
const jobRow = page.getByRole('row', { name: /meta-e2e\.csv/ });
check((await jobRow.count()) === 1, 'el lote importado figura en el historial');
await shot('15-integrations');
await jobRow.getByRole('button', { name: 'Revertir' }).click();
await toast(/Lote revertido/);
check(await jobRow.getByText('Revertido').isVisible(), 'el lote queda revertido');
await page.goto(BASE + '/campaigns?org=cardys_fiat');
await page.getByRole('row', { name: /Cronos · Financiación/ }).waitFor();
check((await page.getByRole('row', { name: /E2E Nueva Campaña/ }).count()) === 0, 'revertir quita la campaña creada por el lote');

// 8. Roles
await role('sales_advisor');
check((await page.getByRole('button', { name: '↑ Importar métricas' }).count()) === 0, 'un asesor no ve Importar métricas');
await page.goto(BASE + '/integrations');
check(await page.getByText('Solo Super Admin o Gerente ven y gestionan las fuentes de datos.').isVisible(), 'un asesor no ve canales conectados');
await role('super_admin');

// 9. El servidor tampoco conecta en demo
const status = await (await page.request.get(BASE + '/api/integrations/meta/status')).json();
check(status.enabled === false && /Modo demo/.test(status.reason), 'la API informa Meta desactivada en demo');
const connect = await page.request.post(BASE + '/api/integrations/meta/connect', { data: { organizationId: 'cardys_fiat', adAccountId: 'act_123456' } });
check(connect.status() === 503, 'la API rechaza iniciar OAuth en demo');
const sync = await page.request.post(BASE + '/api/integrations/meta/sync', { data: { organizationId: 'cardys_fiat', from: day(-7), to: day(-1) } });
check(sync.status() === 503, 'la API rechaza sincronizar en demo');

// 10. Command Center
await page.goto(BASE + '/?org=cardys_fiat');
check(await page.getByText(/campañas? con fuga/).isVisible(), 'el Command Center alerta campañas con fuga');
check(await page.getByText(/métricas hasta/).isVisible(), 'el Command Center muestra hasta cuándo hay métricas');

check(errors.length === 0, `sin errores de JS${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
check(external.length === 0, 'modo demo sin requests externas');
await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificaciones OK`);
process.exit(failed ? 1 : 0);
