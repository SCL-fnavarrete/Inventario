"use client";

import { MantencionesTabs } from "@/modules/mantenciones/componentes";
import { OpcionesCatalogo, type TextosCatalogo } from "@/modules/activos/componentes/OpcionesCatalogo";
import { PageHeader } from "@/shared/ui/PageHeader";

/**
 * Mantenciones > Motivos de baja (SPEC 2.116.5). Catalogo operativo como
 * "Tipos": lo administran admin y tecnico (recurso motivosBaja). La baja
 * apunta al motivo, asi que renombrar no toca registros y uno ya usado se
 * desactiva en vez de borrarse.
 */

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

export default function MotivosBajaPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Mantenciones" description="Gestión de mantenciones preventivas y correctivas" />
      <MantencionesTabs />
      <h2 className="text-lg font-semibold text-fg">Motivos de baja</h2>
      <OpcionesCatalogo
        endpoint="/api/motivos-baja"
        titulo="Motivos de baja"
        placeholder="Ej: Daño por líquido"
        textos={TEXTOS_MOTIVOS}
      />
    </div>
  );
}
