import { prisma } from '@/shared/prisma';
import { ApiError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { interpretarRut } from '@/modules/importacion';
import { leerHoja, nombresDeHojas, type Celda } from '@/modules/importacion/servidor';
import { buscarPersona, type PersonaIndexada } from '@/modules/personas';
import { actualizarIndice, cargarIndicePersonas, encontrarOCrearPersona } from '@/modules/personas/servidor';
import { estadoPorClave } from '@/modules/lineas/catalogos';
import { CON_NOMBRES, registrarHistorial } from '@/modules/lineas/historial';
import { abrirTenencia, cambiarTenencia, registrarEntregasAnteriores } from '@/modules/lineas/tenencia';
import { normalizarNumero } from '@/modules/lineas/validaciones';
import {
  CAMPOS_CATALOGO,
  mapeoSugerido,
  mismoNombre,
  opcionDelValor,
  type CampoImportacion,
  type FilaImportacion,
  type MapeoLineas,
} from '@/modules/lineas/camposImportacion';

/**
 * Importacion de lineas en Configuracion > Importar (SPEC 2.131), por pasos
 * como la de activos: 1) hojas del archivo, 2) columnas y mapeo propuesto,
 * 3) vista previa: cada linea validada y los valores de estado, tipo de
 * chip y operador que hay que asociar a una opcion del catalogo o agregar,
 * 4) guardar en tandas. Nada se guarda hasta el paso 4.
 *
 * Una fila es una entrega; un numero repetido en el archivo es la misma linea
 * entregada varias veces: la ultima fila es la persona de hoy y las anteriores
 * quedan en su historial de tenencia. Una linea que ya existe solo completa los
 * datos que le faltan: lo editado a mano no se pisa.
 */

/** Valores que el Excel pone cuando no hay dato. */
const SIN_DATO = /^(n\/a|na|n\.a\.?|s\/i|sin datos?|#n\/a|-+)$/i;
const texto = (v: Celda | undefined) => {
  const t = String(v ?? '').trim();
  return t && !SIN_DATO.test(t) ? t : null;
};

/** Fecha de una celda: numero de serie de Excel o texto "2026-08-13". */
function fecha(v: Celda | undefined): string | null {
  const d = typeof v === 'number' ? new Date((v - 25_569) * 86_400_000) : v ? new Date(String(v)) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/** Filas de una hoja como objetos. El encabezado es la primera fila con al menos dos columnas conocidas. */
async function leerFilas(buffer: ArrayBuffer, hoja: string) {
  const { headers, filas } = await leerHoja(buffer, hoja);
  const todas = [{ rowNum: 0, celdas: headers as Celda[] }, ...filas];
  const i = Math.max(0, todas.findIndex((f) => Object.keys(mapeoSugerido(f.celdas.map(String))).length >= 2));
  const encabezados = todas[i].celdas.map((c) => String(c).trim());
  return {
    encabezados: encabezados.filter(Boolean),
    filas: todas.slice(i + 1).map((f) => ({
      fila: f.rowNum,
      valores: Object.fromEntries(encabezados.map((h, c) => [h, f.celdas[c]])) as Record<string, Celda>,
    })),
  };
}

/** Paso 1: las hojas del archivo, proponiendo "NORMALIZADO" o "Consolidado" si estan. */
export async function hojasDelArchivo(buffer: ArrayBuffer) {
  const hojas = await nombresDeHojas(buffer);
  const sugerida = ['Normalizado', 'Consolidado'].map((n) => hojas.find((h) => mismoNombre(h, n))).find(Boolean) ?? hojas[0];
  return { hojas, sugerida };
}

/** Paso 2: las columnas de la hoja, unas filas de ejemplo y el mapeo propuesto. */
export async function columnasDeHoja(buffer: ArrayBuffer, hoja: string) {
  const { encabezados, filas } = await leerFilas(buffer, hoja);
  return {
    encabezados,
    ejemplo: filas.slice(0, 5).map((f) => f.valores),
    mapeo: mapeoSugerido(encabezados),
    total: filas.length,
  };
}

/** Fecha de baja de la hoja "Bajas" de la conciliacion, si el archivo la trae. */
async function fechasDeBajas(buffer: ArrayBuffer) {
  const hoja = (await nombresDeHojas(buffer)).find((h) => mismoNombre(h, 'Bajas'));
  if (!hoja) return new Map<string, string>();
  const { filas } = await leerFilas(buffer, hoja);
  return new Map(
    filas.flatMap((f) => {
      const numero = normalizarNumero(String(f.valores['Línea normalizada'] ?? ''));
      const dia = fecha(f.valores['Fecha actualización']);
      return numero && dia ? [[numero, dia] as const] : [];
    })
  );
}

/** Opciones activas de los catalogos, para proponer a que opcion va cada valor del Excel. */
async function catalogosActivos() {
  const activos = { where: { activo: true }, select: { id: true, nombre: true } };
  const [estado, tipoChip, operador] = await Promise.all([
    prisma.estadoLinea.findMany(activos),
    prisma.tipoChip.findMany(activos),
    prisma.operadorLinea.findMany(activos),
  ]);
  return { estado, tipoChip, operador };
}

type Entrada = {
  fila: number;
  crudo: string;
  numero: string | null;
  rut: string | null;
  nombre: string | null;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  imei: string | null;
  desde: string | null;
  estado: string | null;
  tipoChip: string | null;
  operador: string | null;
  fechaBaja: string | null;
  observaciones: string | null;
};

/**
 * Filas seguidas de la misma persona y fecha son una sola entrega (ej. la del
 * equipo y la de su SIM): se juntan, y la ultima completa los datos que la
 * anterior tenia.
 */
function juntarEntregas(grupo: Entrada[]): Entrada[] {
  const clave = (e: Entrada) => (e.rut ?? e.nombre ?? '').toLowerCase();
  const juntas: Entrada[] = [];
  for (const e of grupo) {
    const previa = juntas.at(-1);
    if (previa && clave(previa) === clave(e) && previa.desde === e.desde) {
      juntas[juntas.length - 1] = Object.fromEntries(Object.keys(e).map((k) => [k, e[k as keyof Entrada] ?? previa[k as keyof Entrada]])) as Entrada;
    } else {
      juntas.push(e);
    }
  }
  return juntas;
}

type PersonaDeEntrada = Pick<Entrada, 'rut' | 'nombres' | 'apellidoPaterno' | 'apellidoMaterno'>;

/**
 * El RUT de una fila para buscar o crear a su persona. Uno valido sirve para las dos cosas; uno
 * con digito verificador malo (un error de tipeo) solo sirve para encontrar a quien ya existe con
 * ese mismo RUT: nunca se crea a alguien con un RUT invalido.
 */
function rutDeLaFila(indice: PersonaIndexada[], crudo: string | null): string | null {
  const lectura = interpretarRut(crudo);
  if (lectura.tipo === 'valido') return lectura.rut;
  return crudo && buscarPersona(indice, { rut: crudo }).tipo === 'encontrada' ? crudo : null;
}

/**
 * Que pasa con la persona de una entrada (SPEC 2.133): ya existe (nada que avisar), se crea
 * (aviso) o no se puede decidir (aviso, queda el nombre en las observaciones). Anota las que se crean.
 */
function avisoDePersona(indice: PersonaIndexada[], e: PersonaDeEntrada, nuevas: Set<string>): string | null {
  const rut = rutDeLaFila(indice, e.rut);
  const conNombre = !!e.nombres && !!e.apellidoPaterno;
  if (!rut && !conNombre) {
    return e.rut ? 'El RUT no es válido y la fila no trae su nombre: queda en las observaciones' : null;
  }
  const busqueda = buscarPersona(indice, { rut, nombres: e.nombres, apellidoPaterno: e.apellidoPaterno, apellidoMaterno: e.apellidoMaterno });
  if (busqueda.tipo === 'encontrada') return null;
  if (busqueda.tipo === 'ambigua') return 'Su nombre calza con varias personas del sistema: agrega su RUT (queda en las observaciones)';
  if (busqueda.tipo === 'duplicado') return `El RUT es nuevo, pero ${busqueda.persona.nombres} ${busqueda.persona.apellidoPaterno} ya existe con el RUT ${busqueda.persona.rut}: ¿RUT mal escrito? (queda en las observaciones)`;
  if (!conNombre) return 'El RUT no está en el sistema y la fila no trae su nombre: queda en las observaciones';
  nuevas.add((rut ?? `${e.nombres} ${e.apellidoPaterno}`).toLowerCase());
  return rut ? 'La persona no está en el sistema: se crea' : 'La persona no está en el sistema y la fila no trae su RUT: se crea sin RUT (completarlo en Personal)';
}

/**
 * Paso 3: valida todas las filas con el mapeo elegido, sin guardar nada. Junta
 * las filas de un mismo numero en una linea (la ultima es la actual, las demas
 * son entregas anteriores). Devuelve cada linea con sus errores (no se
 * importa) y avisos (se importa igual), y los valores distintos de cada
 * catalogo con la opcion que calza.
 */
export async function vistaPreviaLineas(buffer: ArrayBuffer, hoja: string, mapeo: MapeoLineas) {
  if (!mapeo.numero) throw new ApiError(400, 'Elige la columna del número');
  const { filas } = await leerFilas(buffer, hoja);
  const bajas = await fechasDeBajas(buffer);
  const [indice, celulares, existentes, catalogos] = await Promise.all([
    // Todas las personas: la de cada linea se busca por RUT o por nombre (SPEC 2.133).
    cargarIndicePersonas(prisma),
    prisma.asset.findMany({ where: { imei: { not: null }, deletedAt: null, categoria: { tipoFicha: 'celular' } }, select: { imei: true } }),
    prisma.lineaTelefonica.findMany({ select: { numero: true } }),
    catalogosActivos(),
  ]);
  const imeis = new Set(celulares.map((c) => c.imei!));
  const yaExisten = new Set(existentes.map((l) => l.numero));
  const valor = (f: (typeof filas)[number], campo: CampoImportacion) => (mapeo[campo] ? f.valores[mapeo[campo]!] : undefined);

  const entradas: Entrada[] = filas.map((f) => {
    const crudo = String(valor(f, 'numero') ?? '').trim();
    return {
      fila: f.fila,
      crudo,
      numero: crudo ? normalizarNumero(crudo) : null,
      rut: texto(valor(f, 'rut')),
      nombre: ([valor(f, 'nombre'), valor(f, 'apellidoPaterno'), valor(f, 'apellidoMaterno')].map(texto).filter(Boolean).join(' ').replace(/\s+/g, ' ') || null),
      nombres: texto(valor(f, 'nombre')),
      apellidoPaterno: texto(valor(f, 'apellidoPaterno')),
      apellidoMaterno: texto(valor(f, 'apellidoMaterno')),
      imei: texto(valor(f, 'imei'))?.replace(/\D/g, '') || null,
      desde: fecha(valor(f, 'fechaEntrega')),
      estado: texto(valor(f, 'estado')),
      tipoChip: texto(valor(f, 'tipoChip')),
      operador: texto(valor(f, 'operador')),
      fechaBaja: fecha(valor(f, 'fechaBaja')),
      observaciones: texto(valor(f, 'observaciones')),
    };
  });

  // Las filas de un mismo numero son una sola linea; las sin numero valido, un error cada una.
  const lineas = new Map<string, Entrada[]>();
  const sueltas: Entrada[] = [];
  for (const e of entradas) {
    if (!e.numero) sueltas.push(e);
    else lineas.set(e.numero, [...(lineas.get(e.numero) ?? []), e]);
  }

  const vacia = { estado: null, tipoChip: null, operador: null, fechaEntrega: null, fechaBaja: null, entregas: [] };
  const conError = sueltas.map((e) => ({
    ...vacia,
    fila: e.fila,
    numero: e.crudo,
    existe: false,
    rut: e.rut,
    nombre: e.nombre,
    nombres: e.nombres,
    apellidoPaterno: e.apellidoPaterno,
    apellidoMaterno: e.apellidoMaterno,
    imei: e.imei,
    observaciones: e.observaciones,
    errores: [e.crudo ? `"${e.crudo}" no es un celular de 9 dígitos` : 'Falta el número'],
    avisos: [] as string[],
  }));

  // Personas que no estan en el sistema y se crearian (una sola vez cada una).
  const personasNuevas = new Set<string>();
  const resueltas = [...lineas].map(([numero, grupo]) => {
    const entregas = juntarEntregas(grupo);
    const ultima = entregas.at(-1)!;
    const avisos: string[] = [];
    // Datos de la linea que pueden venir solo en alguna fila: el ultimo que haya.
    const ultimo = <K extends 'estado' | 'tipoChip' | 'operador' | 'fechaBaja' | 'observaciones'>(k: K) =>
      [...grupo].reverse().map((e) => e[k]).find((v) => v != null) ?? null;
    const listaRuts = (ultima.rut ?? '').split('|').map((r) => r.trim()).filter(Boolean);
    if (listaRuts.length > 1) avisos.push('Figura con más de una persona: queda en las observaciones para revisar');
    else {
      const aviso = avisoDePersona(indice, ultima, personasNuevas);
      if (aviso) avisos.push(aviso);
    }
    // Las personas de las entregas anteriores tambien se crean (desvinculadas) si no estan.
    for (const e of entregas.slice(0, -1)) avisoDePersona(indice, e, personasNuevas);
    if (ultima.imei && !imeis.has(ultima.imei)) avisos.push('No hay un celular con ese IMEI: queda sin celular');
    return {
      ...vacia,
      fila: ultima.fila,
      numero,
      existe: yaExisten.has(numero),
      estado: ultimo('estado'),
      tipoChip: ultimo('tipoChip'),
      operador: ultimo('operador'),
      rut: ultima.rut,
      nombre: ultima.nombre,
      imei: ultima.imei,
      fechaEntrega: ultima.desde,
      fechaBaja: ultimo('fechaBaja') ?? bajas.get(numero) ?? null,
      observaciones: ultimo('observaciones'),
      nombres: ultima.nombres,
      apellidoPaterno: ultima.apellidoPaterno,
      apellidoMaterno: ultima.apellidoMaterno,
      entregas: entregas.slice(0, -1).map((e) => ({ fila: e.fila, rut: e.rut, nombre: e.nombre, nombres: e.nombres, apellidoPaterno: e.apellidoPaterno, apellidoMaterno: e.apellidoMaterno, imei: e.imei, desde: e.desde })),
      errores: [] as string[],
      avisos,
    };
  });

  const resultado = [...resueltas, ...conError].sort((a, b) => a.fila - b.fila);

  // Valores distintos de cada catalogo, con cuantas lineas los usan y la opcion que calza.
  const valores = Object.fromEntries(
    (Object.keys(CAMPOS_CATALOGO) as (keyof typeof CAMPOS_CATALOGO)[]).map((campo) => {
      const conteo = new Map<string, number>();
      for (const r of resultado) {
        const v = r[campo];
        if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
      }
      return [
        campo,
        [...conteo].map(([v, filas]) => ({
          valor: v,
          filas,
          opcionId: opcionDelValor(campo, v, catalogos[campo]),
        })),
      ];
    })
  );

  return {
    filas: resultado,
    valores,
    resumen: {
      total: resultado.length,
      nuevas: resultado.filter((r) => !r.errores.length && !r.existe).length,
      existentes: resultado.filter((r) => !r.errores.length && r.existe).length,
      conError: resultado.filter((r) => r.errores.length).length,
      conAviso: resultado.filter((r) => !r.errores.length && r.avisos.length).length,
      entregasAnteriores: resultado.reduce((s, r) => s + r.entregas.length, 0),
      personasNuevas: personasNuevas.size,
    },
  };
}

/**
 * Fechas de las entregas en orden: la que falta toma la anterior (o la primera
 * conocida, si falta al principio) y ninguna retrocede ni es futura. Sin ninguna
 * fecha, todas son la de los datos.
 */
function fechasEnOrden(fechas: (string | null | undefined)[], respaldo: Date): Date[] {
  const conocida = fechas.find(Boolean);
  let anterior = conocida ? new Date(conocida) : respaldo;
  const ahora = new Date();
  return fechas.map((f) => {
    let d = f ? new Date(f) : anterior;
    if (d < anterior) d = anterior;
    if (d > ahora) d = ahora;
    anterior = d;
    return d;
  });
}

/**
 * Paso 4: guarda una tanda. Cada linea va en su propia transaccion: si una
 * falla, las demas se guardan y se informa cual. El celular (por IMEI) se busca
 * aqui de nuevo, sin confiar en la pantalla; la persona se busca por RUT o por
 * nombre y, si no esta en el sistema, se crea (SPEC 2.133): activa si es la de
 * hoy, desvinculada si solo tuvo la linea antes.
 */
export async function importarTandaLineas(filas: FilaImportacion[], fechaDatos: string, usuario?: string | null) {
  const vigenteDesde = new Date(fechaDatos);
  const ids = (campo: 'estadoId' | 'tipoChipId' | 'operadorId') => [...new Set(filas.map((f) => f[campo]).filter(Boolean) as string[])];
  const imeis = [...new Set(filas.flatMap((f) => [f.imei, ...f.entregas.map((e) => e.imei)]).filter(Boolean) as string[])];
  const [estados, tipos, operadores, activa, indice, celulares] = await Promise.all([
    // Solo opciones activas: una desactivada no se asigna a lineas nuevas.
    prisma.estadoLinea.findMany({ where: { id: { in: ids('estadoId') }, activo: true } }),
    prisma.tipoChip.findMany({ where: { id: { in: ids('tipoChipId') }, activo: true }, select: { id: true } }),
    prisma.operadorLinea.findMany({ where: { id: { in: ids('operadorId') }, activo: true }, select: { id: true } }),
    estadoPorClave(prisma, 'activa'),
    cargarIndicePersonas(prisma),
    imeis.length
      ? prisma.asset.findMany({ where: { imei: { in: imeis }, deletedAt: null, categoria: { tipoFicha: 'celular' } }, select: { id: true, imei: true, sedeId: true } })
      : [],
  ]);
  const porImei = new Map(celulares.map((c) => [c.imei!, c]));
  const existe = (lista: { id: string }[], id: string | null) => (id && lista.some((o) => o.id === id) ? id : null);

  const resultados: { fila: number; numero: string; resultado: 'nueva' | 'completada' | 'sin cambios' | 'error'; mensaje?: string }[] = [];
  for (const f of filas) {
    const numero = normalizarNumero(f.numero);
    if (!numero) {
      resultados.push({ fila: f.fila, numero: f.numero, resultado: 'error', mensaje: 'Número no válido' });
      continue;
    }
    // Personas que esta linea crea o completa: entran al indice solo si la linea se guarda.
    const tocadas: PersonaIndexada[] = [];
    try {
      const celular = f.imei ? porImei.get(f.imei) ?? null : null;
      const estado = estados.find((e) => e.id === f.estadoId) ?? activa;
      // La persona que se cree toma la sede del celular (la linea no tiene sede propia).
      const sedeId = celular?.sedeId ?? null;
      const r = await prisma.$transaction(async (tx) => {
        const actual = await tx.lineaTelefonica.findUnique({ where: { numero }, include: CON_NOMBRES });

        /** La persona de una fila: la busca (RUT o nombre) y, si no existe, la crea. Sin datos suficientes, null. */
        const personaDe = async (
          e: { rut: string | null; nombres?: string | null; apellidoPaterno?: string | null; apellidoMaterno?: string | null },
          estadoPersona: 'activo' | 'desvinculado',
          sede: string | null
        ) => {
          const ruts = (e.rut ?? '').split('|').map((x) => x.trim()).filter(Boolean);
          if (ruts.length > 1) return null; // figura con mas de una persona: queda en las observaciones para revisar
          const rut = rutDeLaFila(indice, ruts[0] ?? null);
          if (!rut && !(e.nombres && e.apellidoPaterno)) return null;
          const resultado = await encontrarOCrearPersona(
            tx,
            indice,
            { rut, nombres: e.nombres, apellidoPaterno: e.apellidoPaterno, apellidoMaterno: e.apellidoMaterno, sedeId: sede, estado: estadoPersona },
            usuario
          );
          // Ambigua, posible duplicado o sin datos: no se elige a ciegas; queda por su nombre.
          if (resultado.tipo !== 'creada' && resultado.tipo !== 'existente') return null;
          tocadas.push(resultado.persona);
          return resultado.persona.id;
        };

        // Con celular, la persona es la del celular; una linea que ya tiene a alguien no cambia de persona.
        const personaId = !celular && !actual?.activoId && !actual?.empleadoId ? await personaDe(f, 'activo', sedeId) : null;
        // Sin persona ni celular, el nombre que trae el archivo queda en las observaciones.
        const nota = personaId || celular || !f.nombre ? null : `Persona del archivo: ${f.nombre}`;
        const datos = {
          tipoChipId: existe(tipos, f.tipoChipId),
          operadorId: existe(operadores, f.operadorId),
          activoId: celular?.id ?? null,
          // Con celular, la persona es la del celular.
          empleadoId: celular ? null : personaId,
          observaciones: [f.observaciones, nota].filter(Boolean).join(' · ') || null,
        };

        if (!actual) {
          const linea = await tx.lineaTelefonica.create({
            data: {
              numero,
              ...datos,
              estadoId: estado.id,
              fechaBaja: estado.deBaja ? new Date(f.fechaBaja || fechaDatos) : null,
            },
            include: CON_NOMBRES,
          });
          await registrarHistorial(tx, null, linea, { usuario, vigenteDesde, alta: 'importacion' });
          // Las personas de las entregas anteriores: quien ya no la tiene entra desvinculada si no estaba.
          const personasAnteriores: (string | null)[] = [];
          for (const e of f.entregas) {
            const tel = e.imei ? porImei.get(e.imei) ?? null : null;
            personasAnteriores.push(await personaDe(e, 'desvinculado', tel?.sedeId ?? sedeId));
          }
          // Las entregas anteriores del archivo (historial) y la actual, desde su fecha de entrega.
          const fechas = fechasEnOrden([...f.entregas.map((e) => e.desde), f.fechaEntrega], vigenteDesde);
          await registrarEntregasAnteriores(
            tx,
            linea.id,
            f.entregas.map((e, i) => {
              const tel = e.imei ? porImei.get(e.imei) ?? null : null;
              return { activoId: tel?.id ?? null, empleadoId: personasAnteriores[i], desde: fechas[i] };
            }),
            fechas[fechas.length - 1],
            usuario
          );
          await abrirTenencia(tx, linea, { desde: fechas[fechas.length - 1], origen: 'importacion', usuario });
          await auditLogService.registrarCreacion('linea', linea.id, `Línea ${numero} importada`, { numero, ...datos, estado: estado.nombre }, usuario, tx);
          return 'nueva' as const;
        }
        // Solo lo que le falta; el estado no se toca. Con celular no lleva persona.
        const completables: Record<string, string | number | null> = { ...datos };
        if (actual.activoId || completables.activoId) completables.empleadoId = null;
        const faltan = Object.fromEntries(
          Object.entries(completables).filter(([k, v]) => v !== null && actual[k as keyof typeof actual] === null)
        );
        if (Object.keys(faltan).length === 0) return 'sin cambios' as const;
        const linea = await tx.lineaTelefonica.update({ where: { id: actual.id }, data: faltan, include: CON_NOMBRES });
        await registrarHistorial(tx, actual, linea, { usuario, vigenteDesde });
        // Si le puso telefono o persona, cambia su tramo de tenencia (desde ahora).
        if ('activoId' in faltan || 'empleadoId' in faltan) {
          await cambiarTenencia(
            tx,
            actual.id,
            { activoId: linea.activoId, empleadoId: linea.empleadoId },
            { desde: new Date(), origen: 'importacion', usuario }
          );
        }
        await auditLogService.registrarActualizacion('linea', actual.id, `Línea ${numero} completada con la importación`, {}, faltan, usuario, tx);
        return 'completada' as const;
      });
      // La linea se guardo: sus personas quedan en el indice para las que siguen.
      for (const persona of tocadas) actualizarIndice(indice, persona);
      resultados.push({ fila: f.fila, numero, resultado: r });
    } catch (error) {
      resultados.push({ fila: f.fila, numero, resultado: 'error', mensaje: error instanceof ApiError ? error.message : 'No se pudo guardar' });
    }
  }
  return resultados;
}
