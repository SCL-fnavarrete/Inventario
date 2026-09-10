"use client";

import { KitEppCategoriaView } from "@/components/kit-epp/KitEppCategoriaView";

// Antes vivia en Configuracion > Kit y EPP (junto con Kit de Bienvenida en
// la misma pagina). Se movio aca (9-sep-2026) porque Configuracion quedo
// admin-only y el tecnico si necesita poder agregar/editar el stock de su
// propia sede -- ver ActivosTabs y KitEppCategoriaView.
export default function EppPage() {
  return <KitEppCategoriaView categoria="epp" titulo="EPP" />;
}
