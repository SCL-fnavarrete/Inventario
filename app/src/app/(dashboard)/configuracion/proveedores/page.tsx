"use client";

import Link from "next/link";
import { PackageX } from "lucide-react";

// Modulo Proveedores eliminado (14-sep-2026, pedido explicito de Javier:
// "elimina la tabla de proveedores" -- tabla sin uso). Se saco del menu de
// Configuracion en SPEC 2.34; aca se deja un mensaje en vez de redirigir en
// silencio, por si alguien entra por un link/favorito viejo. Mismo criterio
// que kit-epp cuando se movio de aca (redirect), salvo que aca no hay a
// donde redirigir -- el modulo simplemente ya no existe. Ver SPEC 2.35.
export default function ProveedoresEliminadoPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <PackageX className="h-12 w-12 text-gray-300 mb-4" />
      <h1 className="text-xl font-semibold text-gray-900">Proveedores fue eliminado</h1>
      <p className="text-gray-500 mt-2 max-w-md">
        Este módulo se eliminó porque no se estaba usando. Si llegaste por un enlace o favorito
        guardado, puedes volver a Configuración.
      </p>
      <Link
        href="/configuracion"
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Volver a Configuración
      </Link>
    </div>
  );
}
