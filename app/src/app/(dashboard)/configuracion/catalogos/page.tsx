"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { CategoriasCatalogo } from "@/components/configuracion/CategoriasCatalogo";
import { OpcionesCatalogo, type TextosCatalogo } from "@/components/configuracion/OpcionesCatalogo";

/**
 * Configuracion > Catalogos de Activos (SPEC 2.112.7): antes eran dos
 * pantallas, "Categorias de Activos" y "Opciones de Activos". La pestaña
 * queda en la direccion (?tab=) para poder volver o compartir el enlace.
 */

// Motivos de baja (SPEC 2.116.5): la baja apunta al motivo, asi que
// renombrar no toca registros y uno usado se desactiva en vez de borrarse.
const bajas = (n: number) => `${n} baja${n === 1 ? "" : "s"}`;
const TEXTOS_MOTIVOS: TextosCatalogo = {
  unidad: bajas,
  ayuda:
    "Motivos que se eligen al dar de baja un equipo. Renombrar cambia el nombre también en las bajas ya hechas. Uno que ya se usó se desactiva en vez de eliminarse. Extravío y Otro los usa el sistema: solo se pueden renombrar.",
  renombrada: () => "Motivo renombrado",
  avisoEliminar: (nombre, n) =>
    n > 0
      ? `"${nombre}" ya se usó en ${bajas(n)} (todas las sedes). Se desactivará: deja de ofrecerse y esas bajas conservan su motivo. ¿Continuar?`
      : `¿Eliminar el motivo "${nombre}"?`,
};

const OPCIONES: Record<string, { titulo: string; placeholder: string; textos?: TextosCatalogo }> = {
  marcas: { titulo: "Marcas", placeholder: "Ej: Lenovo" },
  "sistemas-operativos": { titulo: "Sistemas operativos", placeholder: "Ej: Windows 11 Pro" },
  antivirus: { titulo: "Antivirus", placeholder: "Ej: Windows Defender" },
  "licencias-m365": { titulo: "Licencias Microsoft 365", placeholder: "Ej: Microsoft 365 Business Premium" },
  "motivos-baja": { titulo: "Motivos de baja", placeholder: "Ej: Daño por líquido", textos: TEXTOS_MOTIVOS },
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
          textos={OPCIONES[pestaña].textos}
        />
      )}
    </div>
  );
}
