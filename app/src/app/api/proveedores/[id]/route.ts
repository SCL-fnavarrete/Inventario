import { NextResponse } from "next/server";

// Modulo Proveedores eliminado (14-sep-2026) -- ver /api/proveedores/route.ts
// y SPEC 2.35 para el detalle completo de por que este archivo queda como
// stub en vez de borrarse.
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
