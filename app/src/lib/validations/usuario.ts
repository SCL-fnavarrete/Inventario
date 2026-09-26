import { z } from 'zod';
import { validarPasswordFuerte } from '@/lib/validations/password';

/**
 * Reglas de Configuracion > Usuarios (SPEC 2.112.6). Que la sede exista y
 * este activa, y que el correo no se repita, se revisa en la ruta contra la
 * base.
 */

export const ROLES_SISTEMA = ['admin', 'tecnico'] as const;

const email = z
  .string({ error: 'Escribe el correo' })
  .trim()
  .toLowerCase()
  .min(1, 'Escribe el correo')
  .max(200, 'Máximo 200 caracteres')
  .pipe(z.email('El correo no tiene un formato válido'));

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
  email,
  nombre,
  password,
  rol: rol.default('tecnico'),
  sedeId: sedeId.optional(),
  activo: z.boolean().optional(),
});

// El estado activo/inactivo se cambia con su propio boton (SPEC 2.112.3).
// Una contrasena vacia al editar significa "mantener la actual".
export const editarUsuarioSchema = z.object({
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
