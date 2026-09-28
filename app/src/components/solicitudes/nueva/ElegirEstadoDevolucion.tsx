"use client";

export type EstadoDevolucion = "ok" | "danado" | "no_devuelto";

/**
 * Calificacion de lo que devuelve un empleado (un equipo o un articulo de
 * EPP): buen estado, dañado o no devuelto (auditoria 28-sep-2026, 3.6). Antes
 * las tres opciones estaban escritas a mano en cada lista de Nueva Solicitud.
 */
export function ElegirEstadoDevolucion({
  nombre,
  etiqueta,
  valor,
  onElegir,
  textoNoDevuelto = "No devolvió",
  className = "flex gap-4 text-sm text-fg-muted",
}: {
  /** Nombre unico del grupo de opciones (uno por equipo o articulo). */
  nombre: string;
  /** Que se esta calificando, para el lector de pantalla. */
  etiqueta: string;
  valor: EstadoDevolucion | undefined;
  onElegir: (estado: EstadoDevolucion) => void;
  /** En una recuperacion se dice "Sigue sin devolver". */
  textoNoDevuelto?: string;
  className?: string;
}) {
  const opciones: [EstadoDevolucion, string][] = [
    ["ok", "Buen estado"],
    ["danado", "Dañado"],
    ["no_devuelto", textoNoDevuelto],
  ];
  return (
    <div role="radiogroup" aria-label={`Estado de devolución: ${etiqueta}`} className={className}>
      {opciones.map(([estado, texto]) => (
        <label key={estado} className="flex items-center gap-1.5">
          <input type="radio" name={nombre} checked={valor === estado} onChange={() => onElegir(estado)} />
          {texto}
        </label>
      ))}
    </div>
  );
}
