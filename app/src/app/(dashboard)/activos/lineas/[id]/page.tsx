import { notFound } from "next/navigation";
import { fichaLinea } from "@/modules/lineas/servidor";
import { DetalleLinea } from "@/modules/lineas/componentes";

// Activos > Lineas > ficha de una linea (SPEC 2.131). ?reasignar=1 baja hasta sus acciones (SPEC 2.167).
export default async function LineaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reasignar?: string }>;
}) {
  const { id } = await params;
  const { reasignar } = await searchParams;
  const ficha = await fichaLinea(id).catch(() => null);
  if (!ficha) notFound();
  return <DetalleLinea ficha={ficha} abrirReasignar={reasignar === "1"} />;
}
