import type { Prisma, ResultadoAcceso } from '@prisma/client';
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
  sesionId?: string | null;
};

/**
 * Registra un acceso y devuelve su id (null si no se pudo). Nunca hace
 * fallar el inicio de sesion por esto.
 */
export async function registrarAcceso(d: DatosAcceso): Promise<string | null> {
  try {
    const fila = await prisma.accessLog.create({
      data: {
        email: d.email.toLowerCase().trim().slice(0, 200),
        usuarioId: d.usuarioId ?? null,
        resultado: d.resultado,
        ip: d.ip?.slice(0, 100) ?? null,
        navegador: d.navegador?.slice(0, 300) ?? null,
        detalle: d.detalle?.slice(0, 300) ?? null,
        sesionId: d.sesionId ?? null,
      },
      select: { id: true },
    });
    return fila?.id ?? null;
  } catch (error) {
    logger.error('No se pudo registrar el acceso', { error: String(error) });
    return null;
  }
}

/**
 * Cierra un intento de inicio de sesion que se anoto antes de revisar la
 * clave (auditoria 27-sep-2026, 2.6): le pone su resultado real. Si el
 * intento no alcanzo a anotarse (id null), lo registra ahora.
 */
export async function actualizarAcceso(id: string | null, d: DatosAcceso): Promise<void> {
  if (!id) {
    await registrarAcceso(d);
    return;
  }
  try {
    await prisma.accessLog.update({
      where: { id },
      data: {
        resultado: d.resultado,
        usuarioId: d.usuarioId ?? null,
        detalle: d.detalle?.slice(0, 300) ?? null,
        sesionId: d.sesionId ?? null,
      },
    });
  } catch (error) {
    logger.error('No se pudo actualizar el acceso', { error: String(error) });
  }
}

