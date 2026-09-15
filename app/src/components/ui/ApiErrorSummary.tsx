"use client";

import { AlertCircle } from "lucide-react";
import type { FieldErrors } from "@/lib/utils/apiErrors";

/**
 * Cartel de error de formulario (14-sep-2026, SPEC 2.37). Reemplaza el
 * mensaje generico ("Datos invalidos") que tenian casi todos los
 * formularios: si hay errores por campo (`fieldErrors`), los lista uno por
 * uno con su nombre legible; si no, muestra el mensaje general tal cual.
 *
 * `fieldLabels` es opcional -- mapea el nombre tecnico del campo (ej.
 * "rut", "categoriaId") a como se le llama en el formulario (ej. "RUT",
 * "Categoría"). Lo que pase cada formulario se suma al diccionario base de
 * abajo, que cubre los campos que se repiten en todo el sistema.
 *
 * 15-sep-2026 (QA funcional, SPEC 2.38): antes ningun formulario pasaba
 * `fieldLabels`, asi que el cartel mostraba el nombre interno del campo
 * ("marca: Maximo 50 caracteres"). El diccionario base evita tener que
 * repetir lo mismo en los ~22 formularios.
 */

/**
 * Nombre legible de los campos que aparecen en mas de un formulario. Un
 * formulario puede pisar cualquiera de estos pasando su propio
 * `fieldLabels`.
 */
const ETIQUETAS_BASE: Record<string, string> = {
  // Activos
  categoriaId: "Categoría",
  marca: "Marca",
  modelo: "Modelo",
  numeroSerie: "Número de serie",
  imei: "IMEI",
  estado: "Estado",
  condicion: "Condición",
  fechaCompra: "Fecha de compra",
  fechaGarantiaFin: "Fin de garantía",
  fechaVenta: "Fecha de venta",
  observaciones: "Observaciones",
  incidencia: "Incidencia",
  sedeId: "Sede",
  // Empleados
  rut: "RUT",
  nombres: "Nombres",
  apellidoPaterno: "Apellido paterno",
  apellidoMaterno: "Apellido materno",
  correoPersonal: "Correo personal",
  correoEmpresa: "Correo de empresa",
  cargo: "Cargo",
  jefatura: "Jefatura",
  supervisor: "Supervisor",
  ubicacion: "Ubicación",
  tipoContrato: "Tipo de contrato",
  fechaIngreso: "Fecha de ingreso",
  fechaTermino: "Fecha de término",
  telefonoContacto: "Teléfono de contacto",
  // Compras
  numeroFactura: "N° de factura",
  fechaFactura: "Fecha de factura",
  rutProveedor: "RUT del proveedor",
  ordenCompra: "Orden de compra",
  cantidad: "Cantidad",
  itemId: "Artículo",
  // Asignaciones / devoluciones
  assetId: "Activo",
  employeeId: "Empleado",
  fechaEntrega: "Fecha de entrega",
  fechaDevolucion: "Fecha de devolución",
  motivo: "Motivo",
  // Usuarios
  nombre: "Nombre",
  email: "Email",
  password: "Contraseña",
  rol: "Rol",
};

/**
 * Busca la etiqueta de un campo. Zod devuelve rutas anidadas para arreglos
 * ("kitItems.0.cantidad"), asi que si la ruta completa no esta en el
 * diccionario se prueba con el ultimo tramo que no sea un indice.
 */
function etiquetaDe(campo: string, labels: Record<string, string>): string {
  if (labels[campo]) return labels[campo];
  const tramos = campo.split(".").filter((t) => !/^\d+$/.test(t));
  const ultimo = tramos[tramos.length - 1];
  return (ultimo && labels[ultimo]) || campo;
}
export function ApiErrorSummary({
  error,
  fieldErrors,
  fieldLabels = {},
}: {
  error: string | null;
  fieldErrors?: FieldErrors;
  fieldLabels?: Record<string, string>;
}) {
  if (!error) return null;

  const etiquetas = { ...ETIQUETAS_BASE, ...fieldLabels };
  const entries = Object.entries(fieldErrors || {});

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
      {entries.length > 0 ? (
        <div>
          <p className="font-medium text-red-700 mb-1">{error}</p>
          <ul className="list-disc list-inside space-y-0.5 text-sm text-red-700">
            {entries.map(([field, msg]) => (
              <li key={field}>
                <span className="font-medium">{etiquetaDe(field, etiquetas)}:</span> {msg}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-red-700">{error}</p>
      )}
    </div>
  );
}

/**
 * Mensaje bajo un campo individual, para cuando conviene marcar el error
 * justo al lado del input además de listarlo en el resumen de arriba (ej.
 * en formularios largos). Uso: `<FieldError message={fieldErrors.rut} />`
 * debajo del input, y agregar `fieldErrors.rut && "border-red-500"` a su
 * className.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}
