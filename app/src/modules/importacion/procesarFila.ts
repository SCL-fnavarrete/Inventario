import { logger } from "@/shared/logger";
import { crearPersonaEnTx } from "@/modules/personas/servidor";
import { registrarAsignacionImportada } from "@/modules/asignaciones/servidor";
import { registrarMantencionImportada } from "@/modules/mantenciones/servidor";
import { parseDDMMYYYYToDate } from "@/modules/importacion/excel";
import { formatearFechaCorta, inicioDeHoy } from "@/shared/utilidades/fechas";
import { leerClp, VALOR_MAXIMO_CLP } from "@/shared/utilidades/moneda";
import {
  ESTADOS_RECONOCIDOS,
  interpretarEstado,
  interpretarRut,
  mensajeSerieDuplicada,
  resolverCondicion,
  resolverEstado,
  resolverSedeParaFila,
  resolverValorCatalogo,
  tieneMicrosoft365,
} from "@/modules/importacion/reglasFila";
import { limpiarRut } from "@/shared/validaciones/rut";
import { normalizarImei, validarImei } from "@/modules/activos";
import {
  crearActivoImportado,
  assetHistoryService,
  type AssetHistoryData,
} from "@/modules/activos/servidor";
import { Prisma } from "@prisma/client";
import { quienHace, type SesionAutenticada } from "@/shared/auth/guard";
import type { ValidationErrorType } from "@/modules/importacion/tipos";
import type { prisma as prismaSingleton } from "@/shared/prisma";

/**
 * Solo los modelos que esta funcion realmente usa -- asi tanto el cliente
 * de Prisma normal como el `tx` de una transaccion (que no trae `$transaction`
 * ni el resto de los metodos de nivel-cliente) sirven como este tipo.
 */
type PrismaParaFila = Pick<
  typeof prismaSingleton,
  "asset" | "assetHistory" | "assignment" | "maintenance" | "employee" | "$transaction"
>;

export interface ContextoFila {
  session: SesionAutenticada;
  /** Solo hace falta cuando dryRun es false -- en preview no se escribe nada. */
  categoriaId: string;
  /** La categoria tiene campos de celular: cada fila se identifica por su
   * IMEI, obligatorio, y el N° de serie es opcional (SPEC 2.112.7). */
  exigeImei: boolean;
  tipoMantencionId: string;
  sedeIdExplicita: string | null;
  mapaSedes: Record<string, string>;
  /** Igual que mapaSedes, pero para las opciones de cada catalogo
   * administrable (Configuracion > Opciones de Activos): texto normalizado
   * -> nombre canonico. Se arman una sola vez por importacion. */
  mapaMarcas: Record<string, string>;
  mapaSistemasOperativos: Record<string, string>;
  mapaAntivirus: Record<string, string>;
  mapaLicenciasM365: Record<string, string>;
  /** Compartido y mutado entre filas del mismo archivo (en orden), para que
   * una fila detecte que otra fila anterior del MISMO archivo ya "reservo"
   * un numero de serie o un RUT -- igual en preview que en la escritura real. */
  existingSeriesSet: Set<string>;
  /** Igual que existingSeriesSet, para los IMEI (SPEC 2.112.7). */
  existingImeiSet: Set<string>;
  employeeCache: Map<string, string>;
  /** RUT de empleados ya existentes que estan desvinculados (ver
   * precargarEmpleadosPorRut). Se completa tambien con los que se buscan
   * fila por fila. */
  empleadosDesvinculados: Set<string>;
}

export interface ResultadoFilaError {
  status: "error";
  tipo: ValidationErrorType;
  mensaje: string;
  data: Record<string, string>;
  /** Campo al que se le puede atribuir el error, para que la pantalla de
   * revision resalte el control correcto (ver ErrorRowEditor). Opcional --
   * no todos los errores son de un campo puntual. */
  campo?: string;
}
export interface ResultadoFilaValida {
  status: "valid";
  data: Record<string, string>;
}
export interface ResultadoFilaImportada {
  status: "imported";
  data: Record<string, string>;
  assetId: string;
}
export type ResultadoFila = ResultadoFilaError | ResultadoFilaValida | ResultadoFilaImportada;

/** Marca, solo dentro de una vista previa, que un RUT ya quedo "resuelto" por
 * una fila anterior del mismo archivo (sin haber escrito nada de verdad) --
 * nunca se usa como id real, asi que si por error llegara a la escritura se
 * trata explicitamente como si no hubiera cache (ver mas abajo). */
