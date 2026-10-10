"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OpcionesCatalogo, type TextosCatalogo } from "@/modules/activos/componentes";
import { TIPOS_OPCION_PERSONA, type TipoOpcionPersona } from "@/modules/personas";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Tabs } from "@/shared/ui/Tabs";

/**
 * Solicitudes > Catalogos (SPEC 2.142): las opciones de supervisor, division,
 * area, sub-area y listas de distribucion que se eligen al pedir un onboarding.
 * Las administran todos; la pestaña queda en la direccion (?tab=).
 */
const PLACEHOLDERS: Record<TipoOpcionPersona, string> = {
  supervisor: "Ej: Benjamín Astudillo",
  division: "Ej: SCL",
  area: "Ej: RPA y Soporte IT",
  sub_area: "Ej: RPA",
  lista_distribucion: "Ej: SCL Masivo",
};

const personas = (n: number) => `${n} persona${n === 1 ? "" : "s"}`;
const TEXTOS: TextosCatalogo = {
  unidad: personas,
  ayuda:
    "Renombrar una opción cambia también a las personas que ya la tienen. Una que alguien tiene no se elimina: se desactiva y deja de ofrecerse.",
  renombrada: (n) => (n ? `Opción renombrada y ${personas(n)} corregidas` : "Opción renombrada"),
  avisoEliminar: (nombre, n) =>
    n > 0
      ? `"${nombre}" la tienen ${personas(n)}. Se desactivará: deja de ofrecerse y esas personas conservan el dato. ¿Continuar?`
      : `¿Eliminar la opción "${nombre}"?`,
};

const PESTAÑAS = (Object.keys(TIPOS_OPCION_PERSONA) as TipoOpcionPersona[]).map((key) => ({
  key,
  label: TIPOS_OPCION_PERSONA[key].titulo,
}));

export function CatalogosSolicitud() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const permisos = usePermissions();
  const pedida = params.get("tab");
  const tipo: TipoOpcionPersona = pedida && pedida in TIPOS_OPCION_PERSONA ? (pedida as TipoOpcionPersona) : "supervisor";

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/solicitudes"
        title="Catálogos de solicitudes"
        description="Opciones que se eligen en los datos de la persona de un onboarding. Se pueden agregar y renombrar cuando haga falta."
      />
      <Tabs items={PESTAÑAS} value={tipo} onChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })} />
      <OpcionesCatalogo
        key={tipo}
        endpoint={`/api/opciones-persona/${tipo}`}
        titulo={TIPOS_OPCION_PERSONA[tipo].titulo}
        placeholder={PLACEHOLDERS[tipo]}
        puedeEliminar={permisos.can("solicitudes", "delete")}
        textos={TEXTOS}
      />
    </div>
  );
}
