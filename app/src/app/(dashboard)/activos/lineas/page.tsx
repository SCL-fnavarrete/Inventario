import { Suspense } from "react";
import { LineasView } from "@/modules/lineas/componentes";

// Activos > Lineas telefonicas (SPEC 2.131). Suspense: los filtros se leen de la URL.
export default function LineasPage() {
  return (
    <Suspense>
      <LineasView />
    </Suspense>
  );
}
