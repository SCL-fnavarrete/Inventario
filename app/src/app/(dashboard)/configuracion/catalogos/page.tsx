"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Tabs } from "@/shared/ui/Tabs";
import { CategoriasCatalogo, OpcionesCatalogo } from "@/modules/activos/componentes";

/**
 * Configuracion > Catalogos de Activos (SPEC 2.112.7): antes eran dos
 * pantallas, "Categorias de Activos" y "Opciones de Activos". La pestaña
 * queda en la direccion (?tab=) para poder volver o compartir el enlace.
 */

const OPCIONES: Record<string, { titulo: string; placeholder: string }> = {
  marcas: { titulo: "Marcas", placeholder: "Ej: Lenovo" },
  "sistemas-operativos": { titulo: "Sistemas operativos", placeholder: "Ej: Windows 11 Pro" },
  antivirus: { titulo: "Antivirus", placeholder: "Ej: Windows Defender" },
  "licencias-m365": { titulo: "Licencias Microsoft 365", placeholder: "Ej: Microsoft 365 Business Premium" },
};

type Pestaña = string;

const PESTAÑAS: { key: Pestaña; label: string }[] = [
  { key: "categorias", label: "Categorías" },
  ...Object.entries(OPCIONES).map(([key, o]) => ({
    key,
    label: o.titulo,
  })),
];

export default function CatalogosPage() {
  return (
    <Suspense>
      <Catalogos />
    </Suspense>
  );
}

function Catalogos() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pedida = params.get("tab");
  const pestaña: Pestaña = PESTAÑAS.some((p) => p.key === pedida) ? (pedida as Pestaña) : "categorias";

  // Los motivos de baja pasaron a Mantenciones (SPEC 2.116.5): el enlace antiguo lleva alla.
  useEffect(() => {
    if (pedida === "motivos-baja") router.replace("/mantenciones/motivos-baja");
  }, [pedida, router]);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Catálogos de Activos"
        description="Categorías y opciones que se eligen al crear o editar un activo"
      />

      <Tabs items={PESTAÑAS} value={pestaña} onChange={(p) => router.replace(`${pathname}?tab=${p}`, { scroll: false })} />

      {pestaña === "categorias" ? (
        <CategoriasCatalogo />
      ) : (
        <OpcionesCatalogo
          key={pestaña}
          endpoint={`/api/${pestaña}`}
          titulo={OPCIONES[pestaña].titulo}
          placeholder={OPCIONES[pestaña].placeholder}
        />
      )}
    </div>
  );
}
