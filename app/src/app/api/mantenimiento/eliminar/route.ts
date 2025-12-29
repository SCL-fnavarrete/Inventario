import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DeleteType =
  | "activos"
  | "empleados"
  | "asignaciones"
  | "mantenciones"
  | "historial"
  | "compras"
  | "desvinculaciones";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Solo admin puede eliminar
    const userRole = (session.user as { role?: string; rol?: string }).role ||
                     (session.user as { role?: string; rol?: string }).rol;
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Acceso denegado. Solo administradores pueden realizar esta acción." }, { status: 403 });
    }

    const body = await request.json();
    const { tipo } = body as { tipo: DeleteType };

    if (!tipo) {
      return NextResponse.json({ error: "Tipo de eliminación no especificado" }, { status: 400 });
    }

    let deletedCount = 0;
    let message = "";

    switch (tipo) {
      case "activos":
        // Eliminar en orden para respetar las relaciones
        // Primero eliminar historial
        await prisma.assetHistory.deleteMany({});
        // Eliminar asignaciones
        await prisma.assignment.deleteMany({});
        // Eliminar mantenciones
        await prisma.maintenance.deleteMany({});
        // Eliminar relación compra-activo
        await prisma.purchaseAsset.deleteMany({});
        // Finalmente eliminar activos
        const activosResult = await prisma.asset.deleteMany({});
        deletedCount = activosResult.count;
        message = `Se eliminaron ${deletedCount} activos y sus datos relacionados (historial, asignaciones, mantenciones).`;
        break;

      case "empleados":
        // Eliminar en orden
        // Eliminar asignaciones de kit
        await prisma.kitAssignment.deleteMany({});
        // Eliminar desvinculaciones
        await prisma.termination.deleteMany({});
        // Eliminar asignaciones
        await prisma.assignment.deleteMany({});
        // Actualizar activos para quitar referencia a empleado
        await prisma.asset.updateMany({
          where: { empleadoActualId: { not: null } },
          data: { empleadoActualId: null, estado: "disponible" },
        });
        // Finalmente eliminar empleados
        const empleadosResult = await prisma.employee.deleteMany({});
        deletedCount = empleadosResult.count;
        message = `Se eliminaron ${deletedCount} empleados y sus datos relacionados.`;
        break;

      case "asignaciones":
        // Actualizar activos para cambiar estado a disponible
        await prisma.asset.updateMany({
          where: { estado: "asignado" },
          data: { estado: "disponible", empleadoActualId: null },
        });
        // Eliminar asignaciones
        const asignacionesResult = await prisma.assignment.deleteMany({});
        deletedCount = asignacionesResult.count;
        message = `Se eliminaron ${deletedCount} asignaciones. Los activos asignados volvieron a estado disponible.`;
        break;

      case "mantenciones":
        // Actualizar activos en mantención
        await prisma.asset.updateMany({
          where: { estado: "en_mantencion" },
          data: { estado: "disponible" },
        });
        // Eliminar mantenciones
        const mantencionesResult = await prisma.maintenance.deleteMany({});
        deletedCount = mantencionesResult.count;
        message = `Se eliminaron ${deletedCount} mantenciones.`;
        break;

      case "historial":
        const historialResult = await prisma.assetHistory.deleteMany({});
        deletedCount = historialResult.count;
        message = `Se eliminaron ${deletedCount} registros de historial.`;
        break;

      case "compras":
        // Eliminar relación compra-activo primero
        await prisma.purchaseAsset.deleteMany({});
        // Eliminar compras
        const comprasResult = await prisma.purchase.deleteMany({});
        deletedCount = comprasResult.count;
        message = `Se eliminaron ${deletedCount} compras y sus vínculos con activos.`;
        break;

      case "desvinculaciones":
        const desvinculacionesResult = await prisma.termination.deleteMany({});
        deletedCount = desvinculacionesResult.count;
        message = `Se eliminaron ${deletedCount} registros de desvinculación.`;
        break;

      default:
        return NextResponse.json({ error: "Tipo de eliminación no válido" }, { status: 400 });
    }

    // Registrar la acción (podrías crear una tabla de logs de auditoría)
    console.log(`[ADMIN DELETE] Usuario: ${session.user.email} | Tipo: ${tipo} | Registros eliminados: ${deletedCount} | Fecha: ${new Date().toISOString()}`);

    return NextResponse.json({
      success: true,
      message,
      deletedCount
    });

  } catch (error) {
    console.error("Error en eliminación masiva:", error);
    return NextResponse.json(
      { error: "Error al eliminar registros. Puede haber restricciones de integridad." },
      { status: 500 }
    );
  }
}
