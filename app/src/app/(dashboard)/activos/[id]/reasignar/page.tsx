'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, XCircle, RefreshCw, Search } from 'lucide-react';
import OfficialEvidenceFields from '@/components/ui/OfficialEvidenceFields';

type Asset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  categoria: { nombre: string };
  assignments: { id: string; activo: boolean; employee: { id: string; nombres: string; apellidoPaterno: string; rut: string | null } }[];
};

type Employee = {
  id: string;
  nombres: string;
  apellidoPaterno: string;
  rut: string | null;
  correo: string;
  cargo: string | null;
};

export default function ReasignarActivoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  // Step 1
  const [estadoDevolucion, setEstadoDevolucion] = useState('');

  // Step 2
  const [searchQuery, setSearchQuery] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [motivoReasignacion, setMotivoReasignacion] = useState('');

  // Step 3
  const [lugarEntrega, setLugarEntrega] = useState('');
  const [entregadoPor, setEntregadoPor] = useState('');
  const [firmaEmpleadoDevolucion, setFirmaEmpleadoDevolucion] = useState<string | null>(null);
  const [aceptaPoliticaUsoDevolucion, setAceptaPoliticaUsoDevolucion] = useState(false);
  const [firmaEmpleadoEntrega, setFirmaEmpleadoEntrega] = useState<string | null>(null);
  const [aceptaPoliticaUsoEntrega, setAceptaPoliticaUsoEntrega] = useState(false);

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

  const activeAssignment = asset?.assignments?.find((a) => a.activo);

  const searchEmployees = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    try {
      const res = await fetch(`/api/empleados?search=${encodeURIComponent(searchQuery)}&estado=activo&limit=10`);
      const data = await res.json();
      setEmployees(data.data || data || []);
    } catch {
      setEmployees([]);
    }
  };

  const handleSubmit = async () => {
    if (!activeAssignment || !selectedEmployee) return;
    if (!lugarEntrega || !firmaEmpleadoDevolucion || !firmaEmpleadoEntrega || !aceptaPoliticaUsoDevolucion || !aceptaPoliticaUsoEntrega) {
      setError('La reasignación oficial requiere lugar, ambas firmas y aceptación de política.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/activos/${id}/reasignar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: activeAssignment.id,
          newEmployeeId: selectedEmployee.id,
          estadoDevolucion,
          motivoReasignacion,
          fechaReasignacion: new Date().toISOString(),
          lugarEntrega,
          entregadoPor: entregadoPor || undefined,
          firmaEmpleadoDevolucion,
          aceptaPoliticaUsoDevolucion: true,
          firmaEmpleadoEntrega,
          aceptaPoliticaUsoEntrega: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al reasignar');
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
        <div className="flex items-center gap-2">
          <RefreshCw className="text-indigo-600" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reasignar Equipo</h1>
            <p className="text-gray-600">{asset.marca} {asset.modelo} • {asset.numeroSerie}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="text-red-500 shrink-0" size={20} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {!activeAssignment && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          El activo no tiene asignación activa. No se puede reasignar.
        </div>
      )}

      {activeAssignment && (
        <>
          {/* Info actual */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <p className="text-gray-500 mb-1">Asignado actualmente a:</p>
            <p className="font-medium text-gray-900">
              {activeAssignment.employee.nombres} {activeAssignment.employee.apellidoPaterno}
              {activeAssignment.employee.rut && ` • RUT: ${activeAssignment.employee.rut}`}
            </p>
          </div>

          {/* Step 1: Estado devolución */}
          {step === 1 && (
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold">Paso 1: Estado del equipo</h2>
              <p className="text-sm text-gray-600">¿En qué estado se encuentra el equipo al devolverlo?</p>

              <div className="flex gap-3">
                {[
                  { value: 'ok', label: 'OK - Buen estado', color: 'green' },
                  { value: 'incompleto', label: 'Incompleto', color: 'yellow' },
                ].map(({ value, label, color }) => (
                  <button
                    key={value}
                    onClick={() => setEstadoDevolucion(value)}
                    className={`flex-1 p-4 rounded-lg border text-sm transition-colors ${
                      estadoDevolucion === value
                        ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                Si el equipo está dañado, no se puede reasignar. Utilice el proceso de devolución + baja.
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!estadoDevolucion}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Seleccionar empleado */}
          {step === 2 && (
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold">Paso 2: Nuevo empleado</h2>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchEmployees()}
                  className="flex-1 border rounded-lg p-3 text-sm"
                  placeholder="Buscar por nombre, RUT o correo..."
                />
                <button
                  onClick={searchEmployees}
                  className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Search size={20} />
                </button>
              </div>

              {employees.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {employees
                    .filter((e) => e.id !== activeAssignment.employee.id)
                    .map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => setSelectedEmployee(emp)}
                        className={`w-full text-left p-3 text-sm hover:bg-gray-50 ${
                          selectedEmployee?.id === emp.id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <p className="font-medium">{emp.nombres} {emp.apellidoPaterno}</p>
                        <p className="text-gray-500">{emp.rut || 'Sin RUT'} • {emp.correo}</p>
                      </button>
                    ))}
                </div>
              )}

              {selectedEmployee && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm">
                  <p className="text-indigo-700 font-medium">Seleccionado: {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de reasignación *</label>
                <textarea
                  value={motivoReasignacion}
                  onChange={(e) => setMotivoReasignacion(e.target.value)}
                  className="w-full border rounded-lg p-3 text-sm"
                  rows={2}
                  placeholder="Ej: Cambio de área, rotación de personal..."
                />
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  ← Volver
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedEmployee || !motivoReasignacion}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmar */}
          {step === 3 && selectedEmployee && (
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold">Paso 3: Confirmar reasignación</h2>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-gray-500">Equipo:</p>
                  <p className="font-medium">{asset.marca} {asset.modelo}</p>
                  <p className="text-gray-500">De:</p>
                  <p className="font-medium">{activeAssignment.employee.nombres} {activeAssignment.employee.apellidoPaterno}</p>
                  <p className="text-gray-500">A:</p>
                  <p className="font-medium">{selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}</p>
                  <p className="text-gray-500">Estado equipo:</p>
                  <p className="font-medium">{estadoDevolucion === 'ok' ? 'OK' : 'Incompleto'}</p>
                  <p className="text-gray-500">Motivo:</p>
                  <p className="font-medium">{motivoReasignacion}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lugar de entrega *</label>
                  <input
                    type="text"
                    value={lugarEntrega}
                    onChange={(e) => setLugarEntrega(e.target.value)}
                    className="w-full border rounded-lg p-3 text-sm"
                    placeholder="Ej: Santiago"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entregado por</label>
                  <input
                    type="text"
                    value={entregadoPor}
                    onChange={(e) => setEntregadoPor(e.target.value)}
                    className="w-full border rounded-lg p-3 text-sm"
                    placeholder="Nombre del técnico"
                  />
                </div>
              </div>

              <OfficialEvidenceFields
                kind="devolucion"
                suffix=" del titular anterior"
                signature={firmaEmpleadoDevolucion}
                onSignatureChange={setFirmaEmpleadoDevolucion}
                accepted={aceptaPoliticaUsoDevolucion}
                onAcceptedChange={setAceptaPoliticaUsoDevolucion}
                disabled={submitting}
              />
              <OfficialEvidenceFields
                kind="entrega"
                suffix=" del nuevo titular"
                signature={firmaEmpleadoEntrega}
                onSignatureChange={setFirmaEmpleadoEntrega}
                accepted={aceptaPoliticaUsoEntrega}
                onAcceptedChange={setAceptaPoliticaUsoEntrega}
                disabled={submitting}
              />

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep(2)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  ← Volver
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !lugarEntrega || !firmaEmpleadoDevolucion || !firmaEmpleadoEntrega || !aceptaPoliticaUsoDevolucion || !aceptaPoliticaUsoEntrega}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Procesando...' : 'Confirmar Reasignación'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
