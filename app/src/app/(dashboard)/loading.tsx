/**
 * Se muestra al instante mientras carga una pantalla del sistema (auditoria
 * 27-sep-2026, 6.1). Antes un clic en una pagina de servidor (Dashboard, ficha
 * de un activo) no daba ninguna señal durante 1 a 2 segundos y la gente volvia
 * a hacer clic.
 */
export default function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-64 animate-pulse rounded-control bg-surface-muted" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded-control bg-surface-muted" />
      <div className="card h-64 animate-pulse" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
