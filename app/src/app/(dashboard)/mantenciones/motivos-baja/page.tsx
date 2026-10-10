import { redirect } from "next/navigation";

// Los motivos de baja se administran en Activos > Catálogos de equipos (SPEC 2.116.5).
// Esta dirección queda para los enlaces antiguos.
export default function MotivosBajaPage() {
  redirect("/activos/catalogos?tab=motivos-baja");
}
