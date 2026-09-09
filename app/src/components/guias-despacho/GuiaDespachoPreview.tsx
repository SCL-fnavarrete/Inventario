"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  Laptop,
  Smartphone,
  Monitor,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: string;
  modelo: string;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  estado: string;
  condicion: string;
  categoria: {
    id: string;
    nombre: string;
  };
};

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correoPersonal: string;
  cargo: string | null;
  ubicacion: string | null;
};

interface DispatchData {
  origen: string;
  destino: string;
  tipoDespacho: string;
  despachadoPor: string;
  fechaDespacho: string;
  observaciones: string;
}

interface ManualRecipient {
  nombre: string;
  rut: string;
}

interface GuiaDespachoPreviewProps {
  numero?: string;
  assets: Asset[];
  dispatchData: DispatchData;
  useEmployee: boolean;
  selectedEmployee: Employee | null;
  manualRecipient: ManualRecipient;
  copyType?: "original" | "copia";
}

const TIPO_DESPACHO_LABELS: Record<string, string> = {
  asignacion: "Asignación",
  traslado: "Traslado",
  prestamo: "Préstamo",
};

const CONDICION_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  danado: "Dañado",
};

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-4 w-4" />;
    case "celular":
      return <Smartphone className="h-4 w-4" />;
    case "monitor":
      return <Monitor className="h-4 w-4" />;
    default:
      return <Package className="h-4 w-4" />;
  }
}

export function GuiaDespachoPreview({
  numero = "GD-XXXX-XXXXX",
  assets,
  dispatchData,
  useEmployee,
  selectedEmployee,
  manualRecipient,
  copyType = "original",
}: GuiaDespachoPreviewProps) {
  const fechaFormateada = dispatchData.fechaDespacho
    ? new Date(dispatchData.fechaDespacho).toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sin fecha";

  const destinatarioNombre = useEmployee && selectedEmployee
    ? `${selectedEmployee.nombres} ${selectedEmployee.apellidoPaterno} ${selectedEmployee.apellidoMaterno || ""}`
    : manualRecipient.nombre || "No especificado";

  const destinatarioRut = useEmployee && selectedEmployee
    ? selectedEmployee.rut
    : manualRecipient.rut || "-";

  const destinatarioCargo = useEmployee && selectedEmployee
    ? selectedEmployee.cargo || "-"
    : "-";

  const destinatarioUbicacion = useEmployee && selectedEmployee
    ? selectedEmployee.ubicacion || "-"
    : "-";

  const qrValue = `GUIA:${numero}|FECHA:${fechaFormateada}`;

  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">GUÍA DE DESPACHO</h1>
            <p className="text-blue-200 text-sm mt-1">Sistema Inventario IT</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-mono font-bold">{numero}</p>
            <span
              className={cn(
                "inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded",
                copyType === "original"
                  ? "bg-yellow-400 text-yellow-900"
                  : "bg-blue-300 text-blue-900"
              )}
            >
              {copyType === "original" ? "ORIGINAL" : "COPIA DESTINATARIO"}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* QR Code y Datos del Despacho */}
        <div className="flex gap-4">
          {/* QR Code */}
          <div className="flex-shrink-0 p-2 border border-gray-200 rounded-lg bg-white">
            <QRCodeSVG value={qrValue} size={80} level="M" />
          </div>

          {/* Datos del Despacho */}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Origen:</span>
              <p className="font-medium">{dispatchData.origen || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500">Destino:</span>
              <p className="font-medium">{dispatchData.destino || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500">Tipo:</span>
              <p className="font-medium">
                {TIPO_DESPACHO_LABELS[dispatchData.tipoDespacho] || dispatchData.tipoDespacho}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Despachado por:</span>
              <p className="font-medium">{dispatchData.despachadoPor || "-"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500">Fecha:</span>
              <p className="font-medium">{fechaFormateada}</p>
            </div>
          </div>
        </div>

        {/* Datos del Destinatario */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
            DATOS DEL DESTINATARIO
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <span className="text-gray-500">Nombre:</span>
              <p className="font-medium">{destinatarioNombre}</p>
            </div>
            <div>
              <span className="text-gray-500">RUT:</span>
              <p className="font-medium">{destinatarioRut}</p>
            </div>
            <div>
              <span className="text-gray-500">Cargo:</span>
              <p className="font-medium">{destinatarioCargo}</p>
            </div>
            <div>
              <span className="text-gray-500">Ubicación:</span>
              <p className="font-medium">{destinatarioUbicacion}</p>
            </div>
          </div>
        </div>

        {/* Detalle de Equipos */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            DETALLE DE EQUIPOS ({assets.length})
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">N°</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Tipo</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Marca/Modelo</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Serie</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">IMEI/Tel</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assets.map((asset, index) => {
                  const categoria = asset.categoria.nombre.toLowerCase();
                  return (
                    <tr key={asset.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 text-gray-600">{index + 1}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          {getCategoryIcon(asset.categoria.nombre)}
                          <span>{asset.categoria.nombre}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div>
                          <p className="font-medium">{asset.marca} {asset.modelo}</p>
                          {categoria === "notebook" && asset.procesador && (
                            <p className="text-xs text-gray-500">
                              {asset.procesador} | {asset.ram} | {asset.discoDuro}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {asset.numeroSerie || "-"}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {categoria === "celular" ? (
                          <div>
                            {asset.numeroTelefono && <p>{asset.numeroTelefono}</p>}
                            {asset.imei && <p className="text-gray-500">{asset.imei}</p>}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 text-xs font-medium rounded",
                            asset.condicion === "nuevo"
                              ? "bg-green-100 text-green-800"
                              : asset.condicion === "usado"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          )}
                        >
                          {CONDICION_LABELS[asset.condicion] || asset.condicion}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Observaciones */}
        {dispatchData.observaciones && (
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <h4 className="text-sm font-semibold text-yellow-800 mb-1">OBSERVACIONES</h4>
            <p className="text-sm text-yellow-900">{dispatchData.observaciones}</p>
          </div>
        )}

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-200">
          <div className="text-center">
            <div className="h-16 border-b-2 border-gray-400 mb-2"></div>
            <p className="text-sm font-medium">Entregado por</p>
            <p className="text-xs text-gray-500">Nombre: _________________</p>
            <p className="text-xs text-gray-500">RUT: ___________________</p>
          </div>
          <div className="text-center">
            <div className="h-16 border-b-2 border-gray-400 mb-2"></div>
            <p className="text-sm font-medium">Recibido por</p>
            <p className="text-xs text-gray-500">Nombre: _________________</p>
            <p className="text-xs text-gray-500">RUT: ___________________</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
          <p>Declaro recibir los equipos detallados en las condiciones indicadas.</p>
          <p className="mt-1">
            Sistema Inventario IT | Generado: {new Date().toLocaleString("es-CL")}
          </p>
        </div>
      </div>
    </div>
  );
}
