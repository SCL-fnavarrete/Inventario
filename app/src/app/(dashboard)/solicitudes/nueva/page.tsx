'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  UserPlus,
  ArrowLeftRight,
  Undo2,
  Plus,
  X,
  Search,
  Loader2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Employee = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  cargo: string | null;
  correo: string;
};

type SystemUser = {
  id: string;
  nombre: string;
  rol: string;
};

type EmployeeAsset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  categoria: { nombre: string };
};

const TIPOS = [
  {
    value: 'onboarding',
    label: 'Onboarding',
    description: 'Solicitar equipos para un nuevo empleado',
    icon: UserPlus,
    color: 'border-green-500 bg-green-50',
  },
  {
    value: 'cambio_equipo',
    label: 'Cambio de Equipo',
    description: 'Reemplazar un equipo por falla o incidencia',
    icon: ArrowLeftRight,
    color: 'border-blue-500 bg-blue-50',
  },
  {
    value: 'devolucion_termino',
    label: 'Devolución por Término',
    description: 'Coordinar devolución de equipos por desvinculación',
    icon: Undo2,
    color: 'border-orange-500 bg-orange-50',
  },
];

const PENDIENTE_TIPOS = [
  { value: 'celular', label: 'Celular' },
  { value: 'audifonos', label: 'Audífonos' },
  { value: 'mochila', label: 'Mochila' },
  { value: 'cargador', label: 'Cargador' },
  { value: 'epp_zapatos', label: 'EPP - Zapatos' },
  { value: 'epp_chaleco', label: 'EPP - Chaleco' },
  { value: 'epp_casco', label: 'EPP - Casco' },
  { value: 'epp_lentes', label: 'EPP - Lentes' },
  { value: 'kit_bienvenida', label: 'Kit de Bienvenida' },
  { value: 'otro', label: 'Otro' },
];

