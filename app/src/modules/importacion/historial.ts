import { ApiError } from '@/shared/errores';
import { prisma } from '@/shared/prisma';
import { quienHace, type SesionAutenticada } from '@/shared/auth/guard';
import { formatearFechaCorta } from '@/shared/utilidades/fechas';
import { limpiarRut } from '@/shared/validaciones/rut';
import { assetHistoryService } from '@/modules/activos/servidor';
import { registrarAsignacionImportada } from '@/modules/asignaciones/servidor';
import { buscarPersona, type PersonaIndexada } from '@/modules/personas';
import { actualizarIndice, cargarIndicePersonas, encontrarOCrearPersona, type DatosPersonaImportada } from '@/modules/personas/servidor';
import { convertExcelDateValue, parseDDMMYYYYToDate } from '@/modules/importacion/excel';
import { leerHoja, nombresDeHojas, type Celda } from '@/modules/importacion/leerExcel';
import { normalizarImei } from '@/modules/activos';

/**
 * Historial de cada equipo (SPEC 2.133): las entregas ANTERIORES de un archivo
 * normalizado (hojas ENTREGAS y PERSONAS) quedan como asignaciones cerradas del
 * equipo, con su persona y sus fechas, igual que las de cualquier activo. Los
 * equipos tienen que estar ya importados (se buscan por IMEI o, sin IMEI, por N° de
 * serie: un celular lleva IMEI; un monitor, un mouse o una impresora, su serie). Una persona que
 * no existe se crea con el estado que dice la hoja PERSONAS: una que ya no tiene
 * nada asignado entra desvinculada. Importar dos veces no repite nada.
 */

/** Lo maximo por archivo: cada entrega son varias escrituras y todo va en una peticion. */
export const MAX_ENTREGAS_HISTORIAL = 1000;

type EntregaArchivo = {
  fila: number;
  imei: string;
  /** N° de serie: identifica al equipo cuando la fila no trae IMEI (monitores, perifericos, impresoras). */
  serie: string;
  rut: string;
  persona: string;
  desde: Date | null;
  hasta: Date | null;
  /** Comentario de la entrega (ej. por que termino): queda en el historial de la persona. */
  observaciones: string;
};

type PersonaArchivo = Omit<DatosPersonaImportada, 'sedeId'>;

export type ResultadoEntrega = {
  fila: number;
  /** El IMEI o, sin IMEI, el N° de serie del equipo. */
  equipo: string;
  persona: string;
  resultado: 'registrada' | 'repetida' | 'error';
  mensaje?: string;
  /** La persona no existia y se crea (o se crearia) con este estado. */
  personaNueva?: 'activo' | 'desvinculado';
};

export type ResumenHistorial = {
  confirmado: boolean;
  total: number;
  registradas: number;
  repetidas: number;
  errores: number;
  personasNuevasActivas: number;
  personasNuevasDesvinculadas: number;
  resultados: ResultadoEntrega[];
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?]/g, '').trim();
const texto = (c: Celda | undefined) => (c === undefined || c === '' ? '' : String(c).replace(/\s+/g, ' ').trim());

/** Fecha de una celda (numero de serie de Excel o texto dd-mm-aaaa), o null. */
function fechaDe(c: Celda | undefined): Date | null {
  if (c === undefined || c === '') return null;
  return parseDDMMYYYYToDate(convertExcelDateValue(c));
}

/** Pasa una hoja a filas `{ columna normalizada: celda }`. */
function filasPorColumna(hoja: Awaited<ReturnType<typeof leerHoja>>) {
  const cols = hoja.headers.map(sinTildes);
  return hoja.filas.map((f) => ({
    rowNum: f.rowNum,
    valor: (...nombres: string[]): Celda | undefined => {
      const i = cols.findIndex((c) => nombres.includes(c));
      return i === -1 ? undefined : f.celdas[i];
    },
  }));
}

