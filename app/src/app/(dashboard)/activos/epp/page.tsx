"use client";

import { KitEppCategoriaView } from "@/modules/kit-epp/componentes";

// Vive fuera de Configuracion (que es admin-only) porque el tecnico
// necesita poder agregar/editar el stock de EPP.
export default function EppPage() {
  return <KitEppCategoriaView categoria="epp" titulo="EPP" />;
}
