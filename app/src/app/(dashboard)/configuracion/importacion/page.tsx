"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AsistenteImportacion, FlujoEquipos, FlujoHistorial, type OpcionImportacion } from "@/modules/importacion/componentes";
import { guiaDeActivos, guiaDeHistorial } from "@/modules/importacion";
import { FlujoLineas } from "@/modules/lineas/componentes";
import { guiaDeLineas } from "@/modules/lineas";
import { logger } from "@/shared/logger";
import { PageHeader } from "@/shared/ui/PageHeader";

type Categoria = { id: string | number; nombre: string; tipoFicha: string };

/**
 * Configuracion > Importacion de datos (SPEC 2.133), solo admin: una sola pantalla
 * para importar equipos (una opcion por categoria), el historial de los equipos y
 * las lineas telefonicas. Lo elegido queda en la direccion (?que=) para volver o
 * compartir el enlace. Aqui se componen los modulos: la pieza comun vive en
 * Importacion y cada importacion es de su modulo.
 */
export default function ImportacionDeDatosPage() {
  return (
    <Suspense>
      <Importacion />
    </Suspense>
  );
}

function Importacion() {
  const router = useRouter();
  const pathname = usePathname();
  const que = useSearchParams().get("que") ?? "";
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch("/api/categorias")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCategorias(Array.isArray(data) ? data : []))
      .catch((e) => logger.error("Error al cargar categorías", e))
      .finally(() => setCargando(false));
  }, []);

  const opciones = useMemo<OpcionImportacion[]>(
    () => [
      ...categorias.map<OpcionImportacion>((c) => ({
        valor: `equipo:${c.nombre.toLowerCase()}`,
        grupo: "Equipos",
        etiqueta: c.nombre,
        guia: guiaDeActivos(c.tipoFicha, c.nombre),
        plantilla: { tipo: "equipos", ficha: c.tipoFicha, categoria: c.nombre },
        flujo: <FlujoEquipos categoria={c.nombre.toLowerCase()} ficha={c.tipoFicha} nombreCategoria={c.nombre} />,
      })),
      { valor: "historial", grupo: "Historial", etiqueta: "Historial de equipos (entregas anteriores)", guia: guiaDeHistorial(), plantilla: { tipo: "historial" }, flujo: <FlujoHistorial /> },
      { valor: "lineas", grupo: "Líneas", etiqueta: "Líneas telefónicas", guia: guiaDeLineas(), plantilla: { tipo: "lineas" }, flujo: <FlujoLineas /> },
    ],
    [categorias]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Importación de datos"
        description="Carga masiva desde Excel (.xlsx), solo administrador. Elige qué vas a importar: verás cómo debe ir el Excel y los pasos para importarlo."
      />
      <AsistenteImportacion opciones={opciones} valor={que} cargando={cargando} onCambio={(v) => router.replace(v ? `${pathname}?que=${encodeURIComponent(v)}` : pathname, { scroll: false })} />
    </div>
  );
}
