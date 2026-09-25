import type { ResultadoAcceso } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Registro de accesos (SPEC 2.112): cada intento de iniciar sesion, cada
 * cierre de sesion y cada sesion que el sistema corta al desactivar una
 * cuenta. Es tambien la base del bloqueo por intentos fallidos, para que
 * funcione aunque el servidor corra en varias copias (Vercel).
 */

/** Resultados que cuentan como intento fallido para el bloqueo. */
export const RESULTADOS_FALLIDOS: ResultadoAcceso[] = ['clave_incorrecta', 'usuario_inexistente', 'usuario_inactivo'];

export type DatosAcceso = {
  email: string;
  usuarioId?: string | null;
  resultado: ResultadoAcceso;
  ip?: string | null;
  navegador?: string | null;
  detalle?: string | null;
};

/** Registra un acceso. Nunca hace fallar el inicio de sesion por esto. */
export async function registrarAcceso(d: DatosAcceso) {
  try {
    await prisma.accessLog.create({
      data: {
        email: d.email.toLowerCase().trim().slice(0, 200),
        usuarioId: d.usuarioId ?? null,
        resultado: d.resultado,
        ip: d.ip?.slice(0, 100) ?? null,
        navegador: d.navegador?.slice(0, 300) ?? null,
        detalle: d.detalle?.slice(0, 300) ?? null,
      },
    });
  } catch (error) {
    logger.error('No se pudo registrar el acceso', { error: String(error) });
  }
}

/**
 * Direccion de red y navegador de quien hace la peticion. En Vercel la
 * direccion real viene en x-forwarded-for (la primera de la lista).
 */
export function datosCliente(headers: Record<string, string | string[] | undefined> | Headers | undefined) {
  const leer = (nombre: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(nombre) ?? undefined;
    const valor = (headers as Record<string, string | string[] | undefined>)[nombre];
    return Array.isArray(valor) ? valor[0] : valor;
  };
  const ip = leer('x-forwarded-for')?.split(',')[0]?.trim() || leer('x-real-ip') || null;
  return { ip, navegador: leer('user-agent') ?? null };
}

/**
 * Minutos que le quedan de bloqueo a un correo, o 0 si puede intentar.
 * Cuenta los intentos fallidos desde su ultimo ingreso correcto y dentro de
 * la ventana de bloqueo; con `maxIntentos` o mas, queda bloqueado hasta
 * que pase la ventana desde el ultimo fallo.
 */
export async function minutosDeBloqueo(email: string, maxIntentos: number, minutosBloqueo: number): Promise<number> {
  const correo = email.toLowerCase().trim();
  const desde = new Date(Date.now() - minutosBloqueo * 60_000);
  const ultimoExito = await prisma.accessLog.findFirst({
    where: { email: correo, resultado: 'exito', createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const fallidos = await prisma.accessLog.findMany({
    where: {
      email: correo,
      resultado: { in: RESULTADOS_FALLIDOS },
      createdAt: { gte: ultimoExito?.createdAt ?? desde },
    },
    orderBy: { createdAt: 'desc' },
    take: maxIntentos,
    select: { createdAt: true },
  });
  if (fallidos.length < maxIntentos) return 0;
  const libreEn = fallidos[0].createdAt.getTime() + minutosBloqueo * 60_000;
  return Math.max(1, Math.ceil((libreEn - Date.now()) / 60_000));
}
