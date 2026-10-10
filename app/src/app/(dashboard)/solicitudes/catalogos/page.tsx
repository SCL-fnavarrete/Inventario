import { Suspense } from "react";
import { CatalogosSolicitud } from "@/modules/solicitudes/componentes";

// Solicitudes > Catalogos: supervisor, division, area, sub-area y listas de distribucion (SPEC 2.142).
export default function CatalogosSolicitudPage() {
  return (
    <Suspense>
      <CatalogosSolicitud />
    </Suspense>
  );
}
