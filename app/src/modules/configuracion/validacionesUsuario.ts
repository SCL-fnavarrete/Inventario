import { z } from 'zod';
import { validarPasswordFuerte } from '@/modules/configuracion/clave';
import { FORMATO_USUARIO, normalizarUsuario, USUARIO_MAX, USUARIO_MIN } from '@/modules/configuracion/usuario';

/**
 * Reglas de Configuracion > Usuarios (SPEC 2.112.6 y 2.122). Que la sede
 * exista y este activa, y que el usuario y el correo no se repitan, se revisa
 * en el servicio contra la base.
 */

export const ROLES_SISTEMA = ['admin', 'tecnico'] as const;

// Con esto se inicia sesion (SPEC 2.122).
const usuario = z
  .string({ error: 'Escribe el usuario' })
  .transform(normalizarUsuario)
  .pipe(
    z
      .string()
      .min(1, 'Escribe el usuario')
      .min(USUARIO_MIN, `Mínimo ${USUARIO_MIN} caracteres`)
      .max(USUARIO_MAX, `Máximo ${USUARIO_MAX} caracteres`)
      .regex(FORMATO_USUARIO, 'Solo minúsculas, números, punto, guion y guion bajo')
  );

// Opcional, para recuperar la contrasena a futuro. Vacio = sin correo.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, 'Máximo 200 caracteres')
  .transform((v) => v || null)
  .pipe(z.email('El correo no tiene un formato válido').nullable())
  .nullable();

const nombre = z
  .string({ error: 'Escribe el nombre' })
  .trim()
  .min(1, 'Escribe el nombre')
  .max(100, 'Máximo 100 caracteres');

const password = z.string({ error: 'Escribe la contraseña' }).superRefine((valor, ctx) => {
  const error = validarPasswordFuerte(valor);
  if (error) ctx.addIssue({ code: 'custom', message: error });
});

const rol = z.enum(ROLES_SISTEMA, { error: 'Elige un rol válido' });

// "" en el selector significa "sin sede" (admin).
const sedeId = z
  .string({ error: 'Elige una sede' })
  .transform((v) => v || null)
  .nullable();

export const crearUsuarioSchema = z.object({
  usuario,
  email: email.optional(),
  nombre,
  password,
  rol: rol.default('tecnico'),
  sedeId: sedeId.optional(),
  activo: z.boolean().optional(),
});

// El estado activo/inactivo se cambia con su propio boton (SPEC 2.112.3).
// Una contrasena vacia al editar significa "mantener la actual".
export const editarUsuarioSchema = z.object({
  usuario: usuario.optional(),
  email: email.optional(),
  nombre: nombre.optional(),
  password: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(password.optional()),
  rol: rol.optional(),
  sedeId: sedeId.optional(),
  activo: z.boolean({ error: 'Valor inválido' }).optional(),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;
