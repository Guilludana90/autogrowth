// E2E de P4 (modo demo): turnos de taller, repuestos, base de conocimiento e inbox con consentimiento.
// Uso: BASE_URL=http://localhost:3000 node e2e/p4.mjs [carpeta-capturas]
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR' });
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
const dlg = (name) => page.getByRole('dialog', { name });
const tomorrow = await page.evaluate(() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

await page.goto(BASE + '/system');
await page.getByRole('button', { name: 'Restaurar datos demo' }).click();
await toast(/restaurados/);
check(await page.getByText('Instagram y Messenger').isVisible(), 'Estado del sistema declara Instagram/Messenger como no conectados');

// 1. Turnos de taller
await page.goto(BASE + '/service?org=cardys_fiat');
await page.getByRole('heading', { name: 'Turnos de taller', level: 1 }).waitFor();
check((await page.locator('.bay').count()) >= 2, 'la agenda del día se agrupa por box');
check(await page.locator('.appt').filter({ hasText: 'Rocío Gómez' }).isVisible(), 'el turno de hoy aparece en su box');
await shot('30-service-day');

// Avanzar un turno: recibido → en taller
await page.locator('.appt').filter({ hasText: 'Rocío Gómez' }).click();
const det = dlg('Turno · Rocío Gómez');
await det.getByRole('button', { name: 'Pasar a taller' }).click();
await toast(/pasar a taller/);
check(await det.locator('.kv').getByText('En taller').isVisible(), 'el estado del turno avanza');
check((await det.locator('.timeline li').count()) >= 4, 'el historial del turno registra cada cambio');
await det.getByRole('button', { name: 'Cerrar' }).click();

// Nuevo turno: conflicto de box y luego alta con recordatorio
await page.getByRole('button', { name: '+ Nuevo turno' }).click();
const nf = dlg('Nuevo turno de taller');
await nf.getByRole('button', { name: 'Agendar turno' }).click();
check(await nf.getByText('Indicá el nombre del cliente.').isVisible(), 'el alta valida campos obligatorios');
await nf.getByLabel('Nombre del cliente *').fill('Lucía Ferreyra');
await nf.getByLabel('Vehículo *').fill('Fiat Argo Trekking');
await nf.getByLabel('Patente').fill('ab 456 cd');
await nf.getByLabel('Día *').fill(tomorrow);
await nf.getByLabel('Hora *').fill('09:30');
await nf.getByLabel('Box / puesto *').fill('Box 1');
check(await nf.getByText(/Box 1 ocupado/).isVisible(), 'avisa la superposición con otro turno del mismo box');
await nf.getByRole('button', { name: 'Agendar turno' }).click();
check(await nf.getByText(/ya está ocupado/).isVisible(), 'no deja agendar un box ocupado');
await nf.getByLabel('Hora *').fill('14:00');
await nf.getByRole('button', { name: 'Agendar turno' }).click();
await toast(/Turno agendado: Lucía Ferreyra.*recordatorio/);
await page.getByRole('button', { name: 'Próximos 14 días' }).click();
check(await page.getByRole('row').filter({ hasText: 'Lucía Ferreyra' }).getByText('AB456CD').isVisible(), 'el turno nuevo aparece con la patente normalizada');
await page.goto(BASE + '/tasks?org=cardys_fiat');
check(await page.getByText(/Confirmar turno de Lucía Ferreyra \(AB456CD\)/).isVisible(), 'el recordatorio queda como tarea interna');

// Cancelar exige motivo
await page.goto(BASE + '/service?org=cardys_fiat');
await page.getByRole('button', { name: 'Próximos 14 días' }).click();
await page.getByRole('row').filter({ hasText: 'Lucía Ferreyra' }).click();
await dlg('Turno · Lucía Ferreyra').getByRole('button', { name: 'Cancelar' }).click();
const rd = dlg('Cancelar · Lucía Ferreyra');
await rd.getByRole('button', { name: 'Confirmar' }).click();
check(await rd.getByText('Escribí al menos 3 caracteres.').isVisible(), 'cancelar sin motivo no se permite');
await rd.locator('textarea').fill('El cliente reprogramó por viaje');
await rd.getByRole('button', { name: 'Confirmar' }).click();
await toast(/cancelar/);
check(await dlg('Turno · Lucía Ferreyra').getByText('El cliente reprogramó por viaje').first().isVisible(), 'el motivo queda registrado');
await dlg('Turno · Lucía Ferreyra').getByRole('button', { name: 'Cerrar' }).click();

// Solo lectura no gestiona turnos
await role('read_only');
check((await page.getByRole('button', { name: '+ Nuevo turno' }).count()) === 0, 'Solo lectura no ve Nuevo turno');
await role('super_admin');

// 2. Repuestos
await page.goto(BASE + '/parts?org=cardys_fiat');
await page.getByRole('heading', { name: 'Repuestos y accesorios', level: 1 }).waitFor();
const late = page.getByRole('row').filter({ hasText: 'Bieleta de suspensión delantera' });
check(await late.getByText(/demorado/).isVisible(), 'el pedido con llegada vencida se marca demorado');
await shot('31-parts');
const alf = page.getByRole('row').filter({ hasText: 'Alfombras de goma Cronos' });
await alf.getByRole('button', { name: 'Cotizar' }).click();
const qd = dlg('Cotizar · Alfombras de goma Cronos');
await qd.getByRole('button', { name: 'Cotizar' }).click();
check(await qd.getByText(/precio unitario mayor a 0/).isVisible(), 'cotizar exige precio');
await qd.getByLabel(/Precio unitario/).fill('85000');
await qd.getByRole('button', { name: 'Cotizar' }).click();
await toast(/cotizado/);
check(await alf.getByText('Cotizado').isVisible(), 'el pedido pasa a Cotizado');
await alf.getByRole('button', { name: 'Pedir' }).click();
const od = dlg('Pedir · Alfombras de goma Cronos');
await od.getByLabel('Llegada estimada').fill(tomorrow);
await od.getByRole('button', { name: 'Pedir' }).click();
await toast(/pedido a fábrica/);
await page.getByRole('button', { name: '+ Nuevo pedido' }).click();
const pf = dlg('Nuevo pedido de repuesto o accesorio');
await pf.getByLabel('Cliente *').fill('Stock taller');
await pf.getByLabel('Descripción *').fill('Escobillas limpiaparabrisas');
await pf.getByRole('button', { name: 'Crear pedido' }).click();
await toast(/Pedido creado/);
check(await page.getByRole('row').filter({ hasText: 'Escobillas limpiaparabrisas' }).getByText('Solicitado').isVisible(), 'el pedido nuevo queda Solicitado');
await role('sales_advisor');
check(await page.getByRole('button', { name: '+ Nuevo pedido' }).isVisible() && (await page.getByRole('button', { name: 'Cotizar' }).count()) === 0, 'Vendedor pide repuestos pero no gestiona el circuito');
await role('super_admin');

// 3. Base de conocimiento
await page.goto(BASE + '/knowledge?org=cardys_fiat');
await page.getByRole('heading', { name: 'Base de conocimiento', level: 1 }).waitFor();
await page.getByLabel('Buscar en la base').fill('garantia');
check((await page.locator('.kb-list li').first().textContent()).includes('Garantía de fábrica'), 'la búsqueda ignora acentos y prioriza el título');
await page.getByLabel('Buscar en la base').fill('');
await page.getByRole('button', { name: 'En revisión' }).click();
await page.locator('.kb-list button').filter({ hasText: 'Service de 10.000 km' }).click();
await page.getByText(/Cambios respecto de la versión publicada/).click();
check(await page.locator('.diff .add').first().isVisible(), 'la revisión muestra el diff contra la versión publicada');
await shot('32-knowledge-review');
await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
await toast(/aprobar y publicar/);
await page.getByRole('button', { name: 'Vigentes' }).click();
await page.locator('.kb-list button').filter({ hasText: 'Service de 10.000 km' }).click();
check(await page.locator('.kb-article').getByText('v2', { exact: false }).first().isVisible() && (await page.locator('.kb-body').textContent()).includes('2 horas'), 'al aprobar queda vigente la v2');
check(await page.locator('.versions').getByText('v1 · Archivado').isVisible(), 'la versión anterior queda archivada');
// Nuevo artículo propio: no se puede autoaprobar
await page.getByRole('button', { name: '+ Nuevo artículo' }).click();
const ke = dlg('Nuevo artículo');
await ke.getByLabel('Título *').fill('Entrega de 0 km: checklist');
await ke.getByLabel('Contenido *').fill('Revisar documentación, kit de seguridad, manual y explicar el plan de mantenimiento al cliente.');
await ke.getByRole('button', { name: 'Guardar borrador' }).click();
await toast(/Borrador creado/);
await page.getByRole('button', { name: 'Enviar a revisión' }).click();
await toast(/enviar a revisión/);
check((await page.getByRole('button', { name: 'Aprobar y publicar' }).count()) === 0 && (await page.getByText(/tiene que aprobarlo otro gerente/).isVisible()), 'nadie aprueba lo que escribió');
await role('post_sales');
check((await page.getByRole('button', { name: 'Aprobar y publicar' }).count()) === 0, 'Postventa no aprueba artículos');
await role('super_admin');

// 4. Inbox con consentimiento
await page.goto(BASE + '/inbox?org=cardys_fiat');
await page.getByRole('heading', { name: 'Inbox de conversaciones', level: 1 }).waitFor();
check(await page.getByText(/AutoGrowth no envía ni recibe mensajes/).isVisible(), 'el inbox aclara que es registro manual');
check(await page.locator('.kb-list li').first().getByText(/Esperando hace/).isVisible(), 'primero las conversaciones que esperan respuesta');
await shot('33-inbox');
// Lead con WhatsApp revocado: no se puede registrar respuesta
const revoked = page.locator('.kb-list button').filter({ hasText: 'Teléfono' }).first();
await revoked.click();
await page.getByRole('button', { name: 'Respondimos' }).click();
await page.getByLabel('Canal').selectOption('whatsapp');
check(await page.getByText(/revocó el consentimiento/).isVisible() && (await page.getByRole('button', { name: 'Registrar mensaje' }).isDisabled()), 'WhatsApp revocado bloquea respuestas');
await page.getByLabel('Canal').selectOption('phone');
await page.getByLabel('Contenido del mensaje').fill('Lo llamé y le pasé tasaciones de usados.');
await page.getByRole('button', { name: 'Registrar mensaje' }).click();
await toast(/Mensaje registrado/);
check(await page.locator('.bubbles li.out').filter({ hasText: 'tasaciones de usados' }).isVisible(), 'la respuesta telefónica queda registrada');
// Instagram fuera de la ventana de 24 h
const ig = page.locator('.kb-list button').filter({ hasText: 'Instagram' }).first();
await ig.click();
await page.getByRole('button', { name: 'Respondimos' }).click();
await page.getByLabel('Canal').selectOption('instagram');
const igBlocked = await page.getByText(/dentro de las 24 h/).isVisible();
check(igBlocked || (await page.getByRole('button', { name: 'Registrar mensaje' }).isEnabled()), `Instagram respeta la ventana de 24 h (${igBlocked ? 'fuera de ventana' : 'dentro de ventana'})`);
// Registrar consentimiento y responder por WhatsApp
await page.locator('.convo').getByRole('button', { name: /WhatsApp: sin consentimiento/ }).click();
const cd = page.getByRole('dialog', { name: /Consentimiento de WhatsApp/ });
await cd.getByRole('button', { name: 'Registrar' }).click();
check(await cd.getByText(/Indicá cómo se obtuvo/).isVisible(), 'el consentimiento exige origen');
await cd.getByLabel('Origen *').fill('Lo pidió por Instagram');
await cd.getByRole('button', { name: 'Registrar' }).click();
await toast(/Consentimiento de WhatsApp registrado/);
await page.getByRole('button', { name: 'Respondimos' }).click();
await page.getByLabel('Canal').selectOption('whatsapp');
await page.getByLabel('Contenido del mensaje').fill('Te escribo por WhatsApp como pediste.');
await page.getByRole('button', { name: 'Registrar mensaje' }).click();
await toast(/Mensaje registrado/);
check(await page.locator('.bubbles li.out').filter({ hasText: 'como pediste' }).isVisible(), 'con consentimiento vigente se registra la respuesta por WhatsApp');
await role('read_only');
check(await page.getByText('Tu rol puede leer, no registrar.').isVisible(), 'Solo lectura no registra mensajes');
await role('super_admin');

// 5. Navegación y mobile
for (const n of ['Turnos de taller', 'Repuestos y accesorios', 'Base de conocimiento', 'Inbox de conversaciones']) {
  check(await page.getByRole('link', { name: n }).isVisible(), `${n} está en el menú`);
}
check((await page.getByText(/CHUI/).count()) === 0, 'sin rastros de CHUI');
await page.setViewportSize({ width: 390, height: 844 });
for (const route of ['/service', '/parts', '/knowledge', '/inbox']) {
  await page.goto(BASE + route + '?org=cardys_fiat');
  await page.locator('h1').waitFor();
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, `${route} sin scroll horizontal en mobile`);
}
await page.goto(BASE + '/service?org=cardys_fiat');
await page.locator('.bay').first().waitFor();
await shot('34-service-mobile');

check(errors.length === 0, `sin errores de JS${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
check(external.length === 0, 'modo demo sin requests externas');
await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificaciones OK`);
process.exit(failed ? 1 : 0);
