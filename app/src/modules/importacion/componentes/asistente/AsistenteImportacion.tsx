"use client";

import type { ReactNode } from "react";
import type { GuiaImportacion } from "@/modules/importacion";
import { CampoFormulario, claseInput } from "@/shared/ui/CampoFormulario";
import { GuiaExcel } from "@/modules/importacion/componentes/asistente/GuiaExcel";

/**
 * Importacion de datos (SPEC 2.133): una sola pantalla para todo lo que se
 * importa. Primero se elige que (cada categoria de equipo, lineas telefonicas o
 * historial de equipos); se muestra como debe ir su Excel (con la plantilla para
 * bajar) y debajo va el asistente de esa importacion, siempre con los mismos
 * pasos: Archivo, Columnas, Revision e Importar. Cada importacion aporta solo lo
 * suyo (`flujo`); esta pieza no sabe nada de equipos ni de lineas.
 */
export interface OpcionImportacion {
  valor: string;
  /** Grupo del selector (Equipos, Líneas, Historial). */
  grupo: string;
  etiqueta: string;
  guia: GuiaImportacion;
  /** Parametros de GET /api/importacion/plantilla. */
  plantilla: Record<string, string>;
  flujo: ReactNode;
}

export function AsistenteImportacion({
  opciones,
  valor,
  onCambio,
  cargando,
}: {
  opciones: OpcionImportacion[];
  valor: string;
  onCambio: (valor: string) => void;
  cargando?: boolean;
}) {
  const elegida = opciones.find((o) => o.valor === valor);
  const grupos = [...new Set(opciones.map((o) => o.grupo))];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <CampoFormulario label="¿Qué vas a importar?" obligatorio htmlFor="importar-que" ayuda="Cada tipo tiene su propio Excel; al elegirlo ves cómo debe ir y puedes bajar una plantilla.">
          <select id="importar-que" value={elegida ? valor : ""} onChange={(e) => onCambio(e.target.value)} disabled={cargando} className={claseInput()}>
            <option value="">{cargando ? "Cargando…" : "Elige qué importar"}</option>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {opciones
                  .filter((o) => o.grupo === g)
                  .map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </CampoFormulario>
      </div>

      {elegida && (
        <>
          <GuiaExcel key={`guia-${elegida.valor}`} guia={elegida.guia} descarga={`/api/importacion/plantilla?${new URLSearchParams(elegida.plantilla)}`} />
          {/* Al cambiar de importacion se parte de cero: otro archivo, otras columnas. */}
          <div key={elegida.valor}>{elegida.flujo}</div>
        </>
      )}
    </div>
  );
}
