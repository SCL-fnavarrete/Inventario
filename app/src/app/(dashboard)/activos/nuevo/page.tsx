"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseApiError, type FieldErrors } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { PageHeader } from "@/shared/ui/PageHeader";
import { ActivoForm, payloadActivo, type ActivoFormValues } from "@/modules/activos/componentes/ActivoForm";

export default function NuevoActivoPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function crear(values: ActivoFormValues) {
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/activos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadActivo(values, "crear")),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear activo");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      router.push("/activos");
    } catch (err) {
      console.error("Error creating asset:", err);
      setError(err instanceof Error ? err.message : "Error al crear activo");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/activos"
        title="Nuevo Activo"
        description="Registrar un nuevo equipo o dispositivo"
      />
      <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
      <ActivoForm modo="crear" onSubmit={crear} cancelHref="/activos" erroresServidor={fieldErrors} />
    </div>
  );
}