/** "2 h 5 min", "12 min", "menos de 1 min". */
export function duracionLegible(ms: number) {
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return 'menos de 1 min';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

type TokenSesion = { id?: unknown; email?: unknown; sesionId?: unknown; expiraEn?: unknown };

/**
 * Cierre de sesion desde el menu (SPEC 2.112.5):
 * - anota la sesion en la lista negra hasta la hora en que su token habria
 *   vencido, para que una copia guardada del token ya no sirva;
 * - borra de pasada las filas ya vencidas (en Postgres no hay vencimiento
 *   automatico como en Redis);
 * - la deja en el registro de accesos, con cuanto duro la sesion.
 * Cerrar el navegador no pasa por aqui.
 */
export async function cerrarSesion(token: TokenSesion, cliente: { ip: string | null; navegador: string | null }) {
  const usuarioId = typeof token.id === 'string' ? token.id : null;
  const sesionId = typeof token.sesionId === 'string' ? token.sesionId : null;
  const email = typeof token.email === 'string' ? token.email : null;
  if (!email) return;

  let detalle: string | null = null;
  if (usuarioId && sesionId) {
    const expiraEn = new Date(typeof token.expiraEn === 'number' ? token.expiraEn : Date.now() + 31 * 24 * 3600_000);
    await prisma.sesionCerrada.upsert({
      where: { id: sesionId },
      create: { id: sesionId, usuarioId, expiraEn },
      update: {},
    });
    await prisma.sesionCerrada.deleteMany({ where: { expiraEn: { lt: new Date() } } });
    const ingreso = await prisma.accessLog.findFirst({
      where: { sesionId, resultado: 'exito' },
      select: { createdAt: true },
    });
    if (ingreso) detalle = `Sesión de ${duracionLegible(Date.now() - ingreso.createdAt.getTime())}`;
  }
  await registrarAcceso({ email, usuarioId, resultado: 'cierre_sesion', sesionId, detalle, ...cliente });
}

/**
 * Direccion de red y navegador de quien hace la peticion.
 *
 * x-forwarded-for lo puede escribir cualquiera: sin un proxy de confianza
 * delante, basta con inventar una direccion distinta en cada intento para
 * esquivar el bloqueo por equipo (auditoria 27-sep-2026, 2.6). Por eso solo
 * se lee:
 * - en Vercel, que reemplaza la cabecera con la direccion real (la primera);
 * - con TRUST_PROXY=true (un proxy propio, ej. nginx), tomando la ultima
 *   direccion de la lista, que es la que agrego ese proxy.
 * En cualquier otro caso la direccion queda desconocida (null).
 */
export function datosCliente(headers: Record<string, string | string[] | undefined> | Headers | undefined) {
  const leer = (nombre: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(nombre) ?? undefined;
    const valor = (headers as Record<string, string | string[] | undefined>)[nombre];
    return Array.isArray(valor) ? valor[0] : valor;
  };
  const lista = (leer('x-forwarded-for') ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  let ip: string | null = null;
  if (process.env.VERCEL) ip = lista[0] || leer('x-real-ip') || null;
  else if (process.env.TRUST_PROXY === 'true') ip = lista[lista.length - 1] || leer('x-real-ip') || null;
  return { ip, navegador: leer('user-agent') ?? null };
}

/**
 * Minutos de bloqueo que quedan segun los intentos fallidos que cumplen
 * `donde` desde `desde`: con `maxIntentos` o mas, queda bloqueado hasta
 * que pase la ventana desde el ultimo fallo. 0 si puede intentar.
 */
async function minutosBloqueados(
  donde: Prisma.AccessLogWhereInput,
  desde: Date,
  maxIntentos: number,
  minutosBloqueo: number
): Promise<number> {
  const fallidos = await prisma.accessLog.findMany({
    where: { ...donde, resultado: { in: RESULTADOS_FALLIDOS }, createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    take: maxIntentos,
    select: { createdAt: true },
  });
  if (fallidos.length < maxIntentos) return 0;
  const libreEn = fallidos[0].createdAt.getTime() + minutosBloqueo * 60_000;
  return Math.max(1, Math.ceil((libreEn - Date.now()) / 60_000));
}

/**
 * Tope global por correo, como multiplo del limite configurado (auditoria
 * 27-sep-2026, 2.6): frena a quien reparte los intentos contra una misma
 * cuenta entre muchas direcciones de red.
 */
export const FACTOR_TOPE_GLOBAL_CORREO = 4;

export type BloqueoCorreo = { minutos: number; motivo: 'equipo' | 'global' | null };

/**
 * Minutos que le quedan de bloqueo a un correo, o 0 si puede intentar.
 * Cuenta los intentos fallidos desde su ultimo ingreso correcto y dentro de
 * la ventana de bloqueo, de dos formas:
 * - desde esta direccion de red (`maxIntentos`): un tercero que se equivoca
 *   a proposito ya no deja fuera al dueño de la cuenta desde otro lugar. Sin
 *   direccion conocida cuenta todos los del correo, como antes;
 * - desde cualquier lugar (`maxIntentos * FACTOR_TOPE_GLOBAL_CORREO`).
 *
 * `enCurso` son los intentos ya anotados que todavia no terminan (el propio,
 * que se registra antes de revisar la clave): se suman al limite para que no
 * adelanten el bloqueo.
 */
export async function minutosDeBloqueo(
  email: string,
  ip: string | null,
  maxIntentos: number,
  minutosBloqueo: number,
  enCurso = 0
): Promise<BloqueoCorreo> {
  const correo = email.toLowerCase().trim();
  const desde = new Date(Date.now() - minutosBloqueo * 60_000);
  const ultimoExito = await prisma.accessLog.findFirst({
    where: { email: correo, resultado: 'exito', createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const inicio = ultimoExito?.createdAt ?? desde;
  const porEquipo = await minutosBloqueados(
    ip ? { email: correo, ip } : { email: correo },
    inicio,
    maxIntentos + enCurso,
    minutosBloqueo
  );
  const global = await minutosBloqueados(
    { email: correo },
    inicio,
    maxIntentos * FACTOR_TOPE_GLOBAL_CORREO + enCurso,
    minutosBloqueo
  );
  const minutos = Math.max(porEquipo, global);
  return { minutos, motivo: minutos === 0 ? null : porEquipo >= global ? 'equipo' : 'global' };
}

/**
 * Bloqueo por equipo (SPEC 2.112.6): los intentos fallidos desde una misma
 * direccion de red dentro de la ventana, pruebe el correo que pruebe. Frena
 * a quien prueba muchos correos. Un ingreso correcto de otra persona desde
 * la misma red (una oficina) no lo reinicia.
 */
export async function minutosDeBloqueoEquipo(
  ip: string | null,
  maxIntentos: number,
  minutosBloqueo: number,
  enCurso = 0
): Promise<number> {
  if (!ip) return 0;
  const desde = new Date(Date.now() - minutosBloqueo * 60_000);
  return minutosBloqueados({ ip }, desde, maxIntentos + enCurso, minutosBloqueo);
}

/** Cuanto se guarda el registro de accesos (decision de Javier, SPEC 2.112.6). */
export const DIAS_REGISTRO_ACCESOS = 365;

/**
 * Borra los registros de mas de un año. Se llama al iniciar sesion, igual
 * que la limpieza de la lista negra: no hace falta una tarea programada.
 * Usa el indice por fecha, asi que es barato aunque no haya nada que borrar.
 */
export async function limpiarRegistroAntiguo() {
  try {
    await prisma.accessLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - DIAS_REGISTRO_ACCESOS * 24 * 3600_000) } },
    });
  } catch (error) {
    logger.error('No se pudo limpiar el registro de accesos', { error: String(error) });
  }
}
