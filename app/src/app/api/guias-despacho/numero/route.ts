import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/guias-despacho/numero - Obtener próximo número de guía
export async function GET() {
  try {
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
    console.error("Error getting next dispatch guide number:", error);
    return NextResponse.json(
      { error: "Error al obtener número de guía" },
      { status: 500 }
    );
  }
}
