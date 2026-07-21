import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const APP = 'default-app-id';
const P = (col, id) => `artifacts/${APP}/public/data/${col}/${id}`;

let env, anon, oper, admin;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-inventario-sm',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  anon = env.unauthenticatedContext().firestore();
  oper = env.authenticatedContext('op1').firestore();
  admin = env.authenticatedContext('adm1', { admin: true }).firestore();
});

after(async () => { await env.cleanup(); });

// Sembrar un documento saltando las reglas (estado previo del test).
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

beforeEach(async () => { await env.clearFirestore(); });

// ---------- activos ----------
test('activos: lectura sin autenticación denegada', async () => {
  await seed(P('activos', 'a1'), { cantidad: 5 });
  await assertFails(getDoc(doc(anon, P('activos', 'a1'))));
});

test('activos: operario autenticado puede leer', async () => {
  await seed(P('activos', 'a1'), { cantidad: 5 });
  await assertSucceeds(getDoc(doc(oper, P('activos', 'a1'))));
});

test('activos: operario crea con cantidad válida', async () => {
  await assertSucceeds(setDoc(doc(oper, P('activos', 'a2')), { name: 'X', cantidad: 3 }));
});

test('activos: cantidad negativa rechazada', async () => {
  await assertFails(setDoc(doc(oper, P('activos', 'a3')), { name: 'X', cantidad: -1 }));
});

test('activos: operario NO puede borrar', async () => {
  await seed(P('activos', 'a4'), { cantidad: 1 });
  await assertFails(deleteDoc(doc(oper, P('activos', 'a4'))));
});

test('activos: admin puede borrar', async () => {
  await seed(P('activos', 'a5'), { cantidad: 1 });
  await assertSucceeds(deleteDoc(doc(admin, P('activos', 'a5'))));
});

// ---------- salidas_log ----------
test('salidas_log: operario puede crear', async () => {
  await assertSucceeds(setDoc(doc(oper, P('salidas_log', 's1')), { tipo: 'SALIDA' }));
});

test('salidas_log: operario NO puede actualizar', async () => {
  await seed(P('salidas_log', 's2'), { tipo: 'SALIDA' });
  await assertFails(updateDoc(doc(oper, P('salidas_log', 's2')), { tipo: 'X' }));
});

test('salidas_log: admin puede actualizar', async () => {
  await seed(P('salidas_log', 's3'), { tipo: 'SALIDA' });
  await assertSucceeds(updateDoc(doc(admin, P('salidas_log', 's3')), { tipo: 'X' }));
});

// ---------- ordenes_scrap (solo admin) ----------
test('ordenes_scrap: operario NO puede crear', async () => {
  await assertFails(setDoc(doc(oper, P('ordenes_scrap', 'o1')), { peso: 10 }));
});

test('ordenes_scrap: admin puede crear', async () => {
  await assertSucceeds(setDoc(doc(admin, P('ordenes_scrap', 'o2')), { peso: 10 }));
});

// ---------- users ----------
test('users: operario lee su propio perfil', async () => {
  await seed('users/op1', { usuario: 'op1', rol: 'operario' });
  await assertSucceeds(getDoc(doc(oper, 'users/op1')));
});

test('users: operario NO lee el perfil de otro', async () => {
  await seed('users/otro', { usuario: 'otro' });
  await assertFails(getDoc(doc(oper, 'users/otro')));
});

test('users: admin lee cualquier perfil', async () => {
  await seed('users/otro', { usuario: 'otro' });
  await assertSucceeds(getDoc(doc(admin, 'users/otro')));
});

test('users: ningún cliente puede escribir (solo Admin SDK)', async () => {
  await assertFails(setDoc(doc(admin, 'users/nuevo'), { usuario: 'nuevo' }));
});

test('users: el propio usuario puede marcar debeCambiarPass=false', async () => {
  await seed('users/op1', { nombre: 'Op', admin: false, debeCambiarPass: true });
  await assertSucceeds(updateDoc(doc(oper, 'users/op1'), { debeCambiarPass: false }));
});

test('users: no puede poner debeCambiarPass=true ni tocar otros campos', async () => {
  await seed('users/op1', { nombre: 'Op', admin: false, debeCambiarPass: true });
  await assertFails(updateDoc(doc(oper, 'users/op1'), { debeCambiarPass: true }));
  await assertFails(updateDoc(doc(oper, 'users/op1'), { admin: true }));
});

test('users: no puede tocar el flag de otro usuario', async () => {
  await seed('users/otro', { nombre: 'Otro', debeCambiarPass: true });
  await assertFails(updateDoc(doc(oper, 'users/otro'), { debeCambiarPass: false }));
});

// ---------- catch-all ----------
test('ruta no contemplada: denegada aun autenticado', async () => {
  await assertFails(getDoc(doc(oper, 'coleccion_random/x')));
});
