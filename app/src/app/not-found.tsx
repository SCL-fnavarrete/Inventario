import Link from "next/link";
import { buttonClasses } from "@/shared/ui/buttonStyles";

/**
 * Direccion que no existe en el sistema (ej. /activoss). Antes se veia el 404
 * generico de Next en ingles (auditoria 27-sep-2026, 6.1).
 */
export default function PaginaNoExiste() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card max-w-md p-8 text-center">
        <p className="text-sm font-semibold text-primary-700">Error 404</p>
        <h1 className="mt-1 text-xl font-bold text-fg">Esta página no existe</h1>
        <p className="mt-2 text-sm text-fg-muted">Revisa la dirección o vuelve al inicio.</p>
        <Link href="/" className={buttonClasses({ className: "mt-6" })}>
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
