"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Save, Loader2 } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";

// Nombre de cada campo en el resumen de errores.
const ETIQUETAS_EMPLEADO: Record<string, string> = {
  nombres: "Nombres",
  apellidoPaterno: "Apellido paterno",
  correoPersonal: "Correo personal",
  correoEmpresa: "Correo de empresa",
  rut: "RUT",
  sedeId: "Sede",
};

const empleadoFieldLabels: Record<string, string> = {
  rut: "RUT",
  nombres: "Nombres",
  apellidoPaterno: "Apellido Paterno",
  apellidoMaterno: "Apellido Materno",
  correoPersonal: "Correo Personal",
  correoEmpresa: "Correo Empresa",
  cargo: "Cargo",
  jefatura: "Jefatura",
  supervisor: "Supervisor",
  ubicacion: "Ubicación",
  tipoContrato: "Tipo de Contrato",
  estado: "Estado",
  fechaIngreso: "Fecha de Ingreso",
  fechaTermino: "Fecha de Término",
  telefonoContacto: "Teléfono de Contacto",
  sedeId: "Sede" };

type Sede = { id: string; nombre: string; codigo: string; activa: boolean };

type FormData = {
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  correoPersonal: string;
  correoEmpresa: string;
  cargo: string;
  jefatura: string;
  supervisor: string;
  ubicacion: string;
  tipoContrato: "contrato" | "boleta";
  estado: "activo" | "desvinculado" | "licencia";
  fechaIngreso: string;
  fechaTermino: string;
  telefonoContacto: string;
  sedeId: string;
};

