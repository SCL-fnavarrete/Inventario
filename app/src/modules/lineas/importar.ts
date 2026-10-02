import { prisma } from '@/shared/prisma';
import { ApiError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { normalizeRut } from '@/shared/utilidades/rut';
import { leerHoja, type Celda, type HojaExcel } from '@/modules/importacion/servidor';
import { normalizarNumero } from '@/modules/lineas/validaciones';

/**
 * Importa las lineas desde la conciliacion de lineas celulares (SPEC 2.131):
 * la hoja "Consolidado" (una fila por numero) y, si esta, "Bajas" para la
 * fecha de baja. La persona se busca por RUT; si no esta en el sistema, su
 * nombre o la ubicacion quedan como responsable. Una linea que ya existe
 * solo completa los datos que le faltan: lo editado a mano no se pisa.
 */

/** Filas de una hoja como objetos, usando la fila que tiene `columnaClave` como encabezado. */
function filasConEncabezado(hoja: HojaExcel, columnaClave: string) {
  const i = hoja.filas.findIndex((f) => f.celdas.includes(columnaClave));
  if (i < 0) return null;
  const encabezado = hoja.filas[i].celdas.map(String);
  return hoja.filas.slice(i + 1).map((f) => {
    const fila: Record<string, Celda> = {};
    encabezado.forEach((h, c) => (fila[h] = f.celdas[c]));
    return fila;
  });
}

const texto = (v: Celda | undefined) => String(v ?? '').trim() || null;

/** Fecha de una celda: numero de serie de Excel o texto "2026-08-13". */
function fecha(v: Celda | undefined): Date | null {
  const d = typeof v === 'number' ? new Date((v - 25_569) * 86_400_000) : v ? new Date(String(v)) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export async function importarLineas(buffer: ArrayBuffer, usuario?: string | null) {
  const filas = filasConEncabezado(await leerHoja(buffer, 'Consolidado'), 'Línea normalizada');
  if (!filas) throw new ApiError(400, 'La hoja "Consolidado" no tiene la columna "Línea normalizada"');
  const bajas = await leerHoja(buffer, 'Bajas')
    .then((h) => filasConEncabezado(h, 'Línea normalizada') ?? [])
    .catch(() => []);
  const fechaBaja = new Map(bajas.map((b) => [normalizarNumero(String(b['Línea normalizada'])), fecha(b['Fecha actualización'])]));

  const personas = await prisma.employee.findMany({ where: { rut: { not: null } }, select: { id: true, rut: true } });
  const porRut = new Map(personas.map((p) => [normalizeRut(p.rut!), p.id]));
  const existentes = new Map((await prisma.lineaTelefonica.findMany()).map((l) => [l.numero, l]));

  const resumen = { nuevas: 0, completadas: 0, conPersona: 0, invalidas: [] as string[] };
  await prisma.$transaction(
    async (tx) => {
      for (const f of filas) {
        const numero = normalizarNumero(String(f['Línea normalizada'] ?? ''));
        if (!numero) {
          if (texto(f['Línea normalizada'])) resumen.invalidas.push(String(f['Línea normalizada']));
          continue;
        }
        const baja = f['Estado'] === 'Dada de baja';
        // Un solo RUT: si la linea figura con dos personas, queda para revisar.
        const ruts = String(f['Documento(s)'] ?? '').split('|').map((r) => r.trim()).filter(Boolean);
        const empleadoId = ruts.length === 1 ? porRut.get(normalizeRut(ruts[0])) ?? null : null;
        if (empleadoId) resumen.conPersona++;
        const datos = {
          plan: texto(f['Descripción plan']),
          precioMensual: typeof f['Precio plan'] === 'number' ? Math.round(f['Precio plan']) : null,
          estado: baja ? ('baja' as const) : ('activa' as const),
          fechaBaja: baja ? fechaBaja.get(numero) ?? new Date() : null,
          empleadoId,
          responsable: empleadoId ? null : texto(f['Responsable / ubicación']),
          observaciones: texto(f['Observación']),
        };

        const actual = existentes.get(numero);
        if (!actual) {
          const linea = await tx.lineaTelefonica.create({ data: { numero, ...datos } });
          await auditLogService.registrarCreacion('linea', linea.id, `Línea ${numero} importada`, JSON.parse(JSON.stringify(linea)), usuario, tx);
          resumen.nuevas++;
          continue;
        }
        // Solo lo que le falta a la linea que ya existe; el estado no se toca.
        const { estado: _e, fechaBaja: _f, ...completables } = datos;
        if (actual.empleadoId) completables.responsable = null;
        const faltan = Object.fromEntries(
          Object.entries(completables).filter(([k, v]) => v !== null && actual[k as keyof typeof actual] === null)
        );
        if (Object.keys(faltan).length === 0) continue;
        await tx.lineaTelefonica.update({ where: { id: actual.id }, data: faltan });
        await auditLogService.registrarActualizacion('linea', actual.id, `Línea ${numero} completada con la importación`, {}, JSON.parse(JSON.stringify(faltan)), usuario, tx);
        resumen.completadas++;
      }
    },
    { timeout: 60_000 }
  );
  return resumen;
}
