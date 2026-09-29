"use client";

import { CampoFormulario, CampoTexto, claseInput } from "@/shared/ui/CampoFormulario";
import type { NEW_EMPLOYEE_INITIAL } from "@/modules/solicitudes/componentes/nueva/datos";

export type EmpleadoNuevo = typeof NEW_EMPLOYEE_INITIAL;

/**
 * Datos del empleado nuevo en un onboarding (auditoria 28-sep-2026, 3.6).
 * Se saco de Nueva Solicitud sin cambiar los campos; las filas pasan a una
 * sola columna en el celular (antes quedaban muy angostas).
 */
export function FormEmpleadoNuevo({
  valor,
  onCambiar,
  errores,
  fechaIngreso,
  onFechaIngreso,
}: {
  valor: EmpleadoNuevo;
  onCambiar: (campo: keyof EmpleadoNuevo, v: string) => void;
  errores: Record<string, string>;
  fechaIngreso: string;
  onFechaIngreso: (v: string) => void;
}) {
  // Campo de texto del empleado: valor, error y cambio salen del nombre.
  const campo = (
    nombre: keyof EmpleadoNuevo,
    label: string,
    extra: { obligatorio?: boolean; type?: string; placeholder?: string } = {}
  ) => (
    <CampoTexto
      label={label}
      error={errores[nombre]}
      value={valor[nombre]}
      onChange={(v) => onCambiar(nombre, v)}
      {...extra}
    />
  );
  const obligatorio = { obligatorio: true };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campo("nombres", "Nombres", obligatorio)}
        {campo("apellidoPaterno", "Apellido Paterno", obligatorio)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campo("apellidoMaterno", "Apellido Materno", obligatorio)}
        {campo("rut", "RUT", { obligatorio: true, placeholder: "12.345.678-9" })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campo("correoPersonal", "Correo Personal", {
          obligatorio: true,
          type: "email",
          placeholder: "nombre.personal@gmail.com",
        })}
        {campo("correoEmpresa", "Correo Empresa", {
          type: "email",
          placeholder: "nombre@sclconsultores.com (opcional)",
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {campo("cargo", "Cargo", obligatorio)}
        <CampoFormulario label="Tipo Contrato" obligatorio>
          <select
            value={valor.tipoContrato}
            onChange={(e) => onCambiar("tipoContrato", e.target.value)}
            className={claseInput()}
          >
            <option value="contrato">Contrato</option>
            <option value="boleta">Boleta</option>
          </select>
        </CampoFormulario>
        <CampoTexto
          label="Fecha de Ingreso"
          obligatorio
          type="date"
          error={errores.fechaIngreso}
          value={fechaIngreso}
          onChange={onFechaIngreso}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {campo("division", "División", { placeholder: "Ej: SCL" })}
        {campo("area", "Área", { placeholder: "Ej: RPA y Soporte IT" })}
        {campo("subArea", "Sub-Área", { placeholder: "Ej: RPA" })}
      </div>
      {campo("supervisor", "Supervisor", { obligatorio: true, placeholder: "Nombre del supervisor directo" })}
      {campo("telefonoContacto", "Celular Contacto", { obligatorio: true, placeholder: "+56 9 1234 5678" })}
      {campo("direccionParticular", "Dirección Particular", {
        obligatorio: true,
        placeholder: "Incluir comuna y región",
      })}
      {campo("listasDistribucion", "Listas de Distribución", { placeholder: "Ej: SCL Masivo, Corporativo..." })}
    </div>
  );
}