export default function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const esAdmin = session?.user?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Validacion por campo, igual que en Onboarding; errorDe tambien marca los
  // errores por campo que devuelve el servidor (RUT o correo repetido, etc.).
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS_EMPLEADO);
  const errorDe = (campo: string) => errores[campo] ?? fieldErrors[campo];
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [formData, setFormData] = useState<FormData>({
    rut: "",
    nombres: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    correoPersonal: "",
    correoEmpresa: "",
    cargo: "",
    jefatura: "",
    supervisor: "",
    ubicacion: "",
    tipoContrato: "contrato",
    estado: "activo",
    fechaIngreso: "",
    fechaTermino: "",
    telefonoContacto: "",
    sedeId: "",
  });

  // La sede solo la puede reasignar admin (ver PUT /api/empleados/[id]);
  // el tecnico ni siquiera necesita ver el select.
  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/sedes?activas=true")
      .then((res) => res.json())
      .then((data) => setSedes(Array.isArray(data) ? data : []))
      .catch(() => setSedes([]));
  }, [esAdmin]);

  const fetchEmployee = useCallback(async () => {
    try {
      const res = await fetch(`/api/empleados/${id}`);
      if (!res.ok) {
        throw new Error("Empleado no encontrado");
      }
      const employee = await res.json();
      setFormData({
        rut: employee.rut || "",
        nombres: employee.nombres || "",
        apellidoPaterno: employee.apellidoPaterno || "",
        apellidoMaterno: employee.apellidoMaterno || "",
        correoPersonal: employee.correoPersonal || "",
        correoEmpresa: employee.correoEmpresa || "",
        cargo: employee.cargo || "",
        jefatura: employee.jefatura || "",
        supervisor: employee.supervisor || "",
        ubicacion: employee.ubicacion || "",
        tipoContrato: employee.tipoContrato || "contrato",
        estado: employee.estado || "activo",
        fechaIngreso: employee.fechaIngreso
          ? new Date(employee.fechaIngreso).toISOString().split("T")[0]
          : "",
        fechaTermino: employee.fechaTermino
          ? new Date(employee.fechaTermino).toISOString().split("T")[0]
          : "",
        telefonoContacto: employee.telefonoContacto || "",
        sedeId: employee.sedeId || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    limpiar(e.target.name);
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    if (!formData.nombres.trim()) faltan.nombres = "Escribe los nombres";
    if (!formData.apellidoPaterno.trim()) faltan.apellidoPaterno = "Escribe el apellido paterno";
    if (!formData.correoPersonal.trim()) faltan.correoPersonal = "Escribe el correo personal";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correoPersonal.trim()))
      faltan.correoPersonal = "El correo personal no es válido";
    if (formData.correoEmpresa && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correoEmpresa.trim()))
      faltan.correoEmpresa = "El correo de empresa no es válido";
    if (esAdmin && !formData.sedeId) faltan.sedeId = "Elige la sede";
    if (reportar(faltan)) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/empleados/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          apellidoMaterno: formData.apellidoMaterno || null,
          cargo: formData.cargo || null,
          jefatura: formData.jefatura || null,
          supervisor: formData.supervisor || null,
          ubicacion: formData.ubicacion || null,
          correoEmpresa: formData.correoEmpresa || null,
          fechaIngreso: formData.fechaIngreso || null,
          fechaTermino: formData.fechaTermino || null,
          telefonoContacto: formData.telefonoContacto || null,
          // El backend ignora este campo si quien edita no es admin. Para
          // admin es obligatorio (select sin opcion "Sin sede") -- ya no se
          // manda null a proposito, para no dejar empleados sin sede; el
          // spread de formData ya incluye sedeId con el valor real elegido.
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar empleado");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      router.push(`/empleados/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-fg-subtle">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref={`/empleados/${id}`}
        title="Editar Empleado"
        description={<>{formData.nombres} {formData.apellidoPaterno}</>}
      />

      {/* Form */}
      <form onSubmit={handleSubmit} className="card p-6" noValidate>
        <div className="mb-6 empty:hidden">
          <ResumenErrores mensaje={resumen} />
        </div>
        {error && (
          <div className="mb-6">
            <ApiErrorSummary error={error} fieldErrors={fieldErrors} fieldLabels={empleadoFieldLabels} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Datos Personales */}
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold text-fg mb-4 pb-2 border-b">
              Datos Personales
            </h2>
          </div>

          <div>
            <label className="field-label">
              RUT
            </label>
            <input
              type="text"
              name="rut"
              value={formData.rut}
              onChange={handleChange}
              className={claseCampo(errorDe("rut"))}
              aria-invalid={!!errorDe("rut")}
            />
            <MensajeCampo mensaje={errorDe("rut")} />
          </div>

          <div>
            <label className="field-label">
              Correo Personal <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="correoPersonal"
              value={formData.correoPersonal}
              onChange={handleChange}
              required
              className={claseCampo(errorDe("correoPersonal"))}
              aria-invalid={!!errorDe("correoPersonal")}
            />
            <MensajeCampo mensaje={errorDe("correoPersonal")} />
          </div>

          <div>
            <label className="field-label">
              Correo Empresa
            </label>
            <input
              type="email"
              name="correoEmpresa"
              value={formData.correoEmpresa}
              onChange={handleChange}
              className={claseCampo(errorDe("correoEmpresa"))}
              aria-invalid={!!errorDe("correoEmpresa")}
            />
            <MensajeCampo mensaje={errorDe("correoEmpresa")} />
          </div>

          <div>
            <label className="field-label">
              Nombres <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nombres"
              value={formData.nombres}
              onChange={handleChange}
              required
              className={claseCampo(errorDe("nombres"))}
              aria-invalid={!!errorDe("nombres")}
            />
            <MensajeCampo mensaje={errorDe("nombres")} />
          </div>

          <div>
            <label className="field-label">
              Apellido Paterno <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="apellidoPaterno"
              value={formData.apellidoPaterno}
              onChange={handleChange}
              required
              className={claseCampo(errorDe("apellidoPaterno"))}
              aria-invalid={!!errorDe("apellidoPaterno")}
            />
            <MensajeCampo mensaje={errorDe("apellidoPaterno")} />
          </div>

          <div>
            <label className="field-label">
              Apellido Materno
            </label>
            <input
              type="text"
              name="apellidoMaterno"
              value={formData.apellidoMaterno}
              onChange={handleChange}
              className={claseCampo(errorDe("apellidoMaterno"))}
              aria-invalid={!!errorDe("apellidoMaterno")}
            />
            <MensajeCampo mensaje={errorDe("apellidoMaterno")} />
          </div>

          <div>
            <label className="field-label">
              Teléfono de Contacto
            </label>
            <input
              type="tel"
              name="telefonoContacto"
              value={formData.telefonoContacto}
              onChange={handleChange}
              className={claseCampo(errorDe("telefonoContacto"))}
              aria-invalid={!!errorDe("telefonoContacto")}
            />
            <MensajeCampo mensaje={errorDe("telefonoContacto")} />
          </div>

          {/* Datos Laborales */}
          <div className="md:col-span-2 mt-4">
            <h2 className="text-lg font-semibold text-fg mb-4 pb-2 border-b">
              Datos Laborales
            </h2>
          </div>

          {/* "Desvinculado" no es una opcion elegible a mano -- ese estado lo
              pone unicamente una Solicitud de desvinculacion, que registra
              la devolucion de equipos y el motivo. Si el empleado ya esta
              desvinculado, el campo se muestra de solo lectura: de lo
              contrario, guardar cualquier otro cambio lo devolveria a
              "activo" sin que nadie lo pidiera. */}
          <div>
            <label className="field-label">
              Estado <span className="text-red-500">*</span>
            </label>
            {formData.estado === "desvinculado" ? (
              <>
                <input
                  type="text"
                  value="Desvinculado"
                  disabled
                  className="w-full px-4 py-2 border border-line rounded-lg bg-surface-muted text-fg-muted"
                />
                <p className="mt-1 text-xs text-fg-subtle">
                  Para reincorporarlo, crea una Solicitud de onboarding eligiéndolo como
                  empleado existente.
                </p>
              </>
            ) : (
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                required
                className="field-input"
              >
                <option value="activo">Activo</option>
                <option value="licencia">En Licencia</option>
              </select>
            )}
          </div>

          <div>
            <label className="field-label">
              Tipo de Contrato <span className="text-red-500">*</span>
            </label>
            <select
              name="tipoContrato"
              value={formData.tipoContrato}
              onChange={handleChange}
              required
              className={claseCampo(errorDe("tipoContrato"))}
              aria-invalid={!!errorDe("tipoContrato")}
            >
              <option value="contrato">Contrato</option>
              <option value="boleta">Boleta</option>
            </select>
            <MensajeCampo mensaje={errorDe("tipoContrato")} />
          </div>

          <div>
            <label className="field-label">
              Cargo
            </label>
            <input
              type="text"
              name="cargo"
              value={formData.cargo}
              onChange={handleChange}
              className={claseCampo(errorDe("cargo"))}
              aria-invalid={!!errorDe("cargo")}
            />
            <MensajeCampo mensaje={errorDe("cargo")} />
          </div>

          <div>
            <label className="field-label">
              Jefatura
            </label>
            <input
              type="text"
              name="jefatura"
              value={formData.jefatura}
              onChange={handleChange}
              className={claseCampo(errorDe("jefatura"))}
              aria-invalid={!!errorDe("jefatura")}
            />
            <MensajeCampo mensaje={errorDe("jefatura")} />
          </div>

          <div>
            <label className="field-label">
              Supervisor
            </label>
            <input
              type="text"
              name="supervisor"
              value={formData.supervisor}
              onChange={handleChange}
              className={claseCampo(errorDe("supervisor"))}
              aria-invalid={!!errorDe("supervisor")}
            />
            <MensajeCampo mensaje={errorDe("supervisor")} />
          </div>

          <div>
            <label className="field-label">
              Ubicación
            </label>
            <input
              type="text"
              name="ubicacion"
              value={formData.ubicacion}
              onChange={handleChange}
              className={claseCampo(errorDe("ubicacion"))}
              aria-invalid={!!errorDe("ubicacion")}
            />
            <MensajeCampo mensaje={errorDe("ubicacion")} />
          </div>

          <div>
            <label className="field-label">
              Fecha de Ingreso
            </label>
            <input
              type="date"
              name="fechaIngreso"
              value={formData.fechaIngreso}
              onChange={handleChange}
              className={claseCampo(errorDe("fechaIngreso"))}
              aria-invalid={!!errorDe("fechaIngreso")}
            />
            <MensajeCampo mensaje={errorDe("fechaIngreso")} />
          </div>

          <div>
            <label className="field-label">
              Fecha de Término
            </label>
            <input
              type="date"
              name="fechaTermino"
              value={formData.fechaTermino}
              onChange={handleChange}
              className={claseCampo(errorDe("fechaTermino"))}
              aria-invalid={!!errorDe("fechaTermino")}
            />
            <MensajeCampo mensaje={errorDe("fechaTermino")} />
          </div>

          {esAdmin && (
            <div>
              <label className="field-label">
                Sede <span className="text-red-500">*</span>
              </label>
              <select
                name="sedeId"
                value={formData.sedeId}
                onChange={handleChange}
                required
                /* Mover un empleado de sede es solo de admin: el PUT ya
                   ignora el sedeId que mande un tecnico, esto evita que
                   parezca editable. */
                disabled={!esAdmin}
                className={claseCampo(errorDe("sedeId"))}
              aria-invalid={!!errorDe("sedeId")}
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
            <MensajeCampo mensaje={errorDe("sedeId")} />
              <p className="mt-1 text-xs text-fg-subtle">
                Reasigna a qué sede pertenece este empleado (ej. si se traslada
                de Concepción a Santiago). Solo administradores pueden
                cambiarlo, y siempre debe quedar asignada a alguna.
              </p>
            </div>
          )}

        </div>

        {/* Actions */}
        <div className="mt-8 flex justify-end gap-4">
          <Link
            href={`/empleados/${id}`}
            className={buttonClasses({ variant: "outline", className: "px-6" })}
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className={buttonClasses({ className: "px-6" })}
          >
            {saving ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save size={20} />
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
