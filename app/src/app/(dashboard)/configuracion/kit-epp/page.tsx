import { redirect } from "next/navigation";

// Configuracion es admin-only; este stock lo edita tambien el tecnico,
// por eso vive en /activos. Redirige en vez de eliminar la ruta.
export default function KitEppRedirectPage() {
  redirect("/activos/kit-bienvenida");
}
