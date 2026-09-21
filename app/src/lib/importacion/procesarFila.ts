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
 * (dryRun: false, escribe). Antes esta logica vivia duplicada entre la
 * importacion directa y (parcialmente) la vista previa -- correr dos copias
 * del mismo criterio es como se termina con una vista previa que dice
 * "valido" y una importacion real que rechaza la misma fila por otra razon.
 * Con una sola funcion, lo que la vista previa aprueba es EXACTAMENTE lo que
 * se va a guardar.
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
  // equipo este libre. Por eso se le crea igual el empleado, la asignacion y
  // la fecha de entrega (20-sep-2026, SPEC 2.57); lo unico distinto es el
  // estado con el que queda el Activo. Sin esto, importar una fila "No
  // devuelto" perdia el rastro de quien tiene el equipo, que es justamente
  // el dato que hace falta para ir a recuperarlo.
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
  // Antes, si el Excel no traia una columna real de "Fecha de compra", se
  // usaba la fecha de entrega como respaldo -- para no dejar esa tarjeta
  // vacia. El efecto no era el buscado: la ficha del activo terminaba
  // mostrando la fecha de entrega bajo el rotulo "Fecha Compra", sin ningun
  // aviso de que era una estimacion (21-sep-2026, SPEC 2.62, reportado por
  // Javier: "por que en el detalle de activo la fecha de entrega sale como
  // fecha de compra?"). Ahora, sin un dato real de compra, la fecha de
  // compra queda simplemente sin registrar.
  const fechaCompraStr = obtener("fechaCompra");
  const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

  // La fecha de entrega es obligatoria SOLO cuando el dato esta pero no se
  // pudo leer (ej. "32-13-2026" o texto suelto) -- eso es un error de
  // formato que hay que corregir en el Excel. Si la celda esta simplemente
  // vacia, no es un error: hay equipos (sobre todo import de datos
  // historicos) donde esa fecha nunca se registro y no existe forma de
  // reconstruirla. Antes se rechazaba la fila entera en ambos casos, lo que
  // dejaba sin importar activos reales solo porque faltaba un dato que
  // nadie tiene (20-sep-2026, SPEC 2.59). Ahora una celda vacia se guarda
  // como fecha desconocida (null) en vez de forzar una fecha inventada.
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
    // ("1", "2", "1+") de cuantas veces se asigno el equipo, sin ningun
    // dato de quien lo tuvo. No alcanza para crear un Employee ni un
    // Assignment real (no hay con quien vincularlo), pero tampoco hay que
    // perder el dato -- queda como lineas informativas en el historial del
    // activo, en vez de descartarse en silencio. Version revisada
    // (21-sep-2026, SPEC 2.65): una sola linea con el texto literal ("1+")
    // se veia poco prolija -- ahora se crea UNA linea por asignacion,
    // segun la cantidad que indique el Excel. Cuando el numero es exacto
    // (1, 2...) se crean esa cantidad de lineas; cuando es impreciso
    // ("1+", que no es un numero real) se crea 1 sola linea, con el texto
    // original entre parentesis para no perder el matiz de "al menos".
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
        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "asignacion",
            descripcion: `Asignación histórica previa a la migración, sin datos de la persona${notaImprecision}`,
            usuarioSistema: ctx.session.user?.email || "sistema",
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
        // La fecha va en el propio texto del historial (21-sep-2026, SPEC
        // 2.64, pedido explicito de Javier: "si sale mantencion realizada,
        // la idea es que salga la fecha... y si sale mantencion programada,
        // que salga la fecha de esa mantencion programada") -- antes solo
        // decia "realizada"/"programada" sin fecha, y la fecha real del
        // evento (que puede ser muy distinta de cuando se importo) solo se
        // veia entrando al detalle de la mantencion.
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
      // queda completada, y la proxima se vuelve un TICKET PENDIENTE
      // real -- antes esa fecha solo quedaba como un dato informativo
      // dentro del registro completado, invisible en la cola de
      // mantenciones pendientes del sistema (21-sep-2026, SPEC 2.61,
      // pedido explicito de Javier: "en la proxima mantencion, la idea es
      // registrar o crear un ticket de mantencion utilizando esas
      // fechas"). Si solo viene una de las dos fechas, se mantiene el
      // comportamiento anterior: un unico registro, pendiente o
      // completada segun si esa fecha ya paso.
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

    return { empleadoId, assetId: asset.id };
  });

  if (rutEmpleado && escrito.empleadoId) {
    ctx.employeeCache.set(rutEmpleado, escrito.empleadoId);
  }
  ctx.existingSeriesSet.add(numeroSerie.toUpperCase());

  return { status: "imported", data: datosFila, assetId: escrito.assetId };
}
