"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Save,
  Shield,
  Loader2,
} from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { useToast } from "@/components/ui/Toast";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import {
  ETIQUETAS_PARAMETROS,
  LIMITES_SEGURIDAD,
  validarParametros,
} from "@/lib/validations/parametros";

// Reads/writes real settings via /api/configuracion/parametros (SystemConfig
// table). Only two sections are kept: Datos de la Empresa (reference data,
// not linked to reports/documents) and Seguridad (session duration, login
// attempts).

type ConfigSection = "empresa" | "seguridad";

type Parametros = {
  empresaNombre: string | null;
  empresaRut: string | null;
  empresaDireccion: string | null;
  empresaTelefono: string | null;
  empresaEmail: string | null;
  empresaSitioWeb: string | null;
  duracionSesionHoras: number;
  maxIntentosLogin: number;
  minutosBloqueoLogin: number;
  updatedAt: string | null;
  updatedPor: string | null;
};

const sections: { id: ConfigSection; title: string; description: string; icon: React.ElementType; color: string }[] = [
  {
    id: "empresa",
    title: "Datos de la Empresa",
    description: "Información general de la empresa (referencia -- no se usa en actas ni reportes)",
    icon: Building2,
    color: "bg-primary-100 text-primary-700",
  },
  {
    id: "seguridad",
    title: "Seguridad",
    description: "Duración de sesión e intentos de inicio de sesión",
    icon: Shield,
    color: "bg-red-100 text-red-600",
  },
];