const PLACEHOLDER_EMPLEADO_PENDIENTE = "(pendiente-en-esta-importacion)";

/** Tamaño de cada `rut IN (...)` al precargar empleados. */
const RUTS_POR_CONSULTA = 1000;

/**
 * Arma el `employeeCache` inicial con los empleados que ya existen para los
 * RUT de la importacion (auditoria 27-sep-2026, 2.4). Antes cada fila hacia
 * su propio `findUnique` por RUT: 5.000 filas eran 5.000 consultas. Ahora son
 * unas pocas `IN`, de a mil RUT. Los RUT invalidos o vacios se ignoran: la
 * fila los rechaza igual en procesarFila. Devuelve tambien que RUT estan
 * desvinculados (2.9).
 */
export async function precargarEmpleadosPorRut(
  valoresRut: string[],
  prismaClient: Pick<typeof prismaSingleton, "employee">
): Promise<Pick<ContextoFila, "employeeCache" | "empleadosDesvinculados">> {
  const ruts = new Set<string>();
  for (const valor of valoresRut) {
    const lectura = interpretarRut(valor);
    if (lectura.tipo === "valido") ruts.add(lectura.rut);
  }

  const employeeCache = new Map<string, string>();
  const empleadosDesvinculados = new Set<string>();
  const lista = [...ruts];
  for (let i = 0; i < lista.length; i += RUTS_POR_CONSULTA) {
    const encontrados = await prismaClient.employee.findMany({
      where: { rut: { in: lista.slice(i, i + RUTS_POR_CONSULTA) } },
      select: { id: true, rut: true, estado: true },
    });
    for (const e of encontrados) {
      if (!e.rut) continue;
      employeeCache.set(e.rut, e.id);
      if (e.estado === "desvinculado") empleadosDesvinculados.add(e.rut);
    }
  }
  return { employeeCache, empleadosDesvinculados };
}

/**
 * Reglas de negocio de UNA fila de importacion de Activos, compartidas entre
 * la vista previa (dryRun: true, solo lecturas) y la confirmacion real
 * (dryRun: false, escribe). Una sola funcion asegura que lo que la vista
 * previa aprueba es exactamente lo que se va a guardar.
 */
