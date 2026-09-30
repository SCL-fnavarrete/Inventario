/** Datos de un usuario del sistema que se devuelven a la pantalla (nunca la contrasena). */
export const SELECT_USUARIO = {
  id: true,
  usuario: true,
  email: true,
  nombre: true,
  rol: true,
  activo: true,
  ultimoLogin: true,
  createdAt: true,
  sedeId: true,
  sede: { select: { id: true, codigo: true, nombre: true, activa: true } },
} as const;
