'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { XCircle, DollarSign } from 'lucide-react';
import { etiquetaEstadoActivo } from '@/modules/activos/estados';
import { parseApiError, type FieldErrors } from '@/shared/utilidades/apiErrors';
import { ApiErrorSummary } from '@/shared/ui/ApiErrorSummary';
import { PageHeader } from '@/shared/ui/PageHeader';
import {
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseInput,
} from '@/shared/ui/CampoFormulario';
import { buttonClasses } from '@/shared/ui/buttonStyles';
import { useErroresFormulario } from '@/shared/hooks/useErroresFormulario';

// Nombre de cada campo en el resumen de errores.
const ETIQUETAS_VENTA: Record<string, string> = {
  comprador: 'Comprador',
  monto: 'Monto',
  fechaVenta: 'Fecha de venta',
};
import { hoyISO } from '@/shared/utilidades/fechas';
import { identificadorActivo } from "@/modules/activos/identificador";

type Asset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  imei?: string | null;
  estado: string;
  categoria: { nombre: string };
};

export default function VentaActivoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [comprador, setComprador] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState('CLP');
  const [fechaVenta, setFechaVenta] = useState(hoyISO);
  // Validacion por campo, igual que en Onboarding; tambien marca los errores
  // por campo que devuelve el servidor.
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS_VENTA);
  const errorDe = (campo: string) => errores[campo] ?? fieldErrors[campo];

  useEffect(() => {
    fetch(`/api/activos/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setAsset(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Error al cargar el activo');
        setLoading(false);
      });
  }, [id]);

  const canSell = asset?.estado === 'baja';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    if (!comprador.trim()) faltan.comprador = 'Escribe el comprador';
    if (!monto || Number(monto) <= 0) faltan.monto = 'Escribe un monto mayor que 0';
    if (!fechaVenta) faltan.fechaVenta = 'Elige la fecha de venta';
    if (reportar(faltan)) return;
    setSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      const res = await fetch(`/api/activos/${id}/venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comprador,
          monto: parseFloat(monto),
          moneda,
          fechaVenta }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al registrar venta');
        setError(message);
        setFieldErrors(fe);
        return;
      }

      router.push(`/activos/${id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-fg-subtle">Cargando...</div>;
  if (!asset) return <div className="p-6 text-red-500">Activo no encontrado</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        backHref={`/activos/${id}`}
        title="Registrar Venta"
        description={<>{asset.marca} {asset.modelo} • {identificadorActivo(asset)}</>}
      />

      {!canSell && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="text-red-500" size={20} />
          <p className="text-red-700">
            El activo debe estar en estado &quot;Baja&quot; para vender. Estado actual: {etiquetaEstadoActivo(asset.estado)}
          </p>
        </div>
      )}

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Info activo */}
      <div className="bg-surface-muted rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-fg-subtle">Categoría:</span> <span className="font-medium">{asset.categoria.nombre}</span></div>
          <div><span className="text-fg-subtle">Estado:</span> <span className="font-medium">{etiquetaEstadoActivo(asset.estado)}</span></div>
          <div><span className="text-fg-subtle">Marca/Modelo:</span> <span className="font-medium">{asset.marca} {asset.modelo}</span></div>
          <div><span className="text-fg-subtle">{asset.numeroSerie || !asset.imei ? 'Serie:' : 'Identificación:'}</span> <span className="font-medium">{identificadorActivo(asset, '-')}</span></div>
        </div>
      </div>

      {canSell && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4" noValidate>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-emerald-600" size={24} />
            <h2 className="text-lg font-semibold">Datos de la Venta</h2>
          </div>

          <ResumenErrores mensaje={resumen} />

          <CampoTexto
            label="Comprador"
            obligatorio
            value={comprador}
            onChange={(v) => {
              setComprador(v);
              limpiar('comprador');
            }}
            error={errorDe('comprador')}
            placeholder="Nombre o razón social del comprador"
          />

          <div className="grid grid-cols-2 gap-4">
            <CampoTexto
              label="Monto"
              obligatorio
              type="number"
              min="1"
              value={monto}
              onChange={(v) => {
                setMonto(v);
                limpiar('monto');
              }}
              error={errorDe('monto')}
              placeholder="150000"
            />
            <CampoFormulario label="Moneda">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={claseInput()}>
                <option value="CLP">CLP (Pesos chilenos)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </CampoFormulario>
          </div>

          <CampoTexto
            label="Fecha de venta"
            obligatorio
            type="date"
            value={fechaVenta}
            onChange={(v) => {
              setFechaVenta(v);
              limpiar('fechaVenta');
            }}
            error={errorDe('fechaVenta')}
          />

          <div className="flex justify-between pt-4">
            <Link href={`/activos/${id}`} className={buttonClasses({ variant: 'outline' })}>
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className={buttonClasses({ className: 'bg-success hover:bg-success-hover disabled:hover:bg-success' })}
            >
              {submitting ? 'Procesando...' : 'Confirmar Venta'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
