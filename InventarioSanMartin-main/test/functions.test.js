import { test, before, after } from 'node:test';
import assert from 'node:assert';
import admin from 'firebase-admin';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

const PROJECT = 'demo-inventario-sm';
let adminApp, fnsAdmin, fnsPeon;

function clientApp(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const fns = getFunctions(app);
  const [h, p] = (process.env.FUNCTIONS_EMULATOR_HOST || 'localhost:5001').split(':');
  connectFunctionsEmulator(fns, h, Number(p));
  return { app, auth, fns };
}
const call = (fns, name, data) => httpsCallable(fns, name)(data).then((r) => r.data);
const perfil = (uid) => admin.firestore().doc(`users/${uid}`).get().then((d) => d.data());

before(async () => {
  adminApp = admin.initializeApp({ projectId: PROJECT });
  const jefe = await admin.auth().createUser({ email: 'jefef@test.com', password: 'admin123' });
  await admin.auth().setCustomUserClaims(jefe.uid, { admin: true });
  await admin.auth().createUser({ email: 'peonf@test.com', password: 'peon123' });

  const a = clientApp('adm');
  await signInWithEmailAndPassword(a.auth, 'jefef@test.com', 'admin123');
  fnsAdmin = a.fns;

  const p = clientApp('peon');
  await signInWithEmailAndPassword(p.auth, 'peonf@test.com', 'peon123');
  fnsPeon = p.fns;
});

after(async () => { await adminApp.delete(); });

test('admin crea un usuario (con cambio de contraseña pendiente) y aparece en el listado', async () => {
  const res = await call(fnsAdmin, 'crearUsuario', { email: 'nuevo1@test.com', password: 'clave123', nombre: 'Nuevo Uno' });
  assert.strictEqual(res.email, 'nuevo1@test.com');
  assert.strictEqual((await perfil(res.uid)).debeCambiarPass, true);
  const { usuarios } = await call(fnsAdmin, 'listarUsuarios', {});
  assert.ok(usuarios.some((u) => u.email === 'nuevo1@test.com'));
});

test('operario NO puede crear usuarios', async () => {
  await assert.rejects(() => call(fnsPeon, 'crearUsuario', { email: 'hack@test.com', password: 'clave123' }),
    (e) => e.code === 'functions/permission-denied');
});

test('email inválido rechazado por la función', async () => {
  await assert.rejects(() => call(fnsAdmin, 'crearUsuario', { email: 'no-es-email', password: 'clave123' }),
    (e) => e.code === 'functions/invalid-argument');
});

test('setPassword: entra con la nueva y vuelve a exigir cambio', async () => {
  const { uid } = await call(fnsAdmin, 'crearUsuario', { email: 'cambia@test.com', password: 'vieja123' });
  await call(fnsAdmin, 'setPassword', { uid, password: 'nueva456' });
  assert.strictEqual((await perfil(uid)).debeCambiarPass, true);
  const probe = clientApp('probe_setpass');
  await assert.doesNotReject(() => signInWithEmailAndPassword(probe.auth, 'cambia@test.com', 'nueva456'));
  await deleteApp(probe.app);
});

test('passwordCambiada: el propio usuario limpia su bandera', async () => {
  const { uid } = await call(fnsAdmin, 'crearUsuario', { email: 'pcamb@test.com', password: 'inicial123' });
  assert.strictEqual((await perfil(uid)).debeCambiarPass, true);
  const u = clientApp('pcamb');
  await signInWithEmailAndPassword(u.auth, 'pcamb@test.com', 'inicial123');
  await call(u.fns, 'passwordCambiada', {});
  assert.strictEqual((await perfil(uid)).debeCambiarPass, false);
  await deleteApp(u.app);
});

test('deshabilitarUsuario: el usuario queda deshabilitado', async () => {
  const { uid } = await call(fnsAdmin, 'crearUsuario', { email: 'baja1@test.com', password: 'clave123' });
  await call(fnsAdmin, 'deshabilitarUsuario', { uid, disabled: true });
  const rec = await admin.auth().getUser(uid);
  assert.strictEqual(rec.disabled, true);
});

test('fijarRol: promueve a admin', async () => {
  const { uid } = await call(fnsAdmin, 'crearUsuario', { email: 'asciende@test.com', password: 'clave123' });
  await call(fnsAdmin, 'fijarRol', { uid, admin: true });
  const rec = await admin.auth().getUser(uid);
  assert.strictEqual(rec.customClaims.admin, true);
});
