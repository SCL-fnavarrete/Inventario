import { NextResponse } from "next/server";

// Modulo Proveedores eliminado; la tabla Supplier ya no existe. Se deja
// como stub para que cualquier llamada existente reciba un 410 Gone claro
// en vez de un error 500 de Prisma contra una tabla inexistente.
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