/** Lee las hojas ENTREGAS (obligatoria) y PERSONAS (opcional) del archivo normalizado. */
async function leerArchivo(buffer: ArrayBuffer) {
  const hojas = await nombresDeHojas(buffer);
  const nombreDe = (n: string) => hojas.find((h) => sinTildes(h) === n);
  const hojaEntregas = nombreDe('entregas');
  if (!hojaEntregas) throw new ApiError(400, 'El archivo no tiene la hoja ENTREGAS. Usa el Excel normalizado de celulares.');

  const entregas: EntregaArchivo[] = [];
  for (const f of filasPorColumna(await leerHoja(buffer, hojaEntregas))) {
    // Solo las entregas anteriores: la actual la crea la importacion de Activos.
    if (sinTildes(texto(f.valor('actual?', 'actual'))) !== 'no') continue;
    const persona = texto(f.valor('persona'));
    // Un periodo sin persona (el equipo estaba en bodega) no es una entrega.
    if (!persona || persona.startsWith('(')) continue;
    entregas.push({
      fila: f.rowNum,
      imei: normalizarImei(texto(f.valor('imei'))),
      serie: texto(f.valor('n° serie', 'n serie', 'serie', 's/n')),
      rut: texto(f.valor('rut')),
      persona,
      desde: fechaDe(f.valor('desde')),
      hasta: fechaDe(f.valor('hasta')),
      observaciones: texto(f.valor('observaciones', 'comentario')),
    });
  }

  const personas = new Map<string, PersonaArchivo>();
  const hojaPersonas = nombreDe('personas');
  if (hojaPersonas) {
    for (const f of filasPorColumna(await leerHoja(buffer, hojaPersonas))) {
      const rut = texto(f.valor('rut'));
      if (!rut) continue;
      personas.set(limpiarRut(rut).toUpperCase(), {
        rut,
        nombres: texto(f.valor('nombres', 'nombre')),
        apellidoPaterno: texto(f.valor('apellido p.', 'apellido paterno')),
        apellidoMaterno: texto(f.valor('apellido m.', 'apellido materno')),
        correoEmpresa: texto(f.valor('correo empresa')) || null,
        cargo: texto(f.valor('cargo')) || null,
        jefatura: texto(f.valor('jefatura')) || null,
        supervisor: texto(f.valor('supervisor')) || null,
        ubicacion: texto(f.valor('comuna')) || null,
        // Sin nada asignado hoy una persona ya no esta: entra desvinculada salvo que la hoja diga otra cosa.
        estado: sinTildes(texto(f.valor('estado'))).startsWith('activ') ? 'activo' : 'desvinculado',
      });
    }
  }
  if (entregas.length > MAX_ENTREGAS_HISTORIAL) {
    throw new ApiError(400, `El archivo trae ${entregas.length} entregas anteriores; el máximo por archivo es ${MAX_ENTREGAS_HISTORIAL}.`);
  }
  return { entregas, personas };
}

const fechaTexto = (d: Date | null) => (d ? formatearFechaCorta(d) : 'fecha desconocida');

/**
 * Revisa (`confirmar: false`) o importa (`confirmar: true`) el historial de equipos del
 * archivo. La revision y la importacion usan las mismas reglas, asi lo que se ve es lo que
 * se guarda.
 */
