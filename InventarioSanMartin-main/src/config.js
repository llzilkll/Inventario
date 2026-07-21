// Validación compartida de identidad. Login por email (Firebase Auth email/password).

export function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email) {
  return EMAIL_RE.test(normalizarEmail(email));
}
