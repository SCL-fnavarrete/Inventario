import Link from "next/link";
import { buttonClasses } from "@/components/ui/buttonStyles";

/**
 * Registro inexistente (o de otra sede, que se responde igual para no
 * revelar que existe) dentro del sistema: la ficha llama a notFound().
 * Queda dentro del layout, con el menu (auditoria 27-sep-2026, 6.1).
 */
export default function NoEncontrado() {
  return (
    <div className="card mx-auto mt-16 max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold text-fg">No encontramos lo que buscas</h1>
      <p className="mt-2 text-sm text-fg-muted">
        El registro no existe, fue descartado o no pertenece a tu sede.
      </p>
      <div className="mt-6 flex justify-center">
        <Link href="/" className={buttonClasses()}>
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
