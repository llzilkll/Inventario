// Alta inicial de usuarios con clave maestra temporal (cambio forzado en el primer login).
// Uso local (emulador):  firebase emulators:exec ... "node seed-usuarios.mjs <clave-maestra>"
// Uso en producción:      GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node seed-usuarios.mjs <clave-maestra>
// La lista de personas vive en usuarios.seed.json (fuera del control de versiones).

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const masterPass = process.argv[2] || process.env.MASTER_PASSWORD;
if (!masterPass || String(masterPass).length < 6) {
  console.error('Falta la clave maestra (mínimo 6). Uso: node seed-usuarios.mjs "<clave-maestra>"');
  process.exit(1);
}

const usuarios = JSON.parse(readFileSync(new URL('./usuarios.seed.json', import.meta.url), 'utf8'));

admin.initializeApp();
const auth = admin.auth();
const dbf = admin.firestore();

for (const u of usuarios) {
  const email = String(u.email).trim().toLowerCase();
  try {
    let rec, nuevo = false;
    try {
      rec = await auth.getUserByEmail(email);
    } catch {
      rec = await auth.createUser({ email, password: masterPass, displayName: u.nombre });
      nuevo = true;
    }
    await auth.setCustomUserClaims(rec.uid, { admin: !!u.admin });
    await dbf.doc(`users/${rec.uid}`).set(
      { email, nombre: u.nombre, admin: !!u.admin, activo: true, debeCambiarPass: true },
      { merge: true },
    );
    console.log(`${nuevo ? '+ creado ' : '· existía'}  ${email}  (${u.admin ? 'admin' : 'operario'})`);
  } catch (e) {
    console.error(`! error con ${email}: ${e.message}`);
  }
}

console.log('Seed completo.');
process.exit(0);
