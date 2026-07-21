// Wrapper de las Cloud Functions del gestor de usuarios, para uso en el navegador.
// Las de gestión requieren rol admin; passwordCambiada solo requiere sesión.

import { functions } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const fn = (nombre) => (datos) => httpsCallable(functions, nombre)(datos).then((r) => r.data);

export const crearUsuario        = fn('crearUsuario');
export const setPassword         = fn('setPassword');
export const deshabilitarUsuario = fn('deshabilitarUsuario');
export const fijarRol            = fn('fijarRol');
export const listarUsuarios      = fn('listarUsuarios');
export const passwordCambiada    = fn('passwordCambiada');
