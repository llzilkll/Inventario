// Verificación headless del flujo de autenticación en navegador, contra el emulador.
// Sirve el repo localmente, siembra usuarios y maneja Chrome para probar:
//   1) la guardia redirige a login sin sesión
//   2) el primer login fuerza el cambio de contraseña
//   3) el login normal (admin) entra al index, muestra el nombre y el menú admin
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import admin from 'firebase-admin';
import puppeteer from 'puppeteer-core';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = 8095;
const base = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('no encontrado'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, r));

// El navegador usa el projectId real (firebase-init.js); el emulador debe usar el mismo.
admin.initializeApp({ projectId: 'inventario-san-martin-pro' });
async function seed(email, pass, adminFlag, nombre, debeCambiarPass) {
  let rec;
  try { rec = await admin.auth().getUserByEmail(email); }
  catch { rec = await admin.auth().createUser({ email, password: pass, displayName: nombre }); }
  await admin.auth().setCustomUserClaims(rec.uid, { admin: adminFlag });
  await admin.firestore().doc(`users/${rec.uid}`).set({ email, nombre, admin: adminFlag, activo: true, debeCambiarPass }, { merge: true });
}
await seed('admin@test.com', 'pass123', true, 'Jefe', false);
await seed('nuevo@test.com', 'pass123', false, 'Novato', true);
await seed('operario2@test.com', 'pass123', false, 'Peon', false);

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const results = [];
const check = (name, cond) => { results.push(!!cond); console.log(`${cond ? 'ok  ' : 'FAIL'} - ${name}`); };

// Cada test corre en un contexto aislado (sin compartir sesión ni IndexedDB).
async function conContexto(fn) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  try { await fn(pg, errs); } finally { await ctx.close(); }
}
async function login(pg, email, pass) {
  await pg.goto(`${base}/login.html`, { waitUntil: 'networkidle2' });
  await pg.type('#email', email);
  await pg.type('#password', pass);
  await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), pg.click('#btn')]);
}

// 1) guardia
await conContexto(async (pg) => {
  await pg.goto(`${base}/index.html`, { waitUntil: 'networkidle2' }).catch(() => {});
  await pg.waitForFunction(() => location.pathname.endsWith('login.html'), { timeout: 8000 }).catch(() => {});
  check('guardia redirige a login sin sesión', pg.url().endsWith('login.html'));
});

// 2) cambio forzado
await conContexto(async (pg, errs) => {
  await login(pg, 'nuevo@test.com', 'pass123');
  await pg.waitForFunction(() => location.pathname.endsWith('cambiar-password.html'), { timeout: 12000 }).catch(() => {});
  const ok = pg.url().endsWith('cambiar-password.html');
  check('primer login fuerza cambio de contraseña', ok);
  if (!ok) console.log('   url:', pg.url(), '| errores:', errs.slice(0, 4));
});

// 3) login admin normal
await conContexto(async (pg, errs) => {
  await login(pg, 'admin@test.com', 'pass123');
  await pg.waitForFunction(
    () => location.pathname.endsWith('index.html') && document.getElementById('user-id') && document.getElementById('user-id').textContent.trim().length > 0,
    { timeout: 15000 },
  ).catch(() => {});
  const nombre = await pg.$eval('#user-id', (el) => el.textContent.trim()).catch(() => '');
  const adminVisible = await pg.$eval('#admin-menu-section', (el) => !el.classList.contains('hidden')).catch(() => false);
  const okIndex = pg.url().endsWith('index.html');
  check('login admin llega al index', okIndex);
  check('index muestra el nombre del usuario', nombre === 'Jefe');
  check('menú admin visible para admin', adminVisible);
  if (!okIndex || nombre !== 'Jefe') console.log('   url:', pg.url(), '| nombre:', nombre, '| errores:', errs.slice(0, 4));
});

// 4) smoke de las páginas cableadas: con sesión admin cargan sin rebotar a login ni romper
const paginas = ['ingresos.html', 'salidas.html', 'preparacion.html', 'bdf.html', 'ingresos_masivos.html', 'publicacion.html', 'cargador.html'];
for (const pagina of paginas) {
  await conContexto(async (pg, errs) => {
    await login(pg, 'admin@test.com', 'pass123');
    await pg.goto(`${base}/${pagina}`, { waitUntil: 'networkidle2' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const url = pg.url();
    const rebotoLogin = url.endsWith('login.html');
    const fatal = errs.find((e) => /SyntaxError|is not defined|Cannot use import|Unexpected|Failed to resolve|firebase-init|src\/auth/.test(e));
    check(`${pagina}: carga con sesión admin sin romper`, !rebotoLogin && !fatal);
    if (rebotoLogin || fatal) console.log(`   url:${url} | err:`, errs.slice(0, 3));
  });
}

// publicacion (solo-admin): un operario debe ser redirigido a index
await conContexto(async (pg) => {
  await login(pg, 'operario2@test.com', 'pass123');
  await pg.goto(`${base}/publicacion.html`, { waitUntil: 'networkidle2' }).catch(() => {});
  await pg.waitForFunction(() => location.pathname.endsWith('index.html'), { timeout: 8000 }).catch(() => {});
  check('publicacion rechaza a operario (redirige a index)', pg.url().endsWith('index.html'));
});

await browser.close();
server.close();
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} checks OK`);
process.exit(ok === results.length ? 0 : 1);