export default function ParametrosPage() {
  const toast = useToast();
  const [activeSection, setActiveSection] = useState<ConfigSection>("empresa");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Validacion por campo, con las mismas reglas que el servidor (SPEC 2.102).
  const { errores, resumen, reportar, limpiar } =
    useErroresFormulario(ETIQUETAS_PARAMETROS);

  const [form, setForm] = useState<Parametros>({
    empresaNombre: "",
    empresaRut: "",
    empresaDireccion: "",
    empresaTelefono: "",
    empresaEmail: "",
    empresaSitioWeb: "",
    duracionSesionHoras: 24,
    maxIntentosLogin: 5,
    minutosBloqueoLogin: 15,
    updatedAt: null,
    updatedPor: null,
  });

  useEffect(() => {
    fetchParametros();
  }, []);

  async function fetchParametros() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracion/parametros");
      if (res.ok) {
        const data = await res.json();
        setForm({
          empresaNombre: data.empresaNombre ?? "",
          empresaRut: data.empresaRut ?? "",
          empresaDireccion: data.empresaDireccion ?? "",
          empresaTelefono: data.empresaTelefono ?? "",
          empresaEmail: data.empresaEmail ?? "",
          empresaSitioWeb: data.empresaSitioWeb ?? "",
          duracionSesionHoras: data.duracionSesionHoras,
          maxIntentosLogin: data.maxIntentosLogin,
          minutosBloqueoLogin: data.minutosBloqueoLogin,
          updatedAt: data.updatedAt,
          updatedPor: data.updatedPor,
        });
      }
    } catch (err) {
      console.error("Error fetching parametros:", err);
      setError("No se pudo cargar la configuración");
    } finally {
      setLoading(false);
    }
  }

  function cambiar<K extends keyof Parametros>(campo: K, valor: Parametros[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  }

  /** Marca los errores y abre la seccion donde esta el primero. */
  function mostrarErrores(e: Record<string, string>) {
    const [primero] = Object.keys(e);
    if (primero) setActiveSection(primero in LIMITES_SEGURIDAD ? "seguridad" : "empresa");
    return reportar(e);
  }

  async function handleSave() {
    if (mostrarErrores(validarParametros(form))) return;
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const res = await fetch("/api/configuracion/parametros", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al guardar la configuración");
        if (Object.keys(fe).length > 0) mostrarErrores(fe);
        else setError(message);
        return;
      }
      const data = await res.json();
      setForm((prev) => ({ ...prev, updatedAt: data.updatedAt, updatedPor: data.updatedPor }));
      toast.success("Configuración guardada exitosamente");
    } catch (err) {
      console.error("Error saving parametros:", err);
      setError("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parámetros Generales"
        description="Datos de la empresa y seguridad de acceso"
      />

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    active ? "bg-primary-50 text-primary-800" : "text-fg-muted hover:bg-surface-muted"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${section.color}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{section.title}</p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="card md:col-span-3 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-fg">
              {sections.find((s) => s.id === activeSection)?.title}
            </h2>
            <p className="text-sm text-fg-subtle">
              {sections.find((s) => s.id === activeSection)?.description}
            </p>
          </div>

          {activeSection === "empresa" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    <Building2 size={16} className="inline mr-1" />
                    Nombre de la Empresa
                  </label>
                  <input
                    type="text"
                    value={form.empresaNombre ?? ""}
                    onChange={(e) => setForm({ ...form, empresaNombre: e.target.value })}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">RUT Empresa</label>
                  <input
                    type="text"
                    value={form.empresaRut ?? ""}
                    onChange={(e) => cambiar("empresaRut", e.target.value)}
                    aria-invalid={!!errores.empresaRut}
                    className={claseCampo(errores.empresaRut)}
                  />
                  <MensajeCampo mensaje={errores.empresaRut} />
                </div>
                <div>
                  <label className="field-label">
                    <MapPin size={16} className="inline mr-1" />
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={form.empresaDireccion ?? ""}
                    onChange={(e) => setForm({ ...form, empresaDireccion: e.target.value })}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">
                    <Phone size={16} className="inline mr-1" />
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.empresaTelefono ?? ""}
                    onChange={(e) => setForm({ ...form, empresaTelefono: e.target.value })}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">
                    <Mail size={16} className="inline mr-1" />
                    Email de Contacto
                  </label>
                  <input
                    type="email"
                    value={form.empresaEmail ?? ""}
                    onChange={(e) => cambiar("empresaEmail", e.target.value)}
                    aria-invalid={!!errores.empresaEmail}
                    className={claseCampo(errores.empresaEmail)}
                  />
                  <MensajeCampo mensaje={errores.empresaEmail} />
                </div>
                <div>
                  <label className="field-label">Sitio Web</label>
                  <input
                    type="text"
                    value={form.empresaSitioWeb ?? ""}
                    onChange={(e) => setForm({ ...form, empresaSitioWeb: e.target.value })}
                    className="field-input"
                  />
                </div>
              </div>
              <p className="text-xs text-fg-subtle">
                Estos datos se guardan como referencia. No aparecen automáticamente en actas ni
                reportes -- las actas de entrega/devolución usan un logo fijo y no imprimen estos
                campos.
              </p>
            </div>
          )}

          {activeSection === "seguridad" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Duración de sesión (horas)
                  </label>
                  <input
                    type="number"
                    min={LIMITES_SEGURIDAD.duracionSesionHoras.min}
                    max={LIMITES_SEGURIDAD.duracionSesionHoras.max}
                    value={form.duracionSesionHoras}
                    onChange={(e) => cambiar("duracionSesionHoras", parseInt(e.target.value) || 1)}
                    aria-invalid={!!errores.duracionSesionHoras}
                    className={claseCampo(errores.duracionSesionHoras)}
                  />
                  <MensajeCampo mensaje={errores.duracionSesionHoras} />
                  <p className="text-xs text-fg-subtle mt-1">
                    Solo afecta sesiones nuevas (al iniciar sesión) y aplica después de reiniciar el
                    servidor -- no corta sesiones ya abiertas.
                  </p>
                </div>
                <div>
                  <label className="field-label">
                    Intentos máximos de inicio de sesión
                  </label>
                  <input
                    type="number"
                    min={LIMITES_SEGURIDAD.maxIntentosLogin.min}
                    max={LIMITES_SEGURIDAD.maxIntentosLogin.max}
                    value={form.maxIntentosLogin}
                    onChange={(e) => cambiar("maxIntentosLogin", parseInt(e.target.value) || 1)}
                    aria-invalid={!!errores.maxIntentosLogin}
                    className={claseCampo(errores.maxIntentosLogin)}
                  />
                  <MensajeCampo mensaje={errores.maxIntentosLogin} />
                </div>
                <div>
                  <label className="field-label">
                    Minutos de bloqueo tras exceder intentos
                  </label>
                  <input
                    type="number"
                    min={LIMITES_SEGURIDAD.minutosBloqueoLogin.min}
                    max={LIMITES_SEGURIDAD.minutosBloqueoLogin.max}
                    value={form.minutosBloqueoLogin}
                    onChange={(e) => cambiar("minutosBloqueoLogin", parseInt(e.target.value) || 1)}
                    aria-invalid={!!errores.minutosBloqueoLogin}
                    className={claseCampo(errores.minutosBloqueoLogin)}
                  />
                  <MensajeCampo mensaje={errores.minutosBloqueoLogin} />
                  <p className="text-xs text-fg-subtle mt-1">
                    Estos dos aplican de inmediato al siguiente intento de inicio de sesión.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t flex items-center justify-between">
            {form.updatedAt ? (
              <p className="text-xs text-fg-subtle">
                Última actualización: {new Date(form.updatedAt).toLocaleString("es-CL")}
                {form.updatedPor ? ` por ${form.updatedPor}` : ""}
              </p>
            ) : (
              <span />
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className={buttonClasses()}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
