"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { textoDeFilas, type MarcaNueva } from "@/modules/importacion";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { Button } from "@/shared/ui/Button";
import { claseInput, enfocarPrimerError } from "@/shared/ui/CampoFormulario";

/**
 * Las marcas del Excel que faltan en el catalogo (SPEC 2.133): se crean desde la
 * revision, una por una o todas, y las filas se vuelven a revisar solas. El
 * nombre llega con el formato unico de marcas y se puede corregir antes de crear
 * (por ejemplo una sigla); el servidor lo deja igual de ordenado y no duplica una
 * marca que ya existe con otras mayusculas.
 */
export function MarcasNuevas({ marcas, onCreadas, deshabilitado }: { marcas: MarcaNueva[]; onCreadas: () => void; deshabilitado?: boolean }) {
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  // Marca que el servidor rechazo: su campo queda en rojo para corregirla.
  const [fallida, setFallida] = useState("");
  if (marcas.length === 0) return null;

  const nombreDe = (m: MarcaNueva) => nombres[m.nombre] ?? m.nombre;

  async function crear(lista: MarcaNueva[]) {
    setTrabajando(true);
    setError("");
    setFallida("");
    let alguna = false;
    try {
      for (const m of lista) {
        const res = await fetch("/api/marcas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombreDe(m) }) });
        if (!res.ok) {
          setError(`No se pudo crear "${nombreDe(m)}": ${(await parseApiError(res, "Error al crear la marca")).message}`);
          setFallida(m.nombre);
          enfocarPrimerError();
          break;
        }
        alguna = true;
      }
    } catch {
      setError("No se pudo crear la marca. Revisa la conexión e intenta de nuevo.");
    } finally {
      setTrabajando(false);
      if (alguna) onCreadas();
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-label="Marcas que faltan en el catálogo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Tag size={18} aria-hidden="true" />
          {marcas.length} marca{marcas.length === 1 ? "" : "s"} nueva{marcas.length === 1 ? "" : "s"} en el Excel
        </h3>
        {marcas.length > 1 && (
          <Button size="sm" onClick={() => crear(marcas)} disabled={trabajando || deshabilitado}>
            Crear las {marcas.length} marcas
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-muted">Cada marca queda escrita de una sola forma (Dell, no DELL ni dell). Corrige el nombre si hace falta, por ejemplo una sigla como AOC.</p>
      <ul className="space-y-2">
        {marcas.map((m) => (
          <li key={m.nombre} className="flex flex-wrap items-center gap-2">
            <input
              value={nombreDe(m)}
              onChange={(e) => {
                setNombres((n) => ({ ...n, [m.nombre]: e.target.value }));
                if (fallida === m.nombre) setFallida("");
              }}
              aria-invalid={fallida === m.nombre}
              className={`${claseInput(fallida === m.nombre ? error : undefined)} max-w-xs`}
              aria-label={`Nombre de la marca ${m.nombre}`}
              maxLength={100}
              disabled={trabajando}
            />
            <Button variant="outline" size="sm" onClick={() => crear([m])} disabled={trabajando || deshabilitado || !nombreDe(m).trim()}>
              Crear marca
            </Button>
            <span className="text-xs text-fg-subtle">
              {m.filas.length} fila{m.filas.length === 1 ? "" : "s"} · {textoDeFilas(m.filas)}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
