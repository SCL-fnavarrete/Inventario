"use client";

import Link from "next/link";
import { PackageX } from "lucide-react";

// Proveedores was removed (unused table). This page shows a message
// instead of redirecting silently, for anyone arriving via an old link.
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
