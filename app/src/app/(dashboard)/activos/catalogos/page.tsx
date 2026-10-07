import { Suspense } from "react";
import { CatalogosEquipo } from "@/modules/activos/componentes";

// Activos > Equipos > Catalogos: marcas, sistemas operativos, antivirus y licencias (SPEC 2.112.7).
export default function CatalogosEquipoPage() {
  return (
    <Suspense>
      <CatalogosEquipo />
    </Suspense>
  );
}
