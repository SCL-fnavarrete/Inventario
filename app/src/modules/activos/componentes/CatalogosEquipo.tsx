"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActivosTabs } from "@/modules/activos/componentes/ActivosTabs";
import { OpcionesCatalogo, type TextosCatalogo } from "@/modules/activos/componentes/OpcionesCatalogo";
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
/** Textos de los motivos de baja (SPEC 2.116.5): se cuentan bajas, no equipos con el dato. */
const bajas = (n: number) => `${n} baja${n === 1 ? "" : "s"}`;
const TEXTOS_MOTIVOS_BAJA: TextosCatalogo = {
  unidad: bajas,
  ayuda:
    "Motivos que se eligen al dar de baja un equipo. Renombrar cambia el nombre también en las bajas ya hechas. Uno que ya se usó se desactiva en vez de eliminarse. Extravío y Otro los usa el sistema: solo se pueden renombrar.",
  renombrada: () => "Motivo renombrado",
  avisoEliminar: (nombre, n) =>
    n > 0
      ? `"${nombre}" ya se usó en ${bajas(n)} (todas las sedes). Se desactivará: deja de ofrecerse y esas bajas conservan su motivo. ¿Continuar?`
      : `¿Eliminar el motivo "${nombre}"?`,
};

export const CATALOGOS_EQUIPO = {
  marcas: { titulo: "Marcas", placeholder: "Ej: Lenovo" },
  "sistemas-operativos": { titulo: "Sistemas operativos", placeholder: "Ej: Windows 11 Pro" },
  antivirus: { titulo: "Antivirus", placeholder: "Ej: Windows Defender" },
  "licencias-m365": { titulo: "Licencias Microsoft 365", placeholder: "Ej: Microsoft 365 Business Premium" },
  "motivos-baja": { titulo: "Motivos de baja", placeholder: "Ej: Daño por líquido" },
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
        textos={catalogo === "motivos-baja" ? TEXTOS_MOTIVOS_BAJA : undefined}
      />
    </div>
  );
}