export default function NuevaSolicitudPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState('');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Employee search state
  const [searchEmployee, setSearchEmployee] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeAssets, setEmployeeAssets] = useState<EmployeeAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Create employee modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmp, setNewEmp] = useState({
    nombres: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    correo: '',
    rut: '',
    cargo: '',
    tipoContrato: 'proyecto' as string,
  });
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [createError, setCreateError] = useState('');

  // Form state
  const [employeeId, setEmployeeId] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [responsableActualId, setResponsableActualId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [pendientes, setPendientes] = useState<{ tipo: string; descripcion: string }[]>([]);

  // Onboarding fields
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [cargoSolicitado, setCargoSolicitado] = useState('');
  const [ubicacionDestino, setUbicacionDestino] = useState('');
  const [requiereNotebook, setRequiereNotebook] = useState(false);
  const [requiereCelular, setRequiereCelular] = useState(false);
  const [requiereMonitor, setRequiereMonitor] = useState(false);

  // Cambio equipo fields
  const [ticketFreshdesk, setTicketFreshdesk] = useState('');
  const [motivoCambio, setMotivoCambio] = useState('');

  // Devolucion fields
  const [fechaDesvinculacion, setFechaDesvinculacion] = useState('');
  const [medioDevolucion, setMedioDevolucion] = useState('');
  const [otChilexpress, setOtChilexpress] = useState('');
  const [ciudadDevolucion, setCiudadDevolucion] = useState('');

  // Load system users on mount
  useEffect(() => {
    fetch('/api/usuarios')
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : d.data || []))
      .catch(console.error);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced employee search via API
  const searchEmployees = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setSearchLoading(true);
    try {
      const params = new URLSearchParams({
        search: query,
        limit: '15',
        sortBy: 'nombres',
        sortOrder: 'asc',
      });
      const res = await fetch(`/api/empleados?${params}`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data || []);
        setShowResults(true);
      }
    } catch (err) {
      console.error('Error searching employees:', err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchEmployee(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchEmployees(value), 300);
  };

  const fetchEmployeeAssets = async (empId: string) => {
    setLoadingAssets(true);
    try {
      const res = await fetch(`/api/activos?empleadoActualId=${empId}&limit=50`);
      if (res.ok) {
        const json = await res.json();
        setEmployeeAssets(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching employee assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEmployeeId(emp.id);
    setSearchEmployee('');
    setShowResults(false);
    if (tipo === 'onboarding' && emp.cargo) setCargoSolicitado(emp.cargo);
    if (tipo === 'cambio_equipo' || tipo === 'devolucion_termino') {
      fetchEmployeeAssets(emp.id);
    }
  };

  const clearEmployee = () => {
    setSelectedEmployee(null);
    setEmployeeId('');
    setEmployeeAssets([]);
  };

  // Create new employee
  const handleCreateEmployee = async () => {
    setCreateError('');
    setCreatingEmployee(true);
    try {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: newEmp.nombres,
          apellidoPaterno: newEmp.apellidoPaterno,
          apellidoMaterno: newEmp.apellidoMaterno || null,
          correo: newEmp.correo,
          rut: newEmp.rut || null,
          cargo: newEmp.cargo || null,
          tipoContrato: newEmp.tipoContrato,
          estado: 'activo',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al crear empleado');
      }

      const created = await res.json();
      // Auto-select the new employee
      selectEmployee({
        id: created.id,
        rut: created.rut,
        nombres: created.nombres,
        apellidoPaterno: created.apellidoPaterno,
        apellidoMaterno: created.apellidoMaterno,
        cargo: created.cargo,
        correo: created.correo,
      });
      setShowCreateModal(false);
      setNewEmp({
        nombres: '',
        apellidoPaterno: '',
        apellidoMaterno: '',
        correo: '',
        rut: '',
        cargo: '',
        tipoContrato: 'proyecto',
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear empleado');
    } finally {
      setCreatingEmployee(false);
    }
  };

  const openCreateModal = () => {
    // Pre-fill name from search if available
    if (searchEmployee.trim()) {
      const parts = searchEmployee.trim().split(' ');
      setNewEmp((prev) => ({
        ...prev,
        nombres: parts[0] || '',
        apellidoPaterno: parts[1] || '',
        apellidoMaterno: parts.slice(2).join(' ') || '',
      }));
    }
    setShowCreateModal(true);
    setShowResults(false);
  };

  const addPendiente = () => {
    setPendientes([...pendientes, { tipo: 'otro', descripcion: '' }]);
  };

  const removePendiente = (index: number) => {
    setPendientes(pendientes.filter((_, i) => i !== index));
  };

  // Map Zod field paths to human-readable labels
  const fieldLabels: Record<string, string> = {
    tipo: 'Tipo de solicitud',
    employeeId: 'Empleado',
    prioridad: 'Prioridad',
    fechaIngreso: 'Fecha de Ingreso',
    cargoSolicitado: 'Cargo Solicitado',
    motivoCambio: 'Motivo del Cambio',
    fechaDesvinculacion: 'Fecha de Desvinculacion',
    responsableActualId: 'Responsable TI',
    observaciones: 'Observaciones',
  };

  const handleSubmit = async () => {
    setError('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const base = {
        tipo,
        employeeId,
        prioridad,
        responsableActualId: responsableActualId || null,
        observaciones: observaciones || null,
        pendientes: pendientes.length > 0 ? pendientes : undefined,
      };

      let body: Record<string, unknown> = base;

      if (tipo === 'onboarding') {
        body = {
          ...base,
          fechaIngreso,
          cargoSolicitado,
          ubicacionDestino: ubicacionDestino || null,
          requiereNotebook,
          requiereCelular,
          requiereMonitor,
        };
      } else if (tipo === 'cambio_equipo') {
        body = {
          ...base,
          ticketFreshdesk: ticketFreshdesk || null,
          motivoCambio,
        };
      } else if (tipo === 'devolucion_termino') {
        body = {
          ...base,
          fechaDesvinculacion,
          medioDevolucion: medioDevolucion || null,
          otChilexpress: otChilexpress || null,
          ciudadDevolucion: ciudadDevolucion || null,
        };
      }

      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();

        // Parse Zod validation errors into per-field messages
        if (err.details && Array.isArray(err.details)) {
          const errors: Record<string, string> = {};
          const messages: string[] = [];

          for (const issue of err.details) {
            const fieldPath = issue.path?.join('.') || '';
            const fieldName = fieldLabels[fieldPath] || fieldPath;
            const msg = issue.message || 'Campo invalido';
            errors[fieldPath] = msg;
            messages.push(`${fieldName}: ${msg}`);
          }

          setFieldErrors(errors);
          setError(`Faltan campos obligatorios:\n${messages.join('\n')}`);
          return;
        }

        throw new Error(err.error || 'Error al crear solicitud');
      }

      const data = await res.json();
      router.push(`/solicitudes/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/solicitudes" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Solicitud</h1>
          <p className="text-gray-600">
            {step === 1 ? 'Selecciona el tipo de solicitud' : 'Completa los datos'}
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
            step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
          )}
        >
          1
        </div>
        <div className={cn('h-0.5 flex-1', step >= 2 ? 'bg-blue-600' : 'bg-gray-200')} />
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
            step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
          )}
        >
          2
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {Object.keys(fieldErrors).length > 0 ? (
            <div>
              <p className="font-medium mb-2">Faltan campos obligatorios:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {Object.entries(fieldErrors).map(([field, msg]) => (
                  <li key={field}>
                    <span className="font-medium">{fieldLabels[field] || field}:</span> {msg}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            error
          )}
        </div>
      )}

      {/* Step 1: Select Type */}
      {step === 1 && (
        <div className="grid gap-4">
          {TIPOS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => {
                  setTipo(t.value);
                  setStep(2);
                }}
                className={cn(
                  'flex items-center gap-4 p-5 border-2 rounded-xl text-left transition-all hover:shadow-md',
                  tipo === t.value ? t.color : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="p-3 bg-white rounded-lg shadow-sm">
                  <Icon className="h-6 w-6 text-gray-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{t.label}</h3>
                  <p className="text-sm text-gray-500">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Step 2: Form */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Employee Selection */}
          <div>
            <label className={cn(
              'block text-sm font-medium mb-2',
              fieldErrors.employeeId ? 'text-red-600' : 'text-gray-700'
            )}>
              Empleado *
              {fieldErrors.employeeId && (
                <span className="ml-2 text-xs font-normal">({fieldErrors.employeeId})</span>
              )}
            </label>

            {selectedEmployee ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                    {selectedEmployee.apellidoMaterno ? ` ${selectedEmployee.apellidoMaterno}` : ''}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedEmployee.rut || '—'} · {selectedEmployee.correo}
                    {selectedEmployee.cargo ? ` · ${selectedEmployee.cargo}` : ''}
                  </p>
                </div>
                <button
                  onClick={clearEmployee}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div ref={searchContainerRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, RUT o correo (mín. 2 caracteres)..."
                    value={searchEmployee}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => {
                      if (searchResults.length > 0) setShowResults(true);
                    }}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Search Results Dropdown */}
                {showResults && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {searchResults.length > 0 ? (
                      searchResults.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => selectEmployee(emp)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-900">
                            {emp.nombres} {emp.apellidoPaterno}
                            {emp.apellidoMaterno ? ` ${emp.apellidoMaterno}` : ''}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <span>{emp.rut || 'Sin RUT'}</span>
                            <span>·</span>
                            <span>{emp.correo}</span>
                            {emp.cargo && (
                              <>
                                <span>·</span>
                                <span>{emp.cargo}</span>
                              </>
                            )}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center">
                        <p className="text-sm text-gray-500 mb-3">
                          No se encontraron empleados para &quot;{searchEmployee}&quot;
                        </p>
                        <button
                          onClick={openCreateModal}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
                        >
                          <UserPlus className="h-4 w-4" />
                          Crear nuevo empleado
                        </button>
                      </div>
                    )}

                    {/* Always show create option at the bottom if there are results */}
                    {searchResults.length > 0 && (
                      <button
                        onClick={openCreateModal}
                        className="w-full text-left px-4 py-3 hover:bg-green-50 border-t border-gray-200 transition-colors flex items-center gap-2"
                      >
                        <UserPlus className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700 font-medium">
                          Crear nuevo empleado
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {/* Hint text */}
                {!showResults && searchEmployee.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Escribe al menos 2 caracteres para buscar. Si no existe,{' '}
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="text-blue-600 hover:underline"
                    >
                      crea uno nuevo
                    </button>
                    .
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Common Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsable TI
              </label>
              <select
                value={responsableActualId}
                onChange={(e) => setResponsableActualId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Sin asignar</option>
                {users
                  .filter((u) => ['admin', 'tecnico'].includes(u.rol))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.rol})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Type-specific fields */}
          {tipo === 'onboarding' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-gray-900">Datos de Onboarding</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={cn(
                    'block text-sm font-medium mb-1',
                    fieldErrors.fechaIngreso ? 'text-red-600' : 'text-gray-700'
                  )}>
                    Fecha de Ingreso *
                  </label>
                  <input
                    type="date"
                    value={fechaIngreso}
                    onChange={(e) => { setFechaIngreso(e.target.value); setFieldErrors((prev) => { const { fechaIngreso: _, ...rest } = prev; return rest; }); }}
                    className={cn('w-full px-3 py-2 border rounded-lg', fieldErrors.fechaIngreso ? 'border-red-500 bg-red-50' : 'border-gray-300')}
                  />
                </div>
                <div>
                  <label className={cn(
                    'block text-sm font-medium mb-1',
                    fieldErrors.cargoSolicitado ? 'text-red-600' : 'text-gray-700'
                  )}>
                    Cargo Solicitado *
                  </label>
                  <input
                    type="text"
                    value={cargoSolicitado}
                    onChange={(e) => { setCargoSolicitado(e.target.value); setFieldErrors((prev) => { const { cargoSolicitado: _, ...rest } = prev; return rest; }); }}
                    className={cn('w-full px-3 py-2 border rounded-lg', fieldErrors.cargoSolicitado ? 'border-red-500 bg-red-50' : 'border-gray-300')}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación Destino
                  </label>
                  <input
                    type="text"
                    value={ubicacionDestino}
                    onChange={(e) => setUbicacionDestino(e.target.value)}
                    placeholder="Ej: Oficina Central, Terreno Minera..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Equipos Requeridos
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={requiereNotebook}
                      onChange={(e) => setRequiereNotebook(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Notebook</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={requiereCelular}
                      onChange={(e) => setRequiereCelular(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Celular</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={requiereMonitor}
                      onChange={(e) => setRequiereMonitor(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Monitor</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {tipo === 'cambio_equipo' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-gray-900">Datos del Cambio</h3>

              {/* Equipos actuales del empleado */}
              {selectedEmployee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Equipos asignados actualmente
                  </label>
                  {loadingAssets ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : employeeAssets.length > 0 ? (
                    <div className="space-y-2">
                      {employeeAssets.map((asset) => {
                        const iconMap: Record<string, React.ReactNode> = {
                          notebook: <Laptop className="h-4 w-4" />,
                          celular: <Smartphone className="h-4 w-4" />,
                          monitor: <Monitor className="h-4 w-4" />,
                        };
                        const icon = iconMap[asset.categoria.nombre.toLowerCase()] || <Package className="h-4 w-4" />;
                        return (
                          <div
                            key={asset.id}
                            className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                          >
                            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
                              {icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {asset.categoria.nombre}: {asset.marca} {asset.modelo}
                              </p>
                              <p className="text-xs text-gray-500">
                                Serie: {asset.numeroSerie || 'Sin serie'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Este empleado no tiene equipos asignados actualmente
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className={cn(
                  'block text-sm font-medium mb-1',
                  fieldErrors.motivoCambio ? 'text-red-600' : 'text-gray-700'
                )}>
                  Motivo del Cambio *
                </label>
                <textarea
                  value={motivoCambio}
                  onChange={(e) => { setMotivoCambio(e.target.value); setFieldErrors((prev) => { const { motivoCambio: _, ...rest } = prev; return rest; }); }}
                  placeholder="Ej: Sobrecalentamiento, pantalla danada..."
                  rows={3}
                  className={cn('w-full px-3 py-2 border rounded-lg', fieldErrors.motivoCambio ? 'border-red-500 bg-red-50' : 'border-gray-300')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticket Freshdesk
                </label>
                <input
                  type="text"
                  value={ticketFreshdesk}
                  onChange={(e) => setTicketFreshdesk(e.target.value)}
                  placeholder="Ej: #12345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {tipo === 'devolucion_termino' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-gray-900">Datos de Devolucion</h3>

              {/* Equipos actuales del empleado */}
              {selectedEmployee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Equipos a devolver
                  </label>
                  {loadingAssets ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : employeeAssets.length > 0 ? (
                    <div className="space-y-2">
                      {employeeAssets.map((asset) => {
                        const iconMap: Record<string, React.ReactNode> = {
                          notebook: <Laptop className="h-4 w-4" />,
                          celular: <Smartphone className="h-4 w-4" />,
                          monitor: <Monitor className="h-4 w-4" />,
                        };
                        const icon = iconMap[asset.categoria.nombre.toLowerCase()] || <Package className="h-4 w-4" />;
                        return (
                          <div
                            key={asset.id}
                            className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg"
                          >
                            <div className="p-1.5 bg-orange-100 rounded-lg text-orange-700">
                              {icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {asset.categoria.nombre}: {asset.marca} {asset.modelo}
                              </p>
                              <p className="text-xs text-gray-500">
                                Serie: {asset.numeroSerie || 'Sin serie'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Este empleado no tiene equipos asignados actualmente
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={cn(
                    'block text-sm font-medium mb-1',
                    fieldErrors.fechaDesvinculacion ? 'text-red-600' : 'text-gray-700'
                  )}>
                    Fecha Desvinculacion *
                  </label>
                  <input
                    type="date"
                    value={fechaDesvinculacion}
                    onChange={(e) => { setFechaDesvinculacion(e.target.value); setFieldErrors((prev) => { const { fechaDesvinculacion: _, ...rest } = prev; return rest; }); }}
                    className={cn('w-full px-3 py-2 border rounded-lg', fieldErrors.fechaDesvinculacion ? 'border-red-500 bg-red-50' : 'border-gray-300')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Medio de Devolución
                  </label>
                  <select
                    value={medioDevolucion}
                    onChange={(e) => setMedioDevolucion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Seleccionar</option>
                    <option value="presencial">Presencial</option>
                    <option value="chilexpress">Chilexpress</option>
                    <option value="otro_courier">Otro Courier</option>
                  </select>
                </div>
                {medioDevolucion === 'chilexpress' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      OT Chilexpress
                    </label>
                    <input
                      type="text"
                      value={otChilexpress}
                      onChange={(e) => setOtChilexpress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ciudad Devolución
                  </label>
                  <input
                    type="text"
                    value={ciudadDevolucion}
                    onChange={(e) => setCiudadDevolucion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Pendientes / Checklist */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-gray-900">Pendientes / Accesorios</h3>
              <button
                type="button"
                onClick={addPendiente}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
            {pendientes.map((p, i) => (
              <div key={i} className="flex gap-3 mb-2">
                <select
                  value={p.tipo}
                  onChange={(e) => {
                    const updated = [...pendientes];
                    updated[i].tipo = e.target.value;
                    setPendientes(updated);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {PENDIENTE_TIPOS.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Descripción (opcional)"
                  value={p.descripcion}
                  onChange={(e) => {
                    const updated = [...pendientes];
                    updated[i].descripcion = e.target.value;
                    setPendientes(updated);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={() => removePendiente(i)}
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {pendientes.length === 0 && (
              <p className="text-sm text-gray-400">No hay pendientes agregados</p>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Volver
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !employeeId}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creando...' : 'Crear Solicitud'}
            </button>
          </div>
        </div>
      )}

      {/* Create Employee Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Crear Nuevo Empleado</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
                {createError}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    value={newEmp.nombres}
                    onChange={(e) => setNewEmp({ ...newEmp, nombres: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido Paterno *
                  </label>
                  <input
                    type="text"
                    value={newEmp.apellidoPaterno}
                    onChange={(e) => setNewEmp({ ...newEmp, apellidoPaterno: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido Materno
                  </label>
                  <input
                    type="text"
                    value={newEmp.apellidoMaterno}
                    onChange={(e) => setNewEmp({ ...newEmp, apellidoMaterno: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                  <input
                    type="text"
                    value={newEmp.rut}
                    onChange={(e) => setNewEmp({ ...newEmp, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo *
                </label>
                <input
                  type="email"
                  value={newEmp.correo}
                  onChange={(e) => setNewEmp({ ...newEmp, correo: e.target.value })}
                  placeholder="nombre@empresa.cl"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input
                    type="text"
                    value={newEmp.cargo}
                    onChange={(e) => setNewEmp({ ...newEmp, cargo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo Contrato *
                  </label>
                  <select
                    value={newEmp.tipoContrato}
                    onChange={(e) => setNewEmp({ ...newEmp, tipoContrato: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="planta">Planta</option>
                    <option value="proyecto">Proyecto</option>
                    <option value="externo">Externo</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateEmployee}
                disabled={
                  creatingEmployee ||
                  !newEmp.nombres ||
                  !newEmp.apellidoPaterno ||
                  !newEmp.correo
                }
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingEmployee ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {creatingEmployee ? 'Creando...' : 'Crear y Seleccionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
