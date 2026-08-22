import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/guias-despacho/numero - Obtener próximo número de guía
export async function GET() {
  try {
    await requirePermission('guias', 'read');
    const year = new Date().getFullYear();

    const lastGuide = await prisma.dispatchGuide.findFirst({
      where: {
        numero: {
          startsWith: `GD-${year}-`,
        },
      },
      orderBy: { numero: "desc" },
    });

    let nextNumber = 1;
    if (lastGuide) {
      const lastNumber = parseInt(lastGuide.numero.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    const numero = `GD-${year}-${nextNumber.toString().padStart(5, "0")}`;

    return NextResponse.json({ numero });
  } catch (error) {
    return handleApiError(error, 'Error al obtener número de guía');
  }
}
