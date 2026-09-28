import type { SesionAutenticada } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { sedeIdParaCrear } from "@/lib/auth/sedeScope";
import { exigirSedeActiva } from "@/lib/queries/sedes";
import { construirMapaCatalogo, construirMapaSedes } from "@/lib/importacion/activos";
import { precargarEmpleadosPorRut, type ContextoFila } from "@/lib/importacion/procesarFila";
import { normalizarImei } from "@/lib/validations/imei";

/**
 * Contexto de una importacion, compartido por la vista previa y la escritura
 * (auditoria 28-sep-2026, 3.2). Antes cada ruta lo armaba por su cuenta y
 * ambas leian TODAS las series e IMEI de la base en cada llamada; con el
 * envio en tandas eran 25 lecturas completas de la tabla por importacion.
 */
export async function armarContextoImportacion(datos: {
  session: SesionAutenticada;
  sedeIdSolicitada: string | null | undefined;
  /** Filas que se van a procesar (datos ya mapeados). */
  filas: Record<string, string>[];
  categoriaId: string;
  exigeImei: boolean;
  tipoMantencionId: string;
}): Promise<ContextoFila> {
  const sedeIdExplicita = sedeIdParaCrear(datos.session, datos.sedeIdSolicitada, { requerido: false });
  if (sedeIdExplicita) await exigirSedeActiva(sedeIdExplicita);

  // Todo lo que no depende de las filas, en paralelo.
  const [sedes, marcas, sistemas, antivirus, licencias, existentes, empleados] = await Promise.all([
    // Solo sedes activas: una fila no trae equipos a una sede desactivada (2.9).
    prisma.sede.findMany({ where: { activa: true }, select: { id: true, nombre: true, codigo: true } }),
    // Catalogos administrables: se validan fila por fila sin texto fijo.
    prisma.marca.findMany({ select: { nombre: true } }),
    prisma.sistemaOperativo.findMany({ select: { nombre: true } }),
    prisma.antivirus.findMany({ select: { nombre: true } }),
    prisma.licenciaMicrosoft365.findMany({ select: { nombre: true } }),
    seriesEImeiExistentes(datos.filas),
    precargarEmpleadosPorRut(datos.filas.map((f) => f.rut ?? ""), prisma),
  ]);

  return {
    session: datos.session,
    categoriaId: datos.categoriaId,
    exigeImei: datos.exigeImei,
    tipoMantencionId: datos.tipoMantencionId,
    sedeIdExplicita,
    mapaSedes: construirMapaSedes(sedes),
    mapaMarcas: construirMapaCatalogo(marcas),
    mapaSistemasOperativos: construirMapaCatalogo(sistemas),
    mapaAntivirus: construirMapaCatalogo(antivirus),
    mapaLicenciasM365: construirMapaCatalogo(licencias),
    ...existentes,
    ...empleados,
  };
}

/**
 * Series e IMEI de estas filas que ya existen en la base. Solo esas hacen
 * falta: los repetidos dentro del mismo archivo los detecta procesarFila al
 * ir agregando cada fila a los mismos conjuntos. La serie se compara sin
 * distinguir mayusculas, igual que procesarFila.
 */
export async function seriesEImeiExistentes(filas: Record<string, string>[]) {
  const series = [...new Set(filas.map((f) => (f.numeroSerie ?? "").toUpperCase()).filter(Boolean))];
  const imeis = [...new Set(filas.map((f) => normalizarImei(f.imei ?? "")).filter(Boolean))];

  const [conSerie, conImei] = await Promise.all([
    series.length
      ? prisma.$queryRaw<{ serie: string }[]>`
          SELECT upper(numero_serie) AS serie FROM assets WHERE upper(numero_serie) = ANY(${series})`
      : [],
    imeis.length ? prisma.asset.findMany({ where: { imei: { in: imeis } }, select: { imei: true } }) : [],
  ]);

  return {
    existingSeriesSet: new Set(conSerie.map((a) => a.serie)),
    existingImeiSet: new Set(conImei.map((a) => a.imei!)),
  };
}
