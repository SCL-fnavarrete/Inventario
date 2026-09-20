import { logger } from "@/lib/logger";
import { parseDDMMYYYYToDate } from "@/lib/excel-utils";
import {
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
      mensaje: `Estado no reconocido: "${lecturaEstado.valor}". Se espera un estado (Disponible, Asignado, En mantencion, Baja, Vendido) o una condicion (Nuevo, Usado, Seminuevo, Danado)`,
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
  const fechaCompraStr = obtener("fechaCompra") || obtener("fechaEntrega");
  const fechaCompra = fechaCompraStr ? parseDDMMYYYYToDate(fechaCompraStr) : null;

  let fechaEntrega: Date | null = null;
  if (debeAsignar) {
    const fechaEntregaStr = obtener("fechaEntrega");
    fechaEntrega = fechaEntregaStr ? parseDDMMYYYYToDate(fechaEntregaStr) : null;

    if (!fechaEntrega) {
      return {
        status: "error",
        tipo: "invalid_assignment_date",
        mensaje: fechaEntregaStr
          ? `Fecha de entrega no reconocida: "${fechaEntregaStr}" (se espera dd-mm-aaaa)`
          : "El activo figura asignado pero no trae fecha de entrega",
        data: datosFila,
      };
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

    if (empleadoId && fechaEntrega) {
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
      const fechaPrincipal = fechaMantencion || proximaMantencion;

      if (fechaPrincipal) {
        const ahora = new Date();
        const esFutura = fechaPrincipal > ahora;

        let descripcionDetallada = "Mantención importada desde Excel";
        if (empleadoId) {
          const empleado = await tx.employee.findUnique({
            where: { id: empleadoId },
            select: { nombres: true, apellidoPaterno: true, rut: true },
          });
          if (empleado) {
            descripcionDetallada = `Mantención ${esFutura ? "programada" : "realizada"} para ${empleado.nombres} ${empleado.apellidoPaterno} (RUT: ${empleado.rut})`;
          }
        }

        const maintenanceData: {
          assetId: string;
          tipoId: string;
          descripcion: string;
          fechaProgramada: Date | null;
          fechaRealizada: Date | null;
          proximaMantencion: Date | null;
          estado: "pendiente" | "completada";
          realizadoPor: string | null;
        } = {
          assetId: asset.id,
          tipoId: ctx.tipoMantencionId,
          descripcion: descripcionDetallada,
          fechaProgramada: null,
          fechaRealizada: null,
          proximaMantencion: null,
          estado: esFutura ? "pendiente" : "completada",
          realizadoPor: esFutura ? null : "Registro histórico",
        };

        if (fechaMantencion) {
          if (esFutura) {
            maintenanceData.fechaProgramada = fechaMantencion;
          } else {
            maintenanceData.fechaRealizada = fechaMantencion;
          }
          if (proximaMantencion && proximaMantencion > fechaMantencion) {
            maintenanceData.proximaMantencion = proximaMantencion;
          }
        } else if (proximaMantencion) {
          if (esFutura) {
            maintenanceData.fechaProgramada = proximaMantencion;
          } else {
            maintenanceData.fechaRealizada = proximaMantencion;
          }
        }

        await tx.maintenance.create({ data: maintenanceData });

        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${esFutura ? "programada" : "completada"} importada desde Excel`,
            usuarioSistema: ctx.session.user?.email || "sistema",
          },
        });
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
