"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ActivoForm,
  payloadActivo,
  valoresDesdeActivo,
  type ActivoFormValues,
} from "@/components/activos/ActivoForm";

export default function EditarActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [initialValues, setInitialValues] = useState<ActivoFormValues | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const res = await fetch(`/api/activos/${id}`);
        if (!res.ok) {
          const { message } = await parseApiError(res, "No se pudo cargar el activo");
          if (!cancelado) setError(message);
          return;
        }
        const asset = await res.json();
        if (!cancelado) setInitialValues(valoresDesdeActivo(asset));
      } catch (err) {
        console.error("Error fetching asset:", err);
        if (!cancelado) setError("No se pudo cargar el activo");
      } finally {
        if (!cancelado) setLoadingData(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [id]);

  async function guardar(values: ActivoFormValues) {
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/activos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadActivo(values, "editar")),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar activo");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      router.push(`/activos/${id}`);
    } catch (err) {
      console.error("Error updating asset:", err);
      setError(err instanceof Error ? err.message : "Error al actualizar activo");
    }
  }

  if (loadingData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/activos/${id}`}
        title="Editar Activo"
        description={
          initialValues
            ? `${initialValues.marca} ${initialValues.modelo} - ${initialValues.numeroSerie}`
            : undefined
        }
      />
      <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
      {initialValues && (
        <ActivoForm
          modo="editar"
          initialValues={initialValues}
          onSubmit={guardar}
          cancelHref={`/activos/${id}`}
        />
      )}
    </div>
  );
}