export async function procesarFila(
  datosFila: Record<string, string>,
  ctx: ContextoFila,
  prismaClient: PrismaParaFila,
  dryRun: boolean
): Promise<ResultadoFila> {
  const obtener = (campo: string): string => datosFila[campo] ?? "";

  const marca = obtener("marca");
  const modelo = obtener("modelo");
  const numeroSerie = obtener("numeroSerie");
  const nombreEquipo = obtener("nombreEquipo") || null;

  const imeiFila = normalizarImei(obtener("imei"));
  const faltaImei = ctx.exigeImei && !imeiFila;
  const faltaSerie = !ctx.exigeImei && !numeroSerie;
  if (!marca || !modelo || faltaSerie || faltaImei) {
    const faltantes: string[] = [];
    if (!marca) faltantes.push("Marca");
    if (!modelo) faltantes.push("Modelo");
    if (faltaSerie) faltantes.push("N° de Serie");
    if (faltaImei) faltantes.push("IMEI");
    return {
      status: "error",
      tipo: "missing_required_field",
      mensaje: `Campos faltantes: ${faltantes.join(", ")}`,
      data: datosFila,
      // El primero que falta, para que la revision lo marque (SPEC 2.105).
      campo: !marca ? "marca" : !modelo ? "modelo" : faltaSerie ? "numeroSerie" : "imei",
    };
  }

  // Marca: debe calzar con el catalogo (SPEC 2.116.4). "DELL" o "dell"
  // quedan como "Dell"; una que no existe va a revision, donde se elige o se crea.
  const resolucionMarca = resolverValorCatalogo(marca, ctx.mapaMarcas);
  if ("error" in resolucionMarca) {
    return {
      status: "error",
      tipo: resolucionMarca.error,
      campo: "marca",
      mensaje: `Marca no reconocida: "${resolucionMarca.valorOriginal}". Selecciona una opción del catálogo o créala.`,
      data: datosFila,
    };
  }
  const marcaCatalogo = resolucionMarca.valor ?? marca;

  // IMEI: formato valido y unico, en la base y en el mismo archivo.
  if (imeiFila) {
    const errorImei = validarImei(imeiFila);
    if (errorImei) {
      return { status: "error", tipo: "invalid_format", mensaje: errorImei, data: datosFila, campo: "imei" };
    }
    if (ctx.existingImeiSet.has(imeiFila)) {
      const enBase = await prismaClient.asset.findFirst({ where: { imei: imeiFila }, select: { id: true } });
      return {
        status: "error",
        tipo: enBase ? "duplicate_in_database" : "duplicate_in_file",
        mensaje: enBase
          ? `Ya existe un activo con el IMEI ${imeiFila}`
          : `IMEI "${imeiFila}" aparece repetido en este mismo archivo (otra fila ya lo usa).`,
        data: datosFila,
        campo: "imei",
      };
    }
  }

  // Verificar duplicado -- puede ser un activo que ya existe en la base, o
  // uno que "ya existe" porque otra fila mas arriba en este mismo archivo
  // acaba de reservar el mismo numero de serie.
  if (numeroSerie && ctx.existingSeriesSet.has(numeroSerie.toUpperCase())) {
    const existingAsset = await prismaClient.asset.findFirst({
      where: { numeroSerie: { equals: numeroSerie, mode: "insensitive" } },
      select: {
        marca: true,
        modelo: true,
        sedeId: true,
        empleadoActual: { select: { nombres: true, apellidoPaterno: true, rut: true } },
      },
    });

    if (existingAsset) {
      return {
        status: "error",
        tipo: "duplicate_in_database",
        mensaje: mensajeSerieDuplicada(numeroSerie, existingAsset),
        data: datosFila,
      };
    }

    return {
      status: "error",
      tipo: "duplicate_in_file",
      mensaje: `N° de serie "${numeroSerie}" aparece repetido en este mismo archivo (otra fila ya lo usa).`,
      data: datosFila,
    };
  }

  // --- Sede de la fila ----------------------------------------------------
  const resolucionSede = resolverSedeParaFila({
    sedeIdExplicita: ctx.sedeIdExplicita,
    mapaSedes: ctx.mapaSedes,
    valorSede: obtener("sede"),
  });
  if ("error" in resolucionSede) {
    return {
      status: "error",
      tipo: resolucionSede.error,
      mensaje: `Sede no reconocida: "${resolucionSede.valorOriginal || "(vacío)"}". Corrige la columna Sede o selecciona la sede manualmente.`,
      data: datosFila,
    };
  }
  const sedeId = resolucionSede.sedeId;

  // --- Interpretacion de la fila -------------------------------------------
  const lecturaEstado = interpretarEstado(obtener("estado"));
  if (lecturaEstado.tipo === "desconocido") {
    return {
      status: "error",
      tipo: "invalid_format",
      mensaje: `Estado no reconocido: "${lecturaEstado.valor}". Se espera un estado (${ESTADOS_RECONOCIDOS.join(", ")})`,
      data: datosFila,
    };
  }

  const lecturaRut = interpretarRut(obtener("rut"));
  if (lecturaRut.tipo === "invalido") {
    return {
      status: "error",
      tipo: "invalid_format",
      mensaje: `RUT inválido: "${lecturaRut.valor}" (dígito verificador incorrecto)`,
      data: datosFila,
    };
  }

  const rutEmpleado = lecturaRut.tipo === "valido" ? lecturaRut.rut : null;
  const estado = resolverEstado(lecturaEstado, rutEmpleado !== null);
  const condicion = resolverCondicion(lecturaEstado, obtener("condicion"));
  // Un equipo "no devuelto" tambien esta en manos de una persona -- la
  // diferencia con "asignado" es que esa persona ya se desvinculo, no que el
  // equipo este libre. Por eso se crea igual el empleado, la asignacion y la
  // fecha de entrega; lo unico distinto es el estado con el que queda el
  // Activo, para no perder el rastro de quien tiene el equipo.
  const debeAsignar =
    rutEmpleado !== null && (estado === "asignado" || estado === "no_devuelto");

  let empleadoExistenteId: string | null =
    rutEmpleado ? ctx.employeeCache.get(rutEmpleado) ?? null : null;
  let datosEmpleadoNuevo: Prisma.EmployeeCreateInput | null = null;

  if (debeAsignar && rutEmpleado && !empleadoExistenteId) {
    const encontrado = await prismaClient.employee.findUnique({
      where: { rut: rutEmpleado },
      select: { id: true, estado: true },
    });

    if (encontrado) {
      empleadoExistenteId = encontrado.id;
      if (encontrado.estado === "desvinculado") ctx.empleadosDesvinculados.add(rutEmpleado);
    } else {
      const nombres = obtener("nombre");
      const apellidoPaterno = obtener("apellidoP");

      if (!nombres || !apellidoPaterno) {
        return {
          status: "error",
          tipo: "missing_employee_data",
          mensaje: `Empleado con RUT ${rutEmpleado}: faltan campos obligatorios (Nombre o Apellido P.)`,
          data: datosFila,
        };
      }

      const base = `${nombres.toLowerCase().replace(/\s+/g, ".")}.${apellidoPaterno.toLowerCase()}`;
      let correoEmpresa = obtener("correoEmpresa") || `${base}@empresa.cl`;
      const correoTomado = await prismaClient.employee.findUnique({
        where: { correoEmpresa },
        select: { id: true },
      });
      if (correoTomado) {
        correoEmpresa = `${base}.${limpiarRut(rutEmpleado).toLowerCase()}@empresa.cl`;
      }

      // El correo personal no es obligatorio en esta importacion (a
      // diferencia del alta manual de empleado): si el Excel no lo trae,
      // el empleado se crea igual y el dato se completa despues desde su
      // ficha. Si lo trae pero ya esta en uso por OTRO empleado, se
      // descarta (queda vacio) en vez de hacer fallar toda la fila -- el
      // RUT es el identificador real de esta importacion.
      const correoPersonalIngresado = obtener("correoPersonal") || null;
      let correoPersonal: string | null = correoPersonalIngresado;
      if (correoPersonal) {
        const personalTomado = await prismaClient.employee.findUnique({
          where: { correoPersonal },
          select: { id: true },
        });
        if (personalTomado) {
          correoPersonal = null;
        }
      }

      datosEmpleadoNuevo = {
        rut: rutEmpleado,
        nombres,
        apellidoPaterno,
        apellidoMaterno: obtener("apellidoM") || null,
        correoEmpresa,
        correoPersonal,
        cargo: obtener("cargo") || null,
        jefatura: obtener("jefatura") || null,
        supervisor: obtener("supervisor") || null,
        ubicacion: obtener("comuna") || null,
        // El Excel no dice si es contrato u honorarios: queda sin definir
        // y se elige al editar el empleado.
        tipoContrato: null,
        estado: "activo",
        sede: { connect: { id: sedeId } },
      };
    }
  }

  // Un equipo "asignado" a alguien que ya se desvinculo quedaria en manos de
  // una persona que no esta en la empresa (auditoria 27-sep-2026, 2.9). No se
  // decide por detras: si la planilla dice "No devuelto", pasa; si no, la
  // fila queda para que alguien la corrija.
  if (estado === "asignado" && rutEmpleado && ctx.empleadosDesvinculados.has(rutEmpleado)) {
    return {
      status: "error",
      tipo: "empleado_desvinculado",
      campo: "estado",
      mensaje: `El empleado con RUT ${rutEmpleado} está desvinculado: usa el estado "No devuelto" o quita el RUT`,
      data: datosFila,
    };
  }

  const procesador = obtener("procesador") || null;
  const ram = obtener("ram") || null;
  const discoDuro = obtener("discoDuro") || obtener("almacenamiento") || null;
  const imei = imeiFila || null;
  const pulgadasStr = obtener("pulgadas");
  const pulgadas = pulgadasStr ? parseFloat(pulgadasStr) : null;
  // --- Sistema operativo, antivirus y licencia M365: deben calzar con el
  // catalogo administrable (Configuracion > Opciones de Activos). Ver
  // resolverValorCatalogo -- un valor que no matchea ninguna opcion (ni
  // siquiera ignorando mayusculas/tildes) no se guarda a ciegas, la fila
  // queda para revision manual en vez de romper el conteo "en uso".
  const resolucionSO = resolverValorCatalogo(obtener("sistemaOperativo"), ctx.mapaSistemasOperativos);
  if ("error" in resolucionSO) {
    return {
      status: "error",
      tipo: resolucionSO.error,
      campo: "sistemaOperativo",
      mensaje: `Sistema operativo no reconocido: "${resolucionSO.valorOriginal}". Selecciona una opción del catálogo o créala.`,
      data: datosFila,
    };
  }
  const sistemaOperativo = resolucionSO.valor;

  const resolucionAntivirus = resolverValorCatalogo(obtener("antivirus"), ctx.mapaAntivirus);
  if ("error" in resolucionAntivirus) {
    return {
      status: "error",
      tipo: resolucionAntivirus.error,
      campo: "antivirus",
      mensaje: `Antivirus no reconocido: "${resolucionAntivirus.valorOriginal}". Selecciona una opción del catálogo o créala.`,
      data: datosFila,
    };
  }
  const antivirus = resolucionAntivirus.valor;

  const ubicacionFisica = obtener("comuna") || null;

  const resolucionM365 = resolverValorCatalogo(obtener("microsoft365"), ctx.mapaLicenciasM365);
  if ("error" in resolucionM365) {
    return {
      status: "error",
      tipo: resolucionM365.error,
      campo: "microsoft365",
      mensaje: `Licencia Microsoft 365 no reconocida: "${resolucionM365.valorOriginal}". Selecciona una opción del catálogo o créala.`,
      data: datosFila,
    };
  }
  const valorMicrosoft365 = resolucionM365.valor;
  const microsoft365 = tieneMicrosoft365(valorMicrosoft365);
  const tipoLicenciaMicrosoft365 = valorMicrosoft365;
  // Sin un dato real de "Fecha de compra" en el Excel, el campo queda sin
  // registrar en vez de usar la fecha de entrega como respaldo (mostrarla
  // bajo el rotulo "Fecha Compra" seria una estimacion no declarada).
  const fechaCompraStr = obtener("fechaCompra");
  const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

  // Valor en pesos (SPEC 2.124), opcional: "850000", "850.000" o "$850.000".
  const valorStr = obtener("valor");
  const valor = leerClp(valorStr);
  if (valor !== null && (Number.isNaN(valor) || valor > VALOR_MAXIMO_CLP)) {
    return {
      status: "error",
      tipo: "invalid_format",
      mensaje: `Valor no reconocido: "${valorStr}" (se espera un monto en pesos, sin decimales)`,
      data: datosFila,
      campo: "valor",
    };
  }

  // La fecha de entrega es obligatoria SOLO cuando el dato esta pero no se
  // pudo leer (ej. "32-13-2026" o texto suelto) -- eso es un error de
  // formato a corregir en el Excel. Una celda vacia no es un error: se
  // guarda como fecha desconocida (null) en vez de rechazar la fila o
  // forzar una fecha inventada, ya que hay equipos donde ese dato nunca se
  // registro.
  let fechaEntrega: Date | null = null;
  if (debeAsignar) {
    const fechaEntregaStr = obtener("fechaEntrega");
    if (fechaEntregaStr) {
      fechaEntrega = parseDDMMYYYYToDate(fechaEntregaStr);
      if (!fechaEntrega) {
        return {
          status: "error",
          tipo: "invalid_assignment_date",
          mensaje: `Fecha de entrega no reconocida: "${fechaEntregaStr}" (se espera dd-mm-aaaa)`,
          data: datosFila,
        };
      }
    }
  }

  // A partir de aqui la fila es valida.
  if (dryRun) {
    // No se escribe nada: se reserva el numero de serie y, si corresponde,
    // el RUT del empleado nuevo, para que otra fila mas abajo en el MISMO
    // archivo se valide contra esto -- mismo criterio que la escritura real.
    if (numeroSerie) ctx.existingSeriesSet.add(numeroSerie.toUpperCase());
    if (imeiFila) ctx.existingImeiSet.add(imeiFila);
    if (rutEmpleado && !empleadoExistenteId) {
      ctx.employeeCache.set(rutEmpleado, PLACEHOLDER_EMPLEADO_PENDIENTE);
    }
    return { status: "valid", data: datosFila };
  }

  // Las escrituras de una fila -activo, historial, asignacion y mantencion-
  // son una sola operacion: hasta siete escrituras que deben cuadrar entre
  // si. Sin transaccion, un fallo a mitad dejaba un activo sin su asignacion
  // o sin historial, y nada lo delataba.
  const escrito = await prismaClient.$transaction(async (tx) => {
    let empleadoId: string | null =
      empleadoExistenteId && empleadoExistenteId !== PLACEHOLDER_EMPLEADO_PENDIENTE
        ? empleadoExistenteId
        : null;
    if (debeAsignar && !empleadoId && datosEmpleadoNuevo) {
      const creado = await crearPersonaEnTx(tx, datosEmpleadoNuevo);
      empleadoId = creado.id;
      logger.log(`Empleado creado: ${datosEmpleadoNuevo.nombres} ${datosEmpleadoNuevo.apellidoPaterno}`);
    }

    const usuarioImportacion = quienHace(ctx.session);
    const asset = await crearActivoImportado(
      tx,
      {
        categoriaId: ctx.categoriaId,
        sedeId,
        marca: marcaCatalogo,
        modelo,
        nombreEquipo,
        // En celulares la serie es opcional: vacia queda null (es unica).
        numeroSerie: numeroSerie || null,
        estado,
        condicion,
        procesador,
        ram,
        discoDuro,
        imei,
        pulgadas,
        sistemaOperativo,
        antivirus,
        ubicacionFisica,
        microsoft365,
        tipoLicenciaMicrosoft365,
        fechaCompra,
        valor,
        observaciones: obtener("observaciones") || null,
        empleadoActualId: empleadoId,
      },
      usuarioImportacion
    );
    // Los demas eventos de la fila, con el servicio de historial de Activos.
    const anotar = (evento: Omit<AssetHistoryData, "assetId" | "usuarioSistema">) =>
      assetHistoryService.registrar({ assetId: asset.id, usuarioSistema: usuarioImportacion, ...evento }, tx);

    // "Historial de asignaciones" del Excel antiguo: un contador tosco
    // ("1", "2", "1+") de cuantas veces se asigno el equipo, sin dato de
    // quien lo tuvo. No alcanza para crear un Employee ni un Assignment
    // real, pero se guarda como lineas informativas en el historial del
    // activo en vez de descartarse. Cuando el numero es exacto (1, 2...) se
    // crea esa cantidad de lineas; cuando es impreciso ("1+") se crea una
    // sola linea, con el texto original entre parentesis para no perder el
    // matiz de "al menos".
    const historialAsignacionesStr = obtener("historialAsignaciones");
    if (historialAsignacionesStr) {
      const numeroExacto = /^\d+$/.test(historialAsignacionesStr.trim())
        ? parseInt(historialAsignacionesStr.trim(), 10)
        : null;
      // Tope defensivo: un valor absurdo en el Excel ("999") no debe crear
      // miles de filas de historial por un typo de digitacion.
      const cantidadFilas = numeroExacto ? Math.min(numeroExacto, 20) : 1;
      const notaImprecision = numeroExacto === null ? ` (dato original: "${historialAsignacionesStr}")` : "";

      for (let i = 0; i < cantidadFilas; i++) {
        // Numerar "(1 de 2)", "(2 de 2)"... cuando hay mas de una fila, para
        // que no queden indistinguibles entre si en la linea de tiempo del
        // activo (se verian como un evento duplicado en vez de varias
        // asignaciones historicas distintas).
        const contador = cantidadFilas > 1 ? ` (${i + 1} de ${cantidadFilas})` : "";
        await anotar({
          tipoEvento: "asignacion",
          descripcion: `Asignación histórica previa a la migración, sin datos de la persona${contador}${notaImprecision}`,
          // Marca estructurada para que la ficha del activo pueda
          // identificar estas filas de forma confiable y mostrarlas
          // tambien en el cuadro "Historial de Asignaciones" -- en vez de
          // parsear el texto de la descripcion, que puede cambiar.
          datosNuevos: { historicaSinPersona: true, indice: i + 1, total: cantidadFilas },
        });
      }
    }

    // Se crea la asignacion aunque fechaEntrega sea null -- lo que la hace
    // necesaria es que haya un empleado (custodia del equipo), no que se
    // conozca la fecha exacta en que se le entrego.
    if (empleadoId) {
      await registrarAsignacionImportada(tx, {
        assetId: asset.id,
        employeeId: empleadoId,
        fechaEntrega,
        tipoMovimiento: "ingreso",
        activo: true,
      });

      await anotar({ tipoEvento: "asignacion", descripcion: "Asignación importada desde Excel" });
    }

    const fechaMantencionStr = obtener("mantencion");
    const proximaMantencionStr = obtener("proximaMantencion");

    if (fechaMantencionStr || proximaMantencionStr) {
      const fechaMantencion = fechaMantencionStr ? parseDDMMYYYYToDate(fechaMantencionStr) : null;
      const proximaMantencion = proximaMantencionStr ? parseDDMMYYYYToDate(proximaMantencionStr) : null;
      const ahora = new Date();

      let sufijoEmpleado = "";
      if (empleadoId) {
        const empleado = await tx.employee.findUnique({
          where: { id: empleadoId },
          select: { nombres: true, apellidoPaterno: true, rut: true },
        });
        if (empleado) {
          sufijoEmpleado = ` para ${empleado.nombres} ${empleado.apellidoPaterno} (RUT: ${empleado.rut})`;
        }
      }

      const crearRegistroMantencion = async (fecha: Date, estado: "pendiente" | "completada") => {
        const etiqueta = estado === "pendiente" ? "programada" : "realizada";
        const fechaFormateada = formatearFechaCorta(fecha);
        await registrarMantencionImportada(tx, {
          assetId: asset.id,
          tipoId: ctx.tipoMantencionId,
          descripcion: `Mantención ${etiqueta}${sufijoEmpleado} (importada desde Excel)`,
          fechaProgramada: estado === "pendiente" ? fecha : null,
          fechaRealizada: estado === "completada" ? fecha : null,
          proximaMantencion: null,
          estado,
          realizadoPor: estado === "completada" ? "Registro histórico" : null,
        });
        // La fecha va en el propio texto del historial: la fecha real del
        // evento puede ser muy distinta de cuando se importo, y sin esto
        // solo se veia entrando al detalle de la mantencion.
        await anotar({
          tipoEvento: "mantencion",
          descripcion: `Mantención ${etiqueta} el ${fechaFormateada} (importada desde Excel)`,
        });
      };

      // Cuando el Excel trae AMBAS fechas y la proxima es realmente
      // posterior a la realizada, se crean DOS mantenciones: la realizada
      // queda completada, y la proxima se vuelve un ticket pendiente real
      // en la cola de mantenciones del sistema (en vez de quedar como un
      // dato informativo invisible dentro del registro completado). Si
      // solo viene una de las dos fechas, se crea un unico registro,
      // pendiente o completada segun si esa fecha ya paso.
      if (fechaMantencion && proximaMantencion && proximaMantencion > fechaMantencion) {
        await crearRegistroMantencion(fechaMantencion, "completada");
        await crearRegistroMantencion(proximaMantencion, "pendiente");
      } else {
        const fechaPrincipal = fechaMantencion || proximaMantencion;
        if (fechaPrincipal) {
          const esFutura = fechaPrincipal > ahora;
          await crearRegistroMantencion(fechaPrincipal, esFutura ? "pendiente" : "completada");
        }
      }
    }

    if (estado === "en_mantencion") {
      // Un equipo en mantencion siempre tiene su mantencion en proceso (SPEC
      // 2.96): sin ella queda varado, porque el boton Completar vive dentro
      // de la mantencion. La columna Estado del Excel es independiente de
      // las fechas de Mantencion/Proxima Mantencion (esas crean registros
      // realizados o programados), asi que se crea siempre, con la fecha de
      // hoy y el mismo tipo "Preventiva" que usa el resto del import.
      const hoy = inicioDeHoy();
      await registrarMantencionImportada(tx, {
        assetId: asset.id,
        tipoId: ctx.tipoMantencionId,
        descripcion: "Mantención en proceso (Estado importado como \"Mantención\" en el Excel)",
        fechaProgramada: hoy,
        estado: "en_proceso",
      });
      await anotar({
        tipoEvento: "mantencion",
        descripcion: `Mantención en proceso desde el ${formatearFechaCorta(hoy)} (Estado="Mantención" importado desde Excel)`,
      });
    }

    return { empleadoId, assetId: asset.id };
  });

  if (rutEmpleado && escrito.empleadoId) {
    ctx.employeeCache.set(rutEmpleado, escrito.empleadoId);
  }
  if (numeroSerie) ctx.existingSeriesSet.add(numeroSerie.toUpperCase());
  if (imeiFila) ctx.existingImeiSet.add(imeiFila);

  return { status: "imported", data: datosFila, assetId: escrito.assetId };
}
