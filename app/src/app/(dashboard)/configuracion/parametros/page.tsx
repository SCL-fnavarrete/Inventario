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

// Reescrito por completo (14-sep-2026, pedido explicito de Javier al
// revisar que le faltaba al modulo Configuracion): la version anterior era
// 100% decorativa -- datos de ejemplo hardcodeados ("SLC Consultores", RUT
// con X) y el boton Guardar solo simulaba un delay de 1 segundo sin
// persistir nada. Ahora lee/escribe de verdad contra
// /api/configuracion/parametros (tabla SystemConfig).
//
// Se recortaron las secciones "Notificaciones", "Mantenciones", "Documentos"
// y "Sistema" que tenia la version vieja -- eran decorativas tambien y
// Javier confirmo que solo quiere Datos de la Empresa (guardados como
// referencia, sin conectar a las actas/reportes) y Seguridad (duracion de
// sesion, intentos de login).

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
    color: "bg-blue-100 text-blue-600",
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
  const [activeSection, setActiveSection] = useState<ConfigSection>("empresa");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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

  async function handleSave() {
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
        setError(message);
        setFieldErrors(fe);
        return;
      }
      const data = await res.json();
      setForm((prev) => ({ ...prev, updatedAt: data.updatedAt, updatedPor: data.updatedPor }));
      setSuccess("Configuración guardada exitosamente");
      setTimeout(() => setSuccess(""), 3000);
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
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parámetros Generales</h1>
        <p className="text-gray-600 mt-1">Datos de la empresa y seguridad de acceso</p>
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

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
                    active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
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

        <div className="md:col-span-3 bg-white rounded-lg shadow p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {sections.find((s) => s.id === activeSection)?.title}
            </h2>
            <p className="text-sm text-gray-500">
              {sections.find((s) => s.id === activeSection)?.description}
            </p>
          </div>

          {activeSection === "empresa" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 size={16} className="inline mr-1" />
                    Nombre de la Empresa
                  </label>
                  <input
                    type="text"
                    value={form.empresaNombre ?? ""}
                    onChange={(e) => setForm({ ...form, empresaNombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RUT Empresa</label>
                  <input
                    type="text"
                    value={form.empresaRut ?? ""}
                    onChange={(e) => setForm({ ...form, empresaRut: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MapPin size={16} className="inline mr-1" />
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={form.empresaDireccion ?? ""}
                    onChange={(e) => setForm({ ...form, empresaDireccion: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone size={16} className="inline mr-1" />
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.empresaTelefono ?? ""}
                    onChange={(e) => setForm({ ...form, empresaTelefono: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail size={16} className="inline mr-1" />
                    Email de Contacto
                  </label>
                  <input
                    type="email"
                    value={form.empresaEmail ?? ""}
                    onChange={(e) => setForm({ ...form, empresaEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sitio Web</label>
                  <input
                    type="text"
                    value={form.empresaSitioWeb ?? ""}
                    onChange={(e) => setForm({ ...form, empresaSitioWeb: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duración de sesión (horas)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={form.duracionSesionHoras}
                    onChange={(e) =>
                      setForm({ ...form, duracionSesionHoras: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Solo afecta sesiones nuevas (al iniciar sesión) y aplica después de reiniciar el
                    servidor -- no corta sesiones ya abiertas.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intentos máximos de login
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxIntentosLogin}
                    onChange={(e) =>
                      setForm({ ...form, maxIntentosLogin: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minutos de bloqueo tras exceder intentos
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.minutosBloqueoLogin}
                    onChange={(e) =>
                      setForm({ ...form, minutosBloqueoLogin: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Estos dos aplican de inmediato al siguiente intento de login.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t flex items-center justify-between">
            {form.updatedAt ? (
              <p className="text-xs text-gray-500">
                Última actualización: {new Date(form.updatedAt).toLocaleString("es-CL")}
                {form.updatedPor ? ` por ${form.updatedPor}` : ""}
              </p>
            ) : (
              <span />
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
