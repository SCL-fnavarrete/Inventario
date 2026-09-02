import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

type DeleteType =
  | "activos"
  | "empleados"
  | "asignaciones"
  | "mantenciones"
  | "compras"
  | "desvinculaciones";

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'delete');

    // Solo admin puede eliminar
    const body = await request.json();
    const { tipo } = body as { tipo: DeleteType };

    if (!tipo) {
      return NextResponse.json({ error: "Tipo de eliminación no especificado" }, { status: 400 });
    }

    const tiposValido : DeleteType[] = ["activos", "empleados", "asignaciones", "mantenciones", "compras", "desvinculaciones"];
    if(!tiposValido.includes(tipo)){
      return NextResponse.json({error:"Tipo de eliminación no válido" }, { status: 400 });
    }


    let deletedCount = 0;
    let message = "";

    await prisma.$transaction(async (tx:Prisma.TransactionClient) => {
      switch (tipo) {
        case "activos":
          // SPEC 2.7.7 / NF-03: un activo con historial de auditoría o guías
          // de despacho asociadas es evidencia y nunca se borra, ni siquiera
          // desde este panel de administración. Solo se eliminan los activos
          // "limpios" -- sin historial ni guías -- típicamente datos de
          // prueba o duplicados de importación.
          const activosBorrables = await tx.asset.findMany({
            where: {
              history: { none: {} },
              dispatchItems: { none: {} },
            },
            select: { id: true },
          });
          const idsBorrables = activosBorrables.map((a) => a.id);

          await tx.assignment.deleteMany({ where: { assetId: { in: idsBorrables } } });
          await tx.maintenance.deleteMany({ where: { assetId: { in: idsBorrables } } });
          await tx.purchaseAsset.deleteMany({ where: { assetId: { in: idsBorrables } } });

          const activosResult = await tx.asset.deleteMany({ where: { id: { in: idsBorrables } } });
          deletedCount = activosResult.count;

          const activosConservados = await tx.asset.count();
          message = deletedCount > 0
            ? `Se eliminaron ${deletedCount} activos sin historial de auditoría. ${activosConservados} activos se conservaron porque tienen historial o guías de despacho asociadas.`
            : `No se eliminó ningún activo: los ${activosConservados} activos existentes tienen historial de auditoría o guías de despacho asociadas.`;
          break;

        case "empleados":
          // Eliminar en orden
          // Eliminar asignaciones de kit
          await tx.kitAssignment.deleteMany({});
          // Eliminar desvinculaciones
          await tx.termination.deleteMany({});
          // Eliminar asignaciones
          await tx.assignment.deleteMany({});
          // Actualizar activos para quitar referencia a empleado
          await tx.asset.updateMany({
            where: { empleadoActualId: { not: null } },
            data: { empleadoActualId: null, estado: "disponible" },
          });
          // Finalmente eliminar empleados
          const empleadosResult = await tx.employee.deleteMany({});
          deletedCount = empleadosResult.count;
          message = `Se eliminaron ${deletedCount} empleados y sus datos relacionados.`;
          break;

        case "asignaciones":
          // Actualizar activos para cambiar estado a disponible
          await tx.asset.updateMany({
            where: { estado: "asignado" },
            data: { estado: "disponible", empleadoActualId: null },
          });
          // Eliminar asignaciones
          const asignacionesResult = await tx.assignment.deleteMany({});
          deletedCount = asignacionesResult.count;
          message = `Se eliminaron ${deletedCount} asignaciones. Los activos asignados volvieron a estado disponible.`;
          break;

        case "mantenciones":
          // Actualizar activos en mantención
          await tx.asset.updateMany({
            where: { estado: "en_mantencion" },
            data: { estado: "disponible" },
          });
          // Eliminar mantenciones
          const mantencionesResult = await tx.maintenance.deleteMany({});
          deletedCount = mantencionesResult.count;
          message = `Se eliminaron ${deletedCount} mantenciones.`;
          break;

        case "compras":
          // Eliminar relación compra-activo primero
          await tx.purchaseAsset.deleteMany({});
          // Eliminar compras
          const comprasResult = await tx.purchase.deleteMany({});
          deletedCount = comprasResult.count;
          message = `Se eliminaron ${deletedCount} compras y sus vínculos con activos.`;
          break;

        case "desvinculaciones":
          const desvinculacionesResult = await tx.termination.deleteMany({});
          deletedCount = desvinculacionesResult.count;
          message = `Se eliminaron ${deletedCount} registros de desvinculación.`;
          break;
      }
    });
     

     

      

    // Registrar la acción (podrías crear una tabla de logs de auditoría)
    console.log(`[ADMIN DELETE] Usuario: ${session.user.email} | Tipo: ${tipo} | Registros eliminados: ${deletedCount} | Fecha: ${new Date().toISOString()}`);

    return NextResponse.json({
      success: true,
      message,
      deletedCount
    });

  } catch (error) {
    return handleApiError(error, 'Error al eliminar registros. Puede haber restricciones de integridad.');
  }
}
