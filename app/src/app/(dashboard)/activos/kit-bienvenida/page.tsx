"use client";

import { KitEppCategoriaView } from "@/components/kit-epp/KitEppCategoriaView";

// Antes vivia en Configuracion > Kit y EPP (junto con EPP en la misma
// pagina). Se movio aca (9-sep-2026) porque Configuracion quedo admin-only
// y el tecnico si necesita poder agregar/editar el stock de su propia
// sede -- ver ActivosTabs y KitEppCategoriaView.
export default function KitBienvenidaPage() {
  return <KitEppCategoriaView categoria="kit_bienvenida" titulo="Kit de Bienvenida" />;
}
