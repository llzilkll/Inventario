import { test, before, after } from 'node:test';
import assert from 'node:assert';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { emailValido } from '../src/config.js';

const PROJECT = 'demo-inventario-sm';
let adminApp, clientAuth;

before(async () => {
  adminApp = admin.initializeApp({ projectId: PROJECT });
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT });
  clientAuth = getAuth(app);
  connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
});

after(async () => { await adminApp.delete(); });

async function crear(email, password, claims) {
  const u = await admin.auth().createUser({ email, password });
  if (claims) await admin.auth().setCustomUserClaims(u.uid, claims);
  return u;
}

test('login por email con la contraseña correcta', async () => {
  await crear('juan@test.com', 'secreta123', { admin: false });
  const c = await signInWithEmailAndPassword(clientAuth, 'juan@test.com', 'secreta123');
  assert.ok(c.user);
});

test('contraseña incorrecta falla', async () => {
  await crear('ana@test.com', 'correcta1');
  await assert.rejects(() => signInWithEmailAndPassword(clientAuth, 'ana@test.com', 'incorrecta'));
});

test('el rol admin llega como custom claim', async () => {
  await crear('jefe@test.com', 'secreta123', { admin: true });
  const c = await signInWithEmailAndPassword(clientAuth, 'jefe@test.com', 'secreta123');
  const r = await c.user.getIdTokenResult(true);
  assert.strictEqual(r.claims.admin, true);
});

test('usuario deshabilitado no puede loguear', async () => {
  const u = await crear('baja@test.com', 'secreta123');
  await admin.auth().updateUser(u.uid, { disabled: true });
  await assert.rejects(() => signInWithEmailAndPassword(clientAuth, 'baja@test.com', 'secreta123'));
});

test('cambio de contraseña: la nueva funciona y la vieja no', async () => {
  const u = await crear('rota@test.com', 'vieja1234');
  await admin.auth().updateUser(u.uid, { password: 'nueva5678' });
  await assert.rejects(() => signInWithEmailAndPassword(clientAuth, 'rota@test.com', 'vieja1234'));
  const c = await signInWithEmailAndPassword(clientAuth, 'rota@test.com', 'nueva5678');
  assert.ok(c.user);
});

test('validación de email', () => {
  assert.ok(emailValido('a@b.com'));
  assert.ok(!emailValido('no-es-email'));
  assert.ok(!emailValido('a@b'));
});
