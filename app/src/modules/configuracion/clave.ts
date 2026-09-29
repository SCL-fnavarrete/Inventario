/**
 * Regla de contraseña fuerte para SystemUser, centralizada en un solo lugar
 * para que crear y editar usuarios usen siempre el mismo criterio.
 */
export function validarPasswordFuerte(password: string): string | null {
  if (!password || password.length < 12) {
    return "La contraseña debe tener al menos 12 caracteres";
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSymbol) {
    return "La contraseña debe contener mayúscula, minúscula, número y símbolo";
  }

  return null;
}
