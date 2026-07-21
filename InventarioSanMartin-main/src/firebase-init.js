// Inicialización única de Firebase para toda la app.
// Reemplaza el bloque firebaseConfig repetido en las 9 páginas.
// En desarrollo local (localhost) se conecta automáticamente a los emuladores.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Config pública del proyecto (no es un secreto: identifica, no autoriza).
export const firebaseConfig = {
  apiKey: "AIzaSyAZwE1BoSOdm5_C6AIGh4L66cqArpTWaX8",
  authDomain: "inventario-san-martin-pro.firebaseapp.com",
  projectId: "inventario-san-martin-pro",
  storageBucket: "inventario-san-martin-pro.firebasestorage.app",
  messagingSenderId: "1065452369670",
  appId: "1:1065452369670:web:e88daa1eda8af842025087",
  databaseURL: "https://inventario-san-martin-pro-default-rtdb.firebaseio.com/"
};

export const appId = 'default-app-id';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('prod') === 'true') {
  localStorage.setItem('useProd', 'true');
} else if (urlParams.get('prod') === 'false') {
  localStorage.removeItem('useProd');
}
const useProd = localStorage.getItem('useProd') === 'true';
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname) && !useProd;
if (esLocal) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectDatabaseEmulator(rtdb, 'localhost', 9000);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
