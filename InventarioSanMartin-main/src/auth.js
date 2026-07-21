// Módulo de autenticación compartido. Login por email, control de rol y
// cambio de contraseña forzado en el primer ingreso.

import { auth, db } from './firebase-init.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { normalizarEmail, emailValido } from './config.js';

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, normalizarEmail(email), password);
  return cred.user;
}

export function logout() {
  return signOut(auth);
}

// Envía el email de restablecimiento de contraseña (reset nativo de Firebase).
export function resetPassword(email) {
  const e = normalizarEmail(email);
  if (!emailValido(e)) throw new Error('Email inválido');
  return sendPasswordResetEmail(auth, e);
}

export function observarSesion(callback) {
  return onAuthStateChanged(auth, callback);
}

// Devuelve { uid, email, nombre, admin, debeCambiarPass } del usuario actual, o null.
export async function obtenerSesion(user) {
  const u = user || auth.currentUser;
  if (!u) return null;
  const { claims } = await u.getIdTokenResult();
  let perfil = {};
  try {
    const snap = await getDoc(doc(db, 'users', u.uid));
    if (snap.exists()) perfil = snap.data();
  } catch (e) { /* perfil no disponible: se usan valores por defecto */ }
  return {
    uid: u.uid,
    email: u.email,
    nombre: perfil.nombre || u.email,
    admin: claims.admin === true,
    debeCambiarPass: perfil.debeCambiarPass === true,
  };
}

// Guardia de página: resuelve con el usuario si hay sesión válida.
// - Sin sesión: redirige al login.
// - Con cambio de contraseña pendiente: redirige a la pantalla de cambio.
// - soloAdmin: expulsa a los no administradores.
export function protegerPagina({ loginUrl = 'login.html', soloAdmin = false, permitirCambioPass = false } = {}) {
  return new Promise((resolve) => {
    observarSesion(async (user) => {
      // Rechaza sin sesión y sesiones anónimas viejas (del acceso anónimo anterior).
      if (!user || user.isAnonymous) {
        if (user) { try { await logout(); } catch (e) { /* ignore */ } }
        location.replace(loginUrl);
        return;
      }
      const sesion = await obtenerSesion(user);
      if (sesion.debeCambiarPass && !permitirCambioPass) { location.replace('cambiar-password.html'); return; }
      if (soloAdmin && !sesion.admin) { location.replace('index.html'); return; }
      resolve(user);
    });
  });
}
