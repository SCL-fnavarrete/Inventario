import { NextResponse } from "next/server";

// Modulo Proveedores eliminado (14-sep-2026, pedido explicito de Javier:
// "elimina la tabla de proveedores" -- la tabla Supplier no se usaba). El
// archivo se deja como stub en vez de borrarse (workaround del flujo de
// respaldo cuando no se puede borrar archivos del dispositivo del usuario)
// -- cualquier llamada existente recibe un 410 Gone claro en vez de un error
// 500 de Prisma contra una tabla que ya no existe. Ver SPEC 2.35.
function gone() {
  return NextResponse.json(
    { error: "El módulo de Proveedores fue eliminado. Esta tabla ya no existe." },
    { status: 410 }
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
