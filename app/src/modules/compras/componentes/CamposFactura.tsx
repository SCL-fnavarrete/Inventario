"use client";

import { CampoFormulario, CampoTexto, claseCampo } from "@/shared/ui/CampoFormulario";

export type DatosFactura = {
  sedeId: string;
  numeroFactura: string;
  fechaFactura: string;
  rutProveedor: string;
  ordenCompra: string;
};

/**
 * Los datos de la factura de una compra, iguales en Nueva compra y en
 * Editar compra (SPEC 2.103). Antes cada pantalla tenia su copia. Las reglas
 * estan en validarDatosFactura (modules/compras/validaciones.ts).
 */
export function CamposFactura({
  valores,
  errores,
  onChange,
  sedes,
  puedeElegirSede,
  ayudaSede,
}: {
  valores: DatosFactura;
  errores: Record<string, string>;
  onChange: (campo: keyof DatosFactura, valor: string) => void;
  sedes: { id: string; nombre: string }[];
  /** Quien puede editar la compra elige o cambia su sede. */
  puedeElegirSede: boolean;
  ayudaSede: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CampoFormulario
        label="Sede de llegada"
        obligatorio
        error={errores.sedeId}
        ayuda={ayudaSede}
        className="md:col-span-2"
      >
        <select
          value={valores.sedeId}
          onChange={(e) => onChange("sedeId", e.target.value)}
          disabled={!puedeElegirSede}
          aria-invalid={!!errores.sedeId}
          className={claseCampo(errores.sedeId)}
        >
          <option value="" disabled>
            Selecciona una sede...
          </option>
          {sedes.map((sede) => (
            <option key={sede.id} value={sede.id}>
              {sede.nombre}
            </option>
          ))}
        </select>
      </CampoFormulario>
      <CampoTexto
        label="N° Factura"
        obligatorio
        value={valores.numeroFactura}
        onChange={(v) => onChange("numeroFactura", v)}
        error={errores.numeroFactura}
        placeholder="Ej: F-00123456"
      />
      <CampoTexto
        label="Fecha de la factura"
        obligatorio
        type="date"
        value={valores.fechaFactura}
        onChange={(v) => onChange("fechaFactura", v)}
        error={errores.fechaFactura}
      />
      <CampoTexto
        label="RUT del proveedor"
        value={valores.rutProveedor}
        onChange={(v) => onChange("rutProveedor", v)}
        error={errores.rutProveedor}
        placeholder="Ej: 76.123.456-7"
      />
      <CampoTexto
        label="Orden de compra"
        value={valores.ordenCompra}
        onChange={(v) => onChange("ordenCompra", v)}
        placeholder="Ej: OC-2024-001"
      />
    </div>
  );
}
