"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { parseApiError } from "@/lib/utils/apiErrors";
import { useToast } from "@/components/ui/Toast";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { AvisoSeccion, CampoTexto, ResumenErrores } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { formatearFechaHoraCorta } from "@/lib/utils/fechas";
import { ETIQUETAS_PARAMETROS, LIMITES_SEGURIDAD, validarParametros } from "@/lib/validations/parametros";

// Configuracion > Seguridad (SPEC 2.112): duracion de la sesion e intentos de
// inicio de sesion. Se guarda en SystemConfig (fila unica). Antes esta pagina
// tambien tenia "Datos de la empresa", que no se usaban en ninguna parte.

type Seguridad = {
  duracionSesionHoras: number;
  maxIntentosLogin: number;
  minutosBloqueoLogin: number;
};

type Campo = keyof Seguridad;

const CAMPOS: { campo: Campo; ayuda: string }[] = [
  {
    campo: "duracionSesionHoras",
    ayuda: "Cuánto dura una sesión antes de pedir iniciar sesión de nuevo. Aplica a las sesiones que se inicien desde que se guarda; las ya abiertas mantienen la duración con que empezaron.",
  },
  {
    campo: "maxIntentosLogin",
    ayuda: "Intentos fallidos seguidos antes de bloquear el inicio de sesión de esa cuenta.",
  },
  {
    campo: "minutosBloqueoLogin",
    ayuda: "Cuánto dura el bloqueo después de superar los intentos.",
  },
];

export default function SeguridadPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS_PARAMETROS);
  const [form, setForm] = useState<Record<Campo, string>>({
    duracionSesionHoras: "24",
    maxIntentosLogin: "5",
    minutosBloqueoLogin: "15",
  });
  const [ultimo, setUltimo] = useState<{ updatedAt: string | null; updatedPor: string | null }>({
    updatedAt: null,
    updatedPor: null,
  });

  useEffect(() => {
    fetch("/api/configuracion/parametros")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setForm({
          duracionSesionHoras: String(data.duracionSesionHoras),
          maxIntentosLogin: String(data.maxIntentosLogin),
          minutosBloqueoLogin: String(data.minutosBloqueoLogin),
        });
        setUltimo({ updatedAt: data.updatedAt, updatedPor: data.updatedPor });
      })
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  async function guardar() {
    const valores: Seguridad = {
      duracionSesionHoras: Number(form.duracionSesionHoras),
      maxIntentosLogin: Number(form.maxIntentosLogin),
      minutosBloqueoLogin: Number(form.minutosBloqueoLogin),
    };
    if (reportar(validarParametros(valores))) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/configuracion/parametros", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, "Error al guardar la configuración");
        if (!reportarServidor(fieldErrors)) setError(message);
        return;
      }
      const data = await res.json();
      setUltimo({ updatedAt: data.updatedAt, updatedPor: data.updatedPor });
      toast.success("Configuración guardada");
    } catch {
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
        backHref="/configuracion"
        title="Seguridad"
        description="Duración de la sesión e intentos de inicio de sesión"
      />

      <ResumenErrores mensaje={resumen} />
      <AvisoSeccion mensaje={error || undefined} />

      <div className="card p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CAMPOS.map(({ campo, ayuda }) => (
            <CampoTexto
              key={campo}
              label={LIMITES_SEGURIDAD[campo].etiqueta}
              type="number"
              min={LIMITES_SEGURIDAD[campo].min}
              max={LIMITES_SEGURIDAD[campo].max}
              value={form[campo]}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, [campo]: v }));
                limpiar(campo);
              }}
              error={errores[campo]}
              ayuda={ayuda}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">
            {ultimo.updatedAt
              ? `Última actualización: ${formatearFechaHoraCorta(ultimo.updatedAt, "-")}${ultimo.updatedPor ? ` por ${ultimo.updatedPor}` : ""}`
              : "Se usan los valores por defecto."}
          </p>
          <button onClick={guardar} disabled={saving} className={buttonClasses()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