export async function importarHistorial(buffer: ArrayBuffer, session: SesionAutenticada, confirmar: boolean): Promise<ResumenHistorial> {
  const { entregas, personas } = await leerArchivo(buffer);
  const usuario = quienHace(session);

  // Cada equipo se busca por su IMEI o, si la entrega no trae IMEI, por su N° de serie (sin distinguir mayusculas).
  const imeis = [...new Set(entregas.map((e) => e.imei).filter(Boolean))];
  const series = [...new Set(entregas.filter((e) => !e.imei).map((e) => e.serie.toUpperCase()).filter(Boolean))];
  const idsPorSerie = series.length
    ? (await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM assets WHERE upper(numero_serie) = ANY(${series})`).map((a) => a.id)
    : [];
  const [activos, indice] = await Promise.all([
    prisma.asset.findMany({
      where: { deletedAt: null, OR: [{ imei: { in: imeis } }, { id: { in: idsPorSerie } }] },
      select: { id: true, imei: true, numeroSerie: true, sedeId: true },
    }),
    cargarIndicePersonas(prisma),
  ]);
  const porImei = new Map(activos.filter((a) => a.imei).map((a) => [a.imei as string, a]));
  const porSerie = new Map(activos.filter((a) => a.numeroSerie).map((a) => [(a.numeroSerie as string).toUpperCase(), a]));

  const resultados: ResultadoEntrega[] = [];
  for (const e of entregas) {
    const equipo = e.imei || e.serie;
    const base = { fila: e.fila, equipo, persona: e.persona };
    const falla = (mensaje: string) => resultados.push({ ...base, resultado: 'error', mensaje });

    const activo = e.imei ? porImei.get(e.imei) : e.serie ? porSerie.get(e.serie.toUpperCase()) : undefined;
    if (!activo) {
      falla(
        !equipo
          ? 'La entrega no trae IMEI ni N° de serie'
          : `No hay un equipo con ${e.imei ? 'el IMEI' : 'el N° de serie'} ${equipo} en el sistema: importa primero los equipos`
      );
      continue;
    }
    // La persona: sus datos salen de la hoja PERSONAS; sin RUT en la fila, se busca por el nombre.
    const delArchivo = e.rut ? personas.get(limpiarRut(e.rut).toUpperCase()) : undefined;
    const consulta = delArchivo ?? { rut: e.rut || null, nombres: e.persona.split(' ')[0], apellidoPaterno: e.persona.split(' ').slice(1).join(' ') };
    const busqueda = buscarPersona(indice, consulta);
    if (busqueda.tipo === 'ambigua') {
      falla(`${e.persona} calza con ${busqueda.candidatas.length} personas del sistema: agrega su RUT`);
      continue;
    }
    if (busqueda.tipo === 'duplicado') {
      falla(`El RUT de ${e.persona} es nuevo, pero ya existe ${busqueda.persona.nombres} ${busqueda.persona.apellidoPaterno} con el RUT ${busqueda.persona.rut}`);
      continue;
    }
    if (busqueda.tipo === 'no_existe' && (!delArchivo || !delArchivo.nombres || !delArchivo.apellidoPaterno)) {
      falla(`${e.persona} no está en el sistema ni en la hoja PERSONAS del archivo`);
      continue;
    }

    const existente = busqueda.tipo === 'encontrada' ? busqueda.persona : null;
    // Ya registrada (importar dos veces no repite): misma persona, mismo equipo y misma fecha de entrega.
    if (existente && !existente.id.startsWith('(pendiente)')) {
      const repetida = await prisma.assignment.findFirst({
        where: { assetId: activo.id, employeeId: existente.id, fechaEntrega: e.desde },
        select: { id: true },
      });
      if (repetida) {
        resultados.push({ ...base, resultado: 'repetida' });
        continue;
      }
    }
    const personaNueva = existente ? undefined : delArchivo!.estado;
    const hasta = e.desde && e.hasta && e.hasta < e.desde ? e.desde : e.hasta;

    if (!confirmar) {
      // Sin escribir: la persona nueva queda "pendiente" para que otra entrega suya no cuente doble.
      if (!existente) indice.push(personaPendiente(e.rut, delArchivo!));
      resultados.push({ ...base, resultado: 'registrada', personaNueva });
      continue;
    }

    try {
      const guardada = await prisma.$transaction(async (tx) => {
        const r = await encontrarOCrearPersona(tx, indice, { ...(delArchivo ?? consulta), sedeId: activo.sedeId, estado: delArchivo?.estado ?? 'desvinculado' }, usuario);
        if (r.tipo !== 'creada' && r.tipo !== 'existente') throw new Error('No se pudo determinar la persona');
        // Entrega cerrada: el equipo ya no esta con ella (su estado actual lo trae la importacion de Activos).
        await registrarAsignacionImportada(tx, {
          assetId: activo.id,
          employeeId: r.persona.id,
          fechaEntrega: e.desde,
          fechaDevolucion: hasta,
          tipoMovimiento: 'ingreso',
          observacionesDevolucion: e.observaciones
            ? `Entrega anterior importada desde Excel: ${e.observaciones.slice(0, 900)}`
            : 'Entrega anterior importada desde Excel',
          activo: false,
        });
        await assetHistoryService.registrar(
          {
            assetId: activo.id,
            tipoEvento: 'asignacion',
            descripcion: `Entrega anterior: ${e.persona}, del ${fechaTexto(e.desde)} al ${fechaTexto(hasta)} (importada desde Excel)`,
            datosNuevos: { historicaImportada: true, employeeId: r.persona.id },
            usuarioSistema: usuario,
          },
          tx
        );
        return r;
      });
      // Ya confirmada: la persona queda en el indice para las entregas que siguen.
      if (guardada.tipo === 'creada' || guardada.tipo === 'existente') actualizarIndice(indice, guardada.persona);
      resultados.push({ ...base, resultado: 'registrada', personaNueva: guardada.tipo === 'creada' ? delArchivo?.estado ?? 'desvinculado' : undefined });
    } catch (error) {
      falla(error instanceof ApiError ? error.message : 'No se pudo guardar la entrega');
    }
  }

  const cuenta = (r: ResultadoEntrega['resultado']) => resultados.filter((x) => x.resultado === r).length;
  return {
    confirmado: confirmar,
    total: resultados.length,
    registradas: cuenta('registrada'),
    repetidas: cuenta('repetida'),
    errores: cuenta('error'),
    personasNuevasActivas: resultados.filter((r) => r.personaNueva === 'activo').length,
    personasNuevasDesvinculadas: resultados.filter((r) => r.personaNueva === 'desvinculado').length,
    resultados,
  };
}

/** Persona que la revision "crea" en memoria, solo para no contarla dos veces. */
function personaPendiente(rut: string, p: PersonaArchivo): PersonaIndexada {
  return {
    id: `(pendiente) ${rut}`,
    rut: rut || null,
    nombres: p.nombres ?? '',
    apellidoPaterno: p.apellidoPaterno ?? '',
    apellidoMaterno: p.apellidoMaterno ?? null,
    estado: p.estado,
    correoEmpresa: null,
    correoPersonal: null,
    cargo: null,
    jefatura: null,
    supervisor: null,
    ubicacion: null,
  };
}
