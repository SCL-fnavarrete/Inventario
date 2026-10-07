"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActivosTabs } from "@/modules/activos/componentes/ActivosTabs";
import { OpcionesCatalogo } from "@/modules/activos/componentes/OpcionesCatalogo";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Tabs } from "@/shared/ui/Tabs";

/**
 * Activos > Equipos > Catalogos (SPEC 2.112.7): las opciones que se eligen al
 * crear o editar un equipo. Admin y tecnico las ven, agregan y renombran
 * (`activos/write`); eliminar es del admin (`activos/delete`). Las categorias
 * no estan aqui: son de Configuracion (solo admin). La pestaña queda en la
 * direccion (?tab=) para volver o compartir el enlace.
 */
export const CATALOGOS_EQUIPO = {
  marcas: { titulo: "Marcas", placeholder: "Ej: Lenovo" },
  "sistemas-operativos": { titulo: "Sistemas operativos", placeholder: "Ej: Windows 11 Pro" },
  antivirus: { titulo: "Antivirus", placeholder: "Ej: Windows Defender" },
  "licencias-m365": { titulo: "Licencias Microsoft 365", placeholder: "Ej: Microsoft 365 Business Premium" },
} as const;

type Catalogo = keyof typeof CATALOGOS_EQUIPO;

const PESTAÑAS = Object.entries(CATALOGOS_EQUIPO).map(([key, c]) => ({ key: key as Catalogo, label: c.titulo }));

export function CatalogosEquipo() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const permisos = usePermissions();
  const pedida = params.get("tab");
  const catalogo: Catalogo = pedida && pedida in CATALOGOS_EQUIPO ? (pedida as Catalogo) : "marcas";
  const { titulo, placeholder } = CATALOGOS_EQUIPO[catalogo];

  return (
    <div className="space-y-6">
      <ActivosTabs />
      <PageHeader
        backHref="/activos"
        title="Catálogos de equipos"
        description="Opciones que se eligen al crear o editar un equipo. Se pueden agregar y renombrar (cambia también en los equipos que la usan); eliminar es del administrador."
      />
      <Tabs items={PESTAÑAS} value={catalogo} onChange={(c) => router.replace(`${pathname}?tab=${c}`, { scroll: false })} />
      <OpcionesCatalogo
        key={catalogo}
        endpoint={`/api/${catalogo}`}
        titulo={titulo}
        placeholder={placeholder}
        puedeEliminar={permisos.can("activos", "delete")}
      />
    </div>
  );
}
