import { test, before, after } from 'node:test';
import assert from 'node:assert';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, runTransaction, increment, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';

// Verifica el patrón de actualización de stock: la transacción re-lee la cantidad
// real y valida antes de escribir; increment suma de forma atómica; la regla
// rechaza cantidades negativas. (La garantía anti-lost-update bajo concurrencia
// es contractual de runTransaction; el emulador no ejecuta transacciones
// concurrentes reales de forma confiable, así que se prueba de forma secuencial.)

const PROJECT = 'demo-inventario-sm';
const PATH = (id) => `artifacts/default-app-id/public/data/activos/${id}`;
let adminApp, db;

before(async () => {
  adminApp = admin.initializeApp({ projectId: PROJECT });
  await admin.auth().createUser({ email: 'oper@test.com', password: 'pass123' });
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT });
  const clientAuth = getAuth(app);
  connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  db = getFirestore(app);
  const [h, p] = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080').split(':');
  connectFirestoreEmulator(db, h, Number(p));
  await signInWithEmailAndPassword(clientAuth, 'oper@test.com', 'pass123');
});

after(async () => { await adminApp.delete(); });

const seed = (id, cantidad) => admin.firestore().doc(PATH(id)).set({ name: 'X', cantidad });

async function decremento(id, take) {
  const ref = doc(db, PATH(id));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const actual = parseInt(snap.data()?.cantidad) || 0;
    if (actual < take) throw new Error('insuficiente');
    tx.update(ref, { cantidad: actual - take });
  });
}

test('decrementos sucesivos parten siempre de la cantidad real', async () => {
  await seed('c1', 10);
  await decremento('c1', 3);
  await decremento('c1', 4);
  const snap = await getDoc(doc(db, PATH('c1')));
  assert.strictEqual(snap.data().cantidad, 3); // 10 - 3 - 4
});

test('la transacción rechaza si no alcanza el stock y no toca el dato', async () => {
  await seed('c2', 2);
  await assert.rejects(() => decremento('c2', 5));
  const snap = await getDoc(doc(db, PATH('c2')));
  assert.strictEqual(snap.data().cantidad, 2);
});

test('increment (revert de parcial) suma sin releer', async () => {
  await seed('c3', 5);
  const ref = doc(db, PATH('c3'));
  await runTransaction(db, async (tx) => { tx.update(ref, { cantidad: increment(2) }); });
  await runTransaction(db, async (tx) => { tx.update(ref, { cantidad: increment(3) }); });
  const snap = await getDoc(doc(db, PATH('c3')));
  assert.strictEqual(snap.data().cantidad, 10); // 5 + 2 + 3
});

test('la regla rechaza una cantidad negativa', async () => {
  await seed('c4', 1);
  await assert.rejects(() => setDoc(doc(db, PATH('c4')), { name: 'X', cantidad: -1 }));
});
