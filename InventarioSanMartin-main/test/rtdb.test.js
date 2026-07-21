import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set } from 'firebase/database';

let env, anon, oper;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-inventario-sm',
    database: { rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') },
  });
  anon = env.unauthenticatedContext().database();
  oper = env.authenticatedContext('op1').database();
});

after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); });

test('rtdb: lectura de raíz denegada sin auth', async () => {
  await assertFails(get(ref(anon, '/')));
});

test('rtdb: historial requiere autenticación para leer', async () => {
  await assertFails(get(ref(anon, 'historial')));
  await assertSucceeds(get(ref(oper, 'historial')));
});

test('rtdb: usuario autenticado escribe un movimiento nuevo válido', async () => {
  await assertSucceeds(set(ref(oper, 'historial/mov1'), { tipo: 'INGRESO', fecha: 1720000000000 }));
});

test('rtdb: movimiento sin campos requeridos rechazado', async () => {
  await assertFails(set(ref(oper, 'historial/mov2'), { algo: 'x' }));
});

test('rtdb: sesión temporal de trabajo requiere auth', async () => {
  await assertFails(set(ref(anon, 'temp_scrap_session/x'), { v: 1 }));
  await assertSucceeds(set(ref(oper, 'temp_scrap_session/x'), { v: 1 }));
});
