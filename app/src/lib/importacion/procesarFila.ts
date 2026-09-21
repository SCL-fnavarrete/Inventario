import { logger } from "@/lib/logger";
import { parseDDMMYYYYToDate } from "@/lib/excel-utils";
import { formatearFechaCorta } from "@/lib/utils/fechas";
import {
  ESTADOS_RECONOCIDOS,
  interpretarEstado,
  interpretarRut,
  mensajeSerieDuplicada,
  resolverCondicion,
  resolverEstado,
  resolverSedeParaFila,
  tieneMicrosoft365,
} from "@/lib/importacion/activos";
import { limpiarRut } from "@/lib/validations/rut";
import { Prisma } from "@prisma/client";
import type { SesionAutenticada } from "@/lib/auth/guard";
import type { ValidationErrorType } from "@/types/import";
import type { prisma as prismaSingleton } from "@/lib/prisma";

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
  tipoMantencionId: string;
  sedeIdExplicita: string | null;
  mapaSedes: Record<string, string>;
  /** Compartido y mutado entre filas del mismo archivo (en orden), para que
   * una fila detecte que otra fila anterior del MISMO archivo ya "reservo"
   * un numero de serie o un RUT -- igual en preview que en la escritura real. */
  existingSeriesSet: Set<string>;
  employeeCache: Map<string, string>;
}

export interface ResultadoFilaError {
  status: "error";
  tipo: ValidationErrorType;
  mensaje: string;
  data: Record<string, string>;
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

  if (!marca || !modelo || !numeroSerie) {
    const faltantes: string[] = [];
    if (!marca) faltantes.push("Marca");
    if (!modelo) faltantes.push("Modelo");
    if (!numeroSerie) faltantes.push("N° de Serie");
    return {
      status: "error",
      tipo: "missing_required_field",
      mensaje: `Campos faltantes: ${faltantes.join(", ")}`,
      data: datosFila,
    };
  }

  // Verificar duplicado -- puede ser un activo que ya existe en la base, o
  // uno que "ya existe" porque otra fila mas arriba en este mismo archivo
  // acaba de reservar el mismo numero de serie.
  if (ctx.existingSeriesSet.has(numeroSerie.toUpperCase())) {
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
        mensaje: mensajeSerieDuplicada(ctx.session, numeroSerie, existingAsset),
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
  const resolucionSede = resolverSedeParaFila(ctx.session, {
    sedeIdExplicita: ctx.sedeIdExplicita,
    mapaSedes: ctx.mapaSedes,
    valorSede: obtener("sede"),
  });
  if ("error" in resolucionSede) {
    return {
      status: "error",
      tipo: resolucionSede.error,
      mensaje:
        resolucionSede.error === "sede_ajena"
          ? `Esta fila pertenece a la sede "${resolucionSede.valorOriginal}", distinta de la tuya. No se importó.`
          : `Sede no reconocida: "${resolucionSede.valorOriginal || "(vacío)"}". Corrige la columna Sede o selecciona la sede manualmente.`,
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
      mensaje: `RUT invalido: "${lecturaRut.valor}" (digito verificador incorrecto)`,
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
      select: { id: true },
    });

    if (encontrado) {
      empleadoExistenteId = encontrado.id;
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
      let correoEmpresa = obtener("correo") || `${base}@empresa.cl`;
      const correoTomado = await prismaClient.employee.findUnique({
        where: { correoEmpresa },
        select: { id: true },
      });
      if (correoTomado) {
        correoEmpresa = `${base}.${limpiarRut(rutEmpleado).toLowerCase()}@empresa.cl`;
      }

      datosEmpleadoNuevo = {
        rut: rutEmpleado,
        nombres,
        apellidoPaterno,
        apellidoMaterno: obtener("apellidoM") || null,
        correoEmpresa,
        cargo: obtener("cargo") || null,
        jefatura: obtener("jefatura") || null,
        supervisor: obtener("supervisor") || null,
        ubicacion: obtener("comuna") || null,
        tipoContrato: "contrato",
        estado: "activo",
        sede: { connect: { id: sedeId } },
      };
    }
  }

