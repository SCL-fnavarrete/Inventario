"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { useToast } from "@/shared/ui/Toast";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { AvisoSeccion, CampoTexto, ResumenErrores } from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { formatearFechaHoraCorta } from "@/shared/utilidades/fechas";
import {
  ETIQUETAS_PARAMETROS,
  LIMITES_SEGURIDAD,
  SEGURIDAD_POR_DEFECTO,
  validarParametros,
  type CampoSeguridad,
} from "@/modules/configuracion";

// Configuracion > Seguridad (SPEC 2.112): duracion de la sesion y bloqueo por
// intentos fallidos, por cuenta y por equipo (2.112.6). Se guarda en SystemConfig (fila unica). Antes esta pagina
// tambien tenia "Datos de la empresa", que no se usaban en ninguna parte.

type Campo = CampoSeguridad;

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
  {
    campo: "maxIntentosIp",
    ayuda: "Intentos fallidos desde un mismo equipo, con cualquier correo, antes de bloquear ese equipo. Frena a quien prueba muchos correos. Una oficina comparte la misma dirección: no lo dejes muy bajo.",
  },
  {
    campo: "minutosBloqueoIp",
    ayuda: "Cuánto dura el bloqueo del equipo.",
  },
];

export default function SeguridadPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS_PARAMETROS);
  const [form, setForm] = useState<Record<Campo, string>>(
    () => Object.fromEntries(CAMPOS.map(({ campo }) => [campo, String(SEGURIDAD_POR_DEFECTO[campo])])) as Record<Campo, string>
  );
  const [ultimo, setUltimo] = useState<{ updatedAt: string | null; updatedPor: string | null }>({
    updatedAt: null,
    updatedPor: null,
  });

  useEffect(() => {
    fetch("/api/configuracion/parametros")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setForm(Object.fromEntries(CAMPOS.map(({ campo }) => [campo, String(data[campo])])) as Record<Campo, string>);
        setUltimo({ updatedAt: data.updatedAt, updatedPor: data.updatedPor });
      })
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  async function guardar() {
    const valores = Object.fromEntries(CAMPOS.map(({ campo }) => [campo, Number(form[campo])])) as Record<Campo, number>;
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
        description="Duración de la sesión y bloqueo por intentos fallidos, por cuenta y por equipo"
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
