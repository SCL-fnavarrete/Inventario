"use client";

import { KitEppCategoriaView } from "@/components/kit-epp/KitEppCategoriaView";

// Vive fuera de Configuracion (que es admin-only) porque el tecnico
// necesita poder agregar/editar el stock de EPP.
export default function EppPage() {
  return <KitEppCategoriaView categoria="epp" titulo="EPP" />;
}
