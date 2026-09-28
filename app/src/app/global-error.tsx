"use client";

/**
 * Error en el layout raiz: reemplaza todo el documento y no recibe los
 * estilos globales (lo dice la documentacion de Next 16), por eso los estilos
 * van en linea. Ultimo recurso; los errores de cada pantalla los atrapa
 * (dashboard)/error.tsx (auditoria 27-sep-2026, 6.1).
 */
export default function ErrorGlobal({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f9fafb",
          color: "#111827",
        }}
      >
        <title>Error — Inventario IT</title>
        <div role="alert" style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>El sistema tuvo un problema</h1>
          <p style={{ fontSize: 14, color: "#4b5563" }}>
            Intenta de nuevo. Si se repite, avisa a soporte
            {error.digest ? ` con el código ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              border: 0,
              borderRadius: 8,
              background: "#006a93",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
