"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { CategoriasCatalogo } from "@/components/configuracion/CategoriasCatalogo";
import { OpcionesCatalogo } from "@/components/configuracion/OpcionesCatalogo";

/**
 * Configuracion > Catalogos de Activos (SPEC 2.112.7): antes eran dos
 * pantallas, "Categorias de Activos" y "Opciones de Activos". La pestaña
 * queda en la direccion (?tab=) para poder volver o compartir el enlace.
 */

const OPCIONES = {
  "sistemas-operativos": { titulo: "Sistemas operativos", placeholder: "Ej: Windows 11 Pro" },
  antivirus: { titulo: "Antivirus", placeholder: "Ej: Windows Defender" },
  "licencias-m365": { titulo: "Licencias Microsoft 365", placeholder: "Ej: Microsoft 365 Business Premium" },
} as const;

type Pestaña = "categorias" | keyof typeof OPCIONES;

const PESTAÑAS: { key: Pestaña; label: string }[] = [
  { key: "categorias", label: "Categorías" },
  ...(Object.entries(OPCIONES) as [keyof typeof OPCIONES, { titulo: string }][]).map(([key, o]) => ({
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
