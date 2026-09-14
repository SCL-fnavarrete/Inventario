/**
 * Regla de contraseña fuerte para SystemUser, en un solo lugar.
 *
 * Antes vivía duplicada: el POST de crear usuario exigía 12+ caracteres con
 * mayúscula/minúscula/número/símbolo, pero el PUT de editar solo exigía 6
 * caracteres sin ninguna otra regla -- un admin podía crear un usuario con
 * clave fuerte y despues, al editarlo, cambiarla por algo débil sin que el
 * sistema lo impidiera (14-sep-2026, SPEC 2.26). Se centraliza para que las
 * dos rutas no puedan volver a desincronizarse.
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
