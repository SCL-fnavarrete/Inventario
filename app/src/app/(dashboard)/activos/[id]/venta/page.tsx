'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, XCircle, DollarSign } from 'lucide-react';
import { parseApiError, type FieldErrors } from '@/lib/utils/apiErrors';
import { ApiErrorSummary } from '@/components/ui/ApiErrorSummary';

type Asset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
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
  const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().split('T')[0]);

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
          fechaVenta,
        }),
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

  if (loading) return <div className="p-6 text-gray-500">Cargando...</div>;
  if (!asset) return <div className="p-6 text-red-500">Activo no encontrado</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/activos/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrar Venta</h1>
          <p className="text-gray-600">{asset.marca} {asset.modelo} • {asset.numeroSerie}</p>
        </div>
      </div>

      {!canSell && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="text-red-500" size={20} />
          <p className="text-red-700">
            El activo debe estar en estado &quot;Baja&quot; para vender. Estado actual: {asset.estado}
          </p>
        </div>
      )}

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Info activo */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Categoría:</span> <span className="font-medium">{asset.categoria.nombre}</span></div>
          <div><span className="text-gray-500">Estado:</span> <span className="font-medium">{asset.estado}</span></div>
          <div><span className="text-gray-500">Marca/Modelo:</span> <span className="font-medium">{asset.marca} {asset.modelo}</span></div>
          <div><span className="text-gray-500">Serie:</span> <span className="font-medium">{asset.numeroSerie || '-'}</span></div>
        </div>
      </div>

      {canSell && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-emerald-600" size={24} />
            <h2 className="text-lg font-semibold">Datos de la Venta</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprador *</label>
            <input
              type="text"
              value={comprador}
              onChange={(e) => setComprador(e.target.value)}
              className="w-full border rounded-lg p-3 text-sm"
              placeholder="Nombre o razón social del comprador"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
              <input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full border rounded-lg p-3 text-sm"
                placeholder="150000"
                min="1"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full border rounded-lg p-3 text-sm"
              >
                <option value="CLP">CLP (Pesos chilenos)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de venta *</label>
            <input
              type="date"
              value={fechaVenta}
              onChange={(e) => setFechaVenta(e.target.value)}
              className="w-full border rounded-lg p-3 text-sm"
              required
            />
          </div>

          <div className="flex justify-between pt-4">
            <Link href={`/activos/${id}`} className="px-4 py-2 text-gray-600 hover:text-gray-800">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={!comprador || !monto || !fechaVenta || submitting}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Procesando...' : 'Confirmar Venta'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
