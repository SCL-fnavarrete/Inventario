"use client";

import { KitEppCategoriaView } from "@/components/kit-epp/KitEppCategoriaView";

// Vive fuera de Configuracion (que es admin-only) porque el tecnico
// necesita poder agregar/editar el stock de Kit de Bienvenida de su
// propia sede.
export default function KitBienvenidaPage() {
  return <KitEppCategoriaView categoria="kit_bienvenida" titulo="Kit de Bienvenida" />;
}