  const procesador = obtener("procesador") || null;
  const ram = obtener("ram") || null;
  const discoDuro = obtener("discoDuro") || obtener("almacenamiento") || null;
  const imei = obtener("imei") || null;
  const numeroTelefono = obtener("numeroTelefono") || null;
  const pulgadasStr = obtener("pulgadas");
  const pulgadas = pulgadasStr ? parseFloat(pulgadasStr) : null;
  const sistemaOperativo = obtener("sistemaOperativo") || null;
  const ubicacionFisica = obtener("comuna") || null;
  const valorMicrosoft365 = obtener("microsoft365");
  const microsoft365 = tieneMicrosoft365(valorMicrosoft365);
  const tipoLicenciaMicrosoft365 = valorMicrosoft365 || null;
  // Sin un dato real de "Fecha de compra" en el Excel, el campo queda sin
  // registrar en vez de usar la fecha de entrega como respaldo (mostrarla
  // bajo el rotulo "Fecha Compra" seria una estimacion no declarada).
  const fechaCompraStr = obtener("fechaCompra");
  const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

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
    ctx.existingSeriesSet.add(numeroSerie.toUpperCase());
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
      const creado = await tx.employee.create({ data: datosEmpleadoNuevo, select: { id: true } });
      empleadoId = creado.id;
      logger.log(`Empleado creado: ${datosEmpleadoNuevo.nombres} ${datosEmpleadoNuevo.apellidoPaterno}`);
    }

    const asset = await tx.asset.create({
      data: {
        categoriaId: ctx.categoriaId,
        sedeId,
        marca,
        modelo,
        nombreEquipo,
        numeroSerie,
        estado,
        condicion,
        procesador,
        ram,
        discoDuro,
        imei,
        numeroTelefono,
        pulgadas,
        sistemaOperativo,
        ubicacionFisica,
        microsoft365,
        tipoLicenciaMicrosoft365,
        fechaCompra,
        observaciones: obtener("observaciones") || null,
        empleadoActualId: empleadoId,
      },
    });

    await tx.assetHistory.create({
      data: {
        assetId: asset.id,
        tipoEvento: "creacion",
        descripcion: "Activo importado desde Excel",
        usuarioSistema: ctx.session.user?.email || "sistema",
      },
    });

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
        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "asignacion",
            descripcion: `Asignación histórica previa a la migración, sin datos de la persona${contador}${notaImprecision}`,
            usuarioSistema: ctx.session.user?.email || "sistema",
            // Marca estructurada para que la ficha del activo pueda
            // identificar estas filas de forma confiable y mostrarlas
            // tambien en el cuadro "Historial de Asignaciones" -- en vez de
            // parsear el texto de la descripcion, que puede cambiar.
            datosNuevos: { historicaSinPersona: true, indice: i + 1, total: cantidadFilas },
          },
        });
      }
    }

    // Se crea la asignacion aunque fechaEntrega sea null -- lo que la hace
    // necesaria es que haya un empleado (custodia del equipo), no que se
    // conozca la fecha exacta en que se le entrego.
    if (empleadoId) {
      await tx.assignment.create({
        data: {
          assetId: asset.id,
          employeeId: empleadoId,
          fechaEntrega,
          tipoMovimiento: "ingreso",
          activo: true,
        },
      });

      await tx.assetHistory.create({
        data: {
          assetId: asset.id,
          tipoEvento: "asignacion",
          descripcion: "Asignación importada desde Excel",
          usuarioSistema: ctx.session.user?.email || "sistema",
        },
      });
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
        await tx.maintenance.create({
          data: {
            assetId: asset.id,
            tipoId: ctx.tipoMantencionId,
            descripcion: `Mantención ${etiqueta}${sufijoEmpleado} (importada desde Excel)`,
            fechaProgramada: estado === "pendiente" ? fecha : null,
            fechaRealizada: estado === "completada" ? fecha : null,
            proximaMantencion: null,
            estado,
            realizadoPor: estado === "completada" ? "Registro histórico" : null,
          },
        });
        // La fecha va en el propio texto del historial: la fecha real del
        // evento puede ser muy distinta de cuando se importo, y sin esto
        // solo se veia entrando al detalle de la mantencion.
        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${etiqueta} el ${fechaFormateada} (importada desde Excel)`,
            usuarioSistema: ctx.session.user?.email || "sistema",
          },
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
    } else if (estado === "en_mantencion") {
      // La columna Estado del Excel y las columnas de fecha de Mantencion/
      // Proxima Mantencion son independientes entre si -- una fila puede
      // traer Estado="Mantencion" sin ninguna de esas dos fechas. Sin un
      // ticket asociado el equipo queda varado: no aparece en la cola de
      // pendientes y no hay forma de completarlo desde el flujo normal
      // (boton "Completar Mantencion" vive dentro de un ticket), asi que se
      // crea un ticket pendiente automatico usando la fecha de hoy como
      // referencia y el mismo tipo "Preventiva" que usa el resto del import
      // cuando no hay mas informacion.
      const ahoraSinFecha = new Date();
      await tx.maintenance.create({
        data: {
          assetId: asset.id,
          tipoId: ctx.tipoMantencionId,
          descripcion: "Mantención pendiente (Estado importado como \"Mantención\" sin fecha específica en el Excel)",
          fechaProgramada: ahoraSinFecha,
          estado: "pendiente",
        },
      });
      await tx.assetHistory.create({
        data: {
          assetId: asset.id,
          tipoEvento: "mantencion",
          descripcion: `Mantención pendiente creada automáticamente el ${formatearFechaCorta(ahoraSinFecha)} (Estado="Mantención" importado sin fecha, importada desde Excel)`,
          usuarioSistema: ctx.session.user?.email || "sistema",
        },
      });
    }

    return { empleadoId, assetId: asset.id };
  });

  if (rutEmpleado && escrito.empleadoId) {
    ctx.employeeCache.set(rutEmpleado, escrito.empleadoId);
  }
  ctx.existingSeriesSet.add(numeroSerie.toUpperCase());

  return { status: "imported", data: datosFila, assetId: escrito.assetId };
}
