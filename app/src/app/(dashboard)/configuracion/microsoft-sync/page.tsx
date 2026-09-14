'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Cloud,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Users,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
} from 'lucide-react';
import { parseApiError, type FieldErrors } from '@/lib/utils/apiErrors';
import { ApiErrorSummary } from '@/components/ui/ApiErrorSummary';

interface SyncStatus {
  configured: boolean;
  missing: string[];
  stats: {
    totalEmpleadosMicrosoft: number;
    totalEmpleadosManuales: number;
  };
}

interface SyncResult {
  creados: number;
  actualizados: number;
  desactivados: number;
  errores: { usuario: string; error: string }[];
  alertas: { tipo: string; empleado: string; equipos: number }[];
}

export default function MicrosoftSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showInstructions, setShowInstructions] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/microsoft-sync/status');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // silenciar error de fetch
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setShowConfirm(false);
    setSyncing(true);
    setResult(null);
    setSyncError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/microsoft-sync', { method: 'POST' });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al sincronizar');
        setSyncError(message);
        setFieldErrors(fe);
        return;
      }

      const data = await res.json();
      setResult(data);
      fetchStatus();
    } catch {
      setSyncError('Error de conexión al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/configuracion"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Microsoft Sync</h1>
          <p className="text-gray-600 mt-1">
            Sincronización de empleados desde Microsoft Entra ID
          </p>
        </div>
      </div>

      {/* Estado de configuracion */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Cloud size={20} className="text-sky-500" />
            Estado de Configuración
          </h2>
          {status?.configured ? (
            <span className="inline-flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">
              <CheckCircle size={14} />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
              <AlertTriangle size={14} />
              No configurado
            </span>
          )}
        </div>

        {!status?.configured && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 text-sm">
              Faltan las siguientes variables de entorno:
            </p>
            <ul className="mt-2 space-y-1">
              {status?.missing.map((v) => (
                <li key={v} className="text-yellow-700 text-sm font-mono">
                  • {v}
                </li>
              ))}
            </ul>
            <p className="text-yellow-600 text-xs mt-3">
              Configúralas en el archivo .env o en el Dashboard de Vercel.
            </p>
          </div>
        )}

        {/* Stats */}
        {status && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-sky-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sky-700">
                <Cloud size={16} />
                <span className="text-sm font-medium">Empleados Microsoft</span>
              </div>
              <p className="text-2xl font-bold text-sky-900 mt-1">
                {status.stats.totalEmpleadosMicrosoft}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-700">
                <Users size={16} />
                <span className="text-sm font-medium">Empleados Manuales</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {status.stats.totalEmpleadosManuales}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Boton de sincronizacion */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sincronizar Empleados</h2>
        <p className="text-gray-600 text-sm mb-4">
          Sincroniza los empleados desde Microsoft Entra ID. Los nuevos usuarios se crean
          automáticamente, los existentes se actualizan, y los desactivados en Microsoft se
          marcan como desvinculados.
        </p>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!status?.configured || syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Sincronizar empleados
              </>
            )}
          </button>
        ) : (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <p className="text-sky-800 text-sm mb-3">
              Esto sincronizará todos los empleados desde Microsoft Entra ID. Los empleados
              desactivados en Microsoft serán marcados como desvinculados. ¿Continuar?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSync}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm transition-colors"
              >
                Sí, sincronizar
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error de sync */}
      <ApiErrorSummary error={syncError} fieldErrors={fieldErrors} />

      {/* Resultado de sincronizacion */}
      {result && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Resultado de Sincronización</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{result.creados}</p>
              <p className="text-sm text-green-600">Creados</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.actualizados}</p>
              <p className="text-sm text-blue-600">Actualizados</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-700">{result.desactivados}</p>
              <p className="text-sm text-orange-600">Desactivados</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{result.errores.length}</p>
              <p className="text-sm text-red-600">Errores</p>
            </div>
          </div>

          {/* Alertas de equipos pendientes */}
          {result.alertas.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon size={18} className="text-red-600" />
                <p className="font-medium text-red-800">
                  Empleados desactivados con equipos asignados
                </p>
              </div>
              <ul className="space-y-1">
                {result.alertas.map((alerta, i) => (
                  <li key={i} className="text-red-700 text-sm">
                    • <strong>{alerta.empleado}</strong> tiene {alerta.equipos} equipo(s) asignado(s)
                  </li>
                ))}
              </ul>
              <p className="text-red-600 text-xs mt-2">
                Gestiona la devolución de equipos en el módulo de Desvinculaciones.
              </p>
            </div>
          )}

          {/* Errores detallados */}
          {result.errores.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-medium text-red-800 mb-2">Detalle de errores:</p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.errores.map((err, i) => (
                  <li key={i} className="text-red-700 text-sm">
                    • <strong>{err.usuario}</strong>: {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Instrucciones de configuracion */}
      <div className="bg-white rounded-lg shadow">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">Cómo configurar</h2>
          {showInstructions ? (
            <ChevronUp size={20} className="text-gray-400" />
          ) : (
            <ChevronDown size={20} className="text-gray-400" />
          )}
        </button>
        {showInstructions && (
          <div className="px-6 pb-6 text-sm text-gray-700 space-y-3">
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Ir a{' '}
                <strong>Azure Portal &gt; Microsoft Entra ID &gt; App registrations</strong> y
                crear una nueva aplicación.
              </li>
              <li>
                Copiar el <strong>Application (client) ID</strong> y el{' '}
                <strong>Directory (tenant) ID</strong>.
              </li>
              <li>
                En <strong>Certificates &amp; secrets</strong>, crear un nuevo client secret y
                copiar el Value.
              </li>
              <li>
                En <strong>API permissions</strong>, agregar el permiso{' '}
                <strong>User.Read.All</strong> (Application) y otorgar admin consent.
              </li>
              <li>
                Configurar las 3 variables de entorno (<code>MICROSOFT_TENANT_ID</code>,{' '}
                <code>MICROSOFT_CLIENT_ID</code>, <code>MICROSOFT_CLIENT_SECRET</code>) en el
                archivo <code>.env</code> o en el Dashboard de Vercel.
              </li>
            </ol>
            <p className="text-gray-500 text-xs mt-2">
              Ver PLAN_MICROSOFT_SYNC.md en el repositorio para instrucciones detalladas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
