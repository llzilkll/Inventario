// Gestión de usuarios — Cloud Functions.
// La contraseña vive únicamente en Firebase Auth; en Firestore solo el perfil.
// Estas funciones usan Admin SDK y son la única vía de escritura de la colección users.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function exigirAdmin(req) {
  if (!req.auth || req.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Solo administradores.');
  }
}
function exigirSesion(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Requiere sesión.');
}
function limpiarEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpsError('invalid-argument', 'Email inválido.');
  return e;
}
function validarPassword(v) {
  if (!v || String(v).length < 6) throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
}

// admin crea un usuario. Nace con cambio de contraseña pendiente (primer login).
export const crearUsuario = onCall(async (req) => {
  exigirAdmin(req);
  const { email, password, nombre, admin = false } = req.data || {};
  const e = limpiarEmail(email);
  validarPassword(password);
  const rec = await getAuth().createUser({ email: e, password, displayName: nombre || e });
  await getAuth().setCustomUserClaims(rec.uid, { admin: !!admin });
  await getFirestore().doc(`users/${rec.uid}`).set({
    email: e, nombre: nombre || e, admin: !!admin, activo: true, debeCambiarPass: true,
  });
  return { uid: rec.uid, email: e };
});

// admin blanquea la contraseña; vuelve a exigir cambio en el próximo ingreso.
export const setPassword = onCall(async (req) => {
  exigirAdmin(req);
  const { uid, password } = req.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid requerido.');
  validarPassword(password);
  await getAuth().updateUser(uid, { password });
  await getFirestore().doc(`users/${uid}`).set({ debeCambiarPass: true }, { merge: true });
  return { ok: true };
});

// el propio usuario marca su contraseña como cambiada (tras el cambio forzado).
export const passwordCambiada = onCall(async (req) => {
  exigirSesion(req);
  await getFirestore().doc(`users/${req.auth.uid}`).set({ debeCambiarPass: false }, { merge: true });
  return { ok: true };
});

export const deshabilitarUsuario = onCall(async (req) => {
  exigirAdmin(req);
  const { uid, disabled } = req.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid requerido.');
  await getAuth().updateUser(uid, { disabled: !!disabled });
  await getFirestore().doc(`users/${uid}`).set({ activo: !disabled }, { merge: true });
  return { ok: true };
});

export const fijarRol = onCall(async (req) => {
  exigirAdmin(req);
  const { uid, admin } = req.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid requerido.');
  await getAuth().setCustomUserClaims(uid, { admin: !!admin });
  await getFirestore().doc(`users/${uid}`).set({ admin: !!admin }, { merge: true });
  return { ok: true };
});

export const listarUsuarios = onCall(async (req) => {
  exigirAdmin(req);
  const snap = await getFirestore().collection('users').get();
  return { usuarios: snap.docs.map((d) => ({ uid: d.id, ...d.data() })) };
});
