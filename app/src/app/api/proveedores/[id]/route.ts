import { NextResponse } from "next/server";

// Modulo de Proveedores eliminado; este archivo queda como stub que
// responde 410 en vez de borrarse. Ver /api/proveedores/route.ts.
function gone() {
  return NextResponse.json(
    { error: "El módulo de Proveedores fue eliminado. Esta tabla ya no existe." },
    { status: 410 }
  );
}

export async function GET() {
  return gone();
}

export async function PUT() {
  return gone();
}

export async function DELETE() {
  return gone();
}
