"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/shared/ui/PageHeader";
import { CATALOGOS_EQUIPO, CategoriasCatalogo } from "@/modules/activos/componentes";

/**
 * Configuracion > Categorias de Activos (SPEC 2.112.7), solo admin. Marcas,
 * sistemas operativos, antivirus y licencias pasaron a Activos > Equipos >
 * Catalogos, donde tambien los usa el tecnico: un enlace antiguo (?tab=) lleva alla.
 */
export default function CatalogosPage() {
  return (
    <Suspense>
      <Categorias />
    </Suspense>
  );
}

function Categorias() {
  const router = useRouter();
  const pedida = useSearchParams().get("tab");

  useEffect(() => {
    // Los motivos de baja pasaron a Mantenciones (SPEC 2.116.5).
    if (pedida === "motivos-baja") router.replace("/mantenciones/motivos-baja");
    else if (pedida && pedida in CATALOGOS_EQUIPO) router.replace(`/activos/catalogos?tab=${pedida}`);
  }, [pedida, router]);

  return (
    <div className="space-y-6">
      <PageHeader backHref="/configuracion" title="Categorías de Activos" description="Tipos de equipo y la ficha que usa cada uno" />
      <CategoriasCatalogo />
    </div>
  );
}
