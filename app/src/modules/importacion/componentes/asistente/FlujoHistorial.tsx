"use client";

import { useState } from "react";
import { CheckCircle2, Search, Upload } from "lucide-react";
import type { Fallo } from "@/modules/importacion";
import type { ResumenHistorial } from "@/modules/importacion/historial";
import { AvanceImportacion, BloquePaso, CargaArchivo, Pasos } from "@/modules/importacion/componentes/asistente/piezas";
import { ResumenFallos } from "@/modules/importacion/componentes/asistente/ResumenFallos";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { Button } from "@/shared/ui/Button";
import { ResumenErrores } from "@/shared/ui/CampoFormulario";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";

/**
 * Historial de equipos dentro del asistente de Importacion de datos (SPEC 2.133).
 * Lee las hojas ENTREGAS y PERSONAS del Excel normalizado y deja las entregas
 * anteriores de cada equipo como su historial. El formato es fijo (no hay paso de
 * columnas): se revisa (no escribe nada) y se importa. Los equipos tienen que
 * estar ya importados.
 */

const PASOS = ["Archivo", "Revisión", "Importar"] as const;

async function enviar(archivo: File, confirmar: boolean): Promise<ResumenHistorial> {
  const form = new FormData();
  form.append("file", archivo);
  form.append("confirmar", String(confirmar));
  const res = await fetch("/api/activos/importar/historial", { method: "POST", body: form });
  if (!res.ok) throw new Error((await parseApiError(res, "Error al leer el archivo")).message);
  return res.json();
}

export function FlujoHistorial() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<ResumenHistorial | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const paso = resumen?.confirmado ? 3 : resumen ? 2 : 1;

  const ejecutar = async (confirmar: boolean) => {
    if (!archivo) return;
    setOcupado(true);
    setError("");
    try {
      setResumen(await enviar(archivo, confirmar));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al leer el archivo");
    } finally {
      setOcupado(false);
    }
  };

  const fallos: Fallo[] = resumen?.resultados.filter((r) => r.resultado === "error").map((r) => ({ fila: r.fila, mensaje: r.mensaje ?? "No se pudo registrar", referencia: `${r.persona} · ${r.equipo}` })) ?? [];

  return (
    <div className="space-y-6">
      <Pasos actual={paso} pasos={PASOS} />
      <ResumenErrores mensaje={error} />

      <BloquePaso>
        <CargaArchivo
          archivo={archivo}
          deshabilitado={ocupado}
          onElegir={(f) => {
            setArchivo(f);
            setResumen(null);
            setError("");
          }}
          onQuitar={() => {
            setArchivo(null);
            setResumen(null);
            setError("");
          }}
        />
        {!resumen && (
          <div className="flex justify-end">
            <Button loading={ocupado} disabled={!archivo} leftIcon={<Search size={18} />} onClick={() => ejecutar(false)}>
              Revisar
            </Button>
          </div>
        )}
      </BloquePaso>

      {ocupado && resumen && <AvanceImportacion hechas={0} total={resumen.total} texto="Importando el historial..." />}

      {resumen && (
        <BloquePaso titulo={resumen.confirmado ? "Resultado" : "Revisión"}>
          <StatGrid cols={4}>
            <StatCard variant="soft" tone="success" label={resumen.confirmado ? "Registradas" : "Se registrarán"} value={resumen.registradas} />
            <StatCard variant="soft" label="Ya estaban" value={resumen.repetidas} />
            <StatCard variant="soft" tone="danger" label="Con error" value={resumen.errores} />
            <StatCard variant="soft" label={resumen.confirmado ? "Personas creadas" : "Personas nuevas"} value={resumen.personasNuevasActivas + resumen.personasNuevasDesvinculadas} />
          </StatGrid>
          <p className="text-sm text-fg-muted">
            {resumen.personasNuevasDesvinculadas} desvinculada(s) y {resumen.personasNuevasActivas} activa(s). Las personas que ya existen no cambian de estado.
          </p>

          <ResumenFallos fallos={fallos} titulo={resumen.confirmado ? "Entregas que no se pudieron registrar" : `${fallos.length} entrega${fallos.length === 1 ? "" : "s"} que no se van a registrar`} archivo="errores-historial" />

          {resumen.confirmado ? (
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              <CheckCircle2 size={18} aria-hidden="true" /> Historial importado. Abre un equipo en Activos para ver quién lo tuvo antes.
            </p>
          ) : (
            <div className="flex justify-end">
              <Button loading={ocupado} disabled={resumen.registradas === 0} leftIcon={<Upload size={18} />} onClick={() => ejecutar(true)}>
                Importar {resumen.registradas} entrega{resumen.registradas === 1 ? "" : "s"}
              </Button>
            </div>
          )}
        </BloquePaso>
      )}
    </div>
  );
}
