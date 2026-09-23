'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  UserPlus,
  ArrowLeftRight,
  Undo2,
  X,
  Search,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/activos/CategoryIcon';
import {
  SeleccionarCambioEquipo,
  type SeleccionCambioEquipo,
} from '@/components/solicitudes/SeleccionarCambioEquipo';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectCondicionCargador } from '@/components/solicitudes/SelectCondicionCargador';
import {
  CONDICION_CARGADOR_POR_DEFECTO,
  type CondicionCargador,
} from '@/lib/constants/condicionCargador';
import {
  AvisoSeccion,
  CampoFormulario,
  CampoTexto,
  MensajeCampo,
  claseInput,
  enfocarPrimerError,
  sinErrores,
} from '@/components/ui/CampoFormulario';
import { useCampoSede, useSedeSeleccionada } from '@/components/providers/SedeSeleccionadaProvider';

type Employee = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  cargo: string | null;
  // El correo de empresa es obligatorio; el personal queda opcional.
  correoEmpresa: string;
  correoPersonal: string | null;
  estado?: string;
  // Se usa para fijar la Sede de la solicitud a la del empleado en Cambio
  // de Equipo/Desvinculacion.
  sedeId?: string | null;
};

// Asignacion activa del empleado (con su id propio, distinto del id del
// Activo) -- se necesita el id de la asignacion para poder calificarla y
// devolverla de una al crear el ticket de offboarding.
type EmployeeAssignment = {
  id: string;
  activo: boolean;
  asset: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    categoria: { nombre: string };
    tieneCargador: boolean;
  };
};

// EPP entregado al empleado y aun no devuelto -- el Kit de Bienvenida no
// entra aca porque es consumible, no se devuelve al desvincularse.
type EmployeeKitAssignment = {
  id: string;
  estado: string;
  item: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp' };
};

function toggleCategoriaRequerida(
  lista: string[],
  nombre: string,
  marcado: boolean
): string[] {
  if (marcado) return lista.includes(nombre) ? lista : [...lista, nombre];
  return lista.filter((c) => c !== nombre);
}

// Equipo disponible para elegir en "Equipos Requeridos", con sus specs --
// antes solo se traian/mostraban marca/modelo/numeroSerie, sin procesador,
// RAM, etc., asi que habia que ir a Activos a revisarlas por separado.
type EquipoDisponible = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  operador: string | null;
  pulgadas: string | number | null;
  // Si el equipo es nuevo o usado; sale del campo `condicion`.
  condicion: 'nuevo' | 'usado' | 'danado';
  tieneCargador: boolean;
};

function especificacionesEquipo(a: EquipoDisponible): string {
  const partes: string[] = [];
  if (a.procesador) partes.push(a.procesador);
  if (a.ram) partes.push(a.ram);
  if (a.discoDuro) partes.push(a.discoDuro);
  if (a.sistemaOperativo) partes.push(a.sistemaOperativo);
  if (a.imei) partes.push(`IMEI ${a.imei}`);
  if (a.numeroTelefono) partes.push(a.numeroTelefono);
  if (a.tipoPlan) partes.push(a.tipoPlan);
  if (a.operador) partes.push(a.operador);
  if (a.pulgadas) partes.push(`${a.pulgadas}"`);
  return partes.join(' · ');
}

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
    color: 'border-primary-500 bg-primary-50',
  },
  {
    value: 'offboarding',
    label: 'Offboarding',
    description: 'Coordinar devolución de equipos por desvinculación',
    icon: Undo2,
    color: 'border-orange-500 bg-orange-50',
  },
];

const NEW_EMPLOYEE_INITIAL = {
  nombres: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  correoPersonal: '',
  correoEmpresa: '',
  rut: '',
  cargo: '',
  supervisor: '',
  telefonoContacto: '',
  division: '',
  area: '',
  subArea: '',
  direccionParticular: '',
  listasDistribucion: '',
  ubicacion: '',
  tipoContrato: 'contrato' as string,
};

// Datos obligatorios del empleado nuevo en un onboarding (campo -> nombre
// visible en el mensaje de error).
const CAMPOS_OBLIGATORIOS_ONBOARDING = [
  ['nombres', 'Nombres'],
  ['apellidoPaterno', 'Apellido paterno'],
  ['apellidoMaterno', 'Apellido materno'],
  ['rut', 'RUT'],
  ['correoPersonal', 'Correo personal'],
  ['cargo', 'Cargo'],
  ['supervisor', 'Supervisor'],
  ['telefonoContacto', 'Celular de contacto'],
  ['direccionParticular', 'Dirección particular'],
] as const;

// Nombre visible de cada campo validado, para el resumen de errores.
const ETIQUETAS_ERROR: Record<string, string> = {
  ...Object.fromEntries(CAMPOS_OBLIGATORIOS_ONBOARDING),
  employeeId: 'Empleado',
  cargoSolicitado: 'Cargo solicitado',
  fechaIngreso: 'Fecha de ingreso',
  equipos: 'Equipos',
  fechaEntregaCoordinada: 'Fecha de entrega',
  lugarEntrega: 'Lugar de entrega',
  otChilexpressEntrega: 'N° de OT Chilexpress',
  ciudadEntrega: 'Ubicación de destino',
  kitEpp: 'Kit de Bienvenida / EPP',
  sedeId: 'Sede',
  motivoCambio: 'Motivo del cambio',
  cambioSeleccion: 'Equipo a cambiar',
  fechaCambioCoordinada: 'Fecha del cambio',
  lugarCambio: 'Lugar del cambio',
  otCambioChilexpress: 'N° de OT Chilexpress',
  ciudadCambio: 'Ubicación de destino',
  fechaDesvinculacion: 'Fecha de desvinculación',
  devoluciones: 'Equipos a devolver',
  devolucionesEpp: 'EPP a devolver',
  fechaDevolucionCoordinada: 'Fecha de devolución',
  lugarDevolucion: 'Lugar de devolución',
  otChilexpress: 'N° de OT Chilexpress',
  ciudadDevolucion: 'Ubicación de destino',
};

const DATO_OBLIGATORIO = 'Este dato es obligatorio';

export default function NuevaSolicitudPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [sedes, setSedes] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  // Sede de la solicitud: precargada con la del navbar o la propia
  // (useCampoSede, SPEC 2.80). En offboarding/cambio de equipo la fija el
  // empleado elegido (ver selectEmployee).
  const [sedeId, setSedeId] = useCampoSede();
  const { sedeSeleccionada } = useSedeSeleccionada();
  // Solo admin elige sede.
  const esAdminSede = session?.user?.role === 'admin';
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Employee search state (cambio_equipo / offboarding)
  const [searchEmployee, setSearchEmployee] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  // Asignaciones activas del empleado, para poder calificarlas y cerrarlas
  // de una al crear el ticket -- offboarding (devoluciones) y cambio_equipo
  // (equipo viejo a cambiar) comparten esta misma carga.
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [devolucionEstados, setDevolucionEstados] = useState<Record<string, 'ok' | 'danado' | 'no_devuelto'>>({});
  const [devolucionObservaciones, setDevolucionObservaciones] = useState<Record<string, string>>({});
  // Condicion del cargador al devolver, solo si el equipo es un notebook
  // con tieneCargador.
  const [devolucionCargador, setDevolucionCargador] = useState<Record<string, CondicionCargador>>({});
  const [devolucionCargadorObservaciones, setDevolucionCargadorObservaciones] = useState<Record<string, string>>({});
  // EPP entregado y pendiente de devolver (offboarding)
  const [employeeEppAssignments, setEmployeeEppAssignments] = useState<EmployeeKitAssignment[]>([]);
  const [devolucionEppEstados, setDevolucionEppEstados] = useState<Record<string, 'ok' | 'danado' | 'no_devuelto'>>({});
  const [devolucionEppObservaciones, setDevolucionEppObservaciones] = useState<Record<string, string>>({});
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Create employee modal (cambio_equipo / offboarding)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmp, setNewEmp] = useState({ ...NEW_EMPLOYEE_INITIAL });
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [createError, setCreateError] = useState('');
  // Sede del empleado que se crea desde el modal: parte de la sede de la
  // solicitud. POST /api/empleados la exige para admin (sedeIdParaCrear).
  const [sedeEmpleadoNuevo, setSedeEmpleadoNuevo] = useState('');

  // Onboarding: nuevo empleado (paso 2), sin persistir hasta el submit final
  const [onboardingEmp, setOnboardingEmp] = useState({ ...NEW_EMPLOYEE_INITIAL });
  const [resumenErrores, setResumenErrores] = useState('');
  // Onboarding tambien cubre la reincorporacion de alguien que ya trabajo
  // antes y quedo "desvinculado" -- en ese caso no se crea un Employee
  // nuevo (chocaria con el rut/correo unico del que ya existe), se busca y
  // se elige el registro existente; el backend lo reactiva (estado ->
  // activo) al crear el ticket. Por defecto "nuevo" para no cambiar el
  // flujo de siempre.
  const [modoEmpleadoOnboarding, setModoEmpleadoOnboarding] = useState<'nuevo' | 'existente'>('nuevo');
  const [cargoSolicitadoReincorporacion, setCargoSolicitadoReincorporacion] = useState('');
  // El tipo de contrato pudo cambiar desde la vez anterior (ej: volvio a
  // boleta en vez de contrato) -- se deja elegir de nuevo en vez de heredar
  // el que tenia guardado.
  const [tipoContratoReincorporacion, setTipoContratoReincorporacion] = useState('contrato');

  // Tipo de contrato vigente en el paso de onboarding, sea empleado nuevo o
  // reincorporacion -- Kit de Bienvenida y EPP solo corresponden a
  // "contrato"; a boleta de honorarios no se le entrega, asi que esa
  // seccion se deshabilita cuando corresponde.
  const tipoContratoOnboardingActual =
    modoEmpleadoOnboarding === 'nuevo' ? onboardingEmp.tipoContrato : tipoContratoReincorporacion;
  const kitEppBloqueadoPorContrato = tipoContratoOnboardingActual === 'boleta';

  // Form state
  const [employeeId, setEmployeeId] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Onboarding fields
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [categoriasRequeridas, setCategoriasRequeridas] = useState<string[]>([]);
  // Disponibilidad de equipos por categoria, para que al tildar "Notebook" (etc.)
  // se vea de inmediato cuantos hay en stock antes de mandar la solicitud, sin
  // tener que ir a revisar el modulo de Activos por separado.
  const [disponiblesPorCategoria, setDisponiblesPorCategoria] = useState<
    Record<string, { total: number; items: EquipoDisponible[] }>
  >({});
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null);
  // Si hay stock disponible, se puede elegir de una el equipo especifico
  // (no solo la categoria) y queda reservado desde que se crea el ticket,
  // sin pasar por Gestion TI. Mapa categoriaId -> assetId elegido.
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<Record<string, string>>({});
  // Condicion del cargador del equipo elegido, por categoria; solo se pide
  // si el equipo reservado es un notebook con tieneCargador.
  const [cargadorOnboarding, setCargadorOnboarding] = useState<
    Record<string, { condicion: CondicionCargador; observaciones: string }>
  >({});
  // Coordinacion de entrega: se pide junto con la eleccion de equipos, en
  // vez de en un paso aparte despues.
  const [fechaEntregaCoordinada, setFechaEntregaCoordinada] = useState('');
  const [medioEntrega, setMedioEntrega] = useState<'presencial' | 'chilexpress'>('presencial');
  const [lugarEntrega, setLugarEntrega] = useState('');
  const [otChilexpressEntrega, setOtChilexpressEntrega] = useState('');
  const [ciudadEntrega, setCiudadEntrega] = useState('');
  // Kit de Bienvenida y EPP: aparte de Equipos Requeridos porque no son
  // Activos (ver /configuracion/kit-epp). Igual que con los equipos, si hay
  // stock se puede elegir de una los articulos y cantidades especificas y
  // quedan reservados desde que se crea el ticket.
  const [kitBienvenidaSolicitado, setKitBienvenidaSolicitado] = useState(false);
  const [eppSolicitado, setEppSolicitado] = useState(false);
  const [kitCatalog, setKitCatalog] = useState<
    { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp'; cantidad: number }[]
  >([]);
  const [kitCategoriaExpandida, setKitCategoriaExpandida] = useState<'kit_bienvenida' | 'epp' | null>(
    null
  );
  const [kitCantidadesSeleccionadas, setKitCantidadesSeleccionadas] = useState<Record<string, number>>(
    {}
  );

  // Si el tipo de contrato cambia a boleta (honorarios), Kit de Bienvenida y
  // EPP dejan de corresponder -- se desmarca y limpia cualquier seleccion
  // previa para no dejar una solicitud armada con algo que ya no se puede
  // pedir.
  useEffect(() => {
    if (kitEppBloqueadoPorContrato) {
      setKitBienvenidaSolicitado(false);
      setEppSolicitado(false);
      setKitCantidadesSeleccionadas({});
    }
  }, [kitEppBloqueadoPorContrato]);

  // Cambio equipo fields
  const [motivoCambio, setMotivoCambio] = useState('');
  // Coordinacion de cambio: igual patron, junto con la seleccion del
  // equipo de reemplazo.
  const [fechaCambioCoordinada, setFechaCambioCoordinada] = useState('');
  const [medioCambio, setMedioCambio] = useState<'presencial' | 'chilexpress'>('presencial');
  const [lugarCambio, setLugarCambio] = useState('');
  const [otCambioChilexpress, setOtCambioChilexpress] = useState('');
  const [ciudadCambio, setCiudadCambio] = useState('');
  // Si se completa (equipo viejo + estado + equipo nuevo), el cambio se
  // ejecuta de inmediato al crear el ticket; si se deja en null, el ticket
  // nace en "Incidencia Detectada" como antes.
  const [cambioSeleccion, setCambioSeleccion] = useState<SeleccionCambioEquipo | null>(null);

  // Offboarding fields
  const [fechaDesvinculacion, setFechaDesvinculacion] = useState('');
  // Solo dos medios -- Presencial o Chilexpress -- igual que en
  // Onboarding/Cambio de Equipo.
  const [medioDevolucion, setMedioDevolucion] = useState<'presencial' | 'chilexpress'>('presencial');
  const [otChilexpress, setOtChilexpress] = useState('');
  const [ciudadDevolucion, setCiudadDevolucion] = useState('');
  // Coordinacion de devolucion: fecha/lugar en el mismo formulario de
  // creacion.
  const [fechaDevolucionCoordinada, setFechaDevolucionCoordinada] = useState('');
  const [lugarDevolucion, setLugarDevolucion] = useState('');

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
      // Acota a la sede del navbar si hay una elegida; la API solo lo
      // aplica a quien ve todas las sedes (el resto ya ve solo la suya).
      if (sedeSeleccionada) params.set('sedeId', sedeSeleccionada);
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
  }, [sedeSeleccionada]);

  const handleSearchChange = (value: string) => {
    setSearchEmployee(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchEmployees(value), 300);
  };

  // Trae las asignaciones activas del empleado (con id de asignacion, no
  // solo del activo) para poder calificarlas al crear el ticket -- lo usan
  // offboarding (devoluciones) y cambio_equipo (equipo viejo a cambiar).
  const fetchEmployeeAssignments = async (empId: string) => {
    setLoadingAssignments(true);
    try {
      const res = await fetch(`/api/empleados/${empId}`);
      if (res.ok) {
        const emp = await res.json();
        const activas = ((emp.assignments || []) as EmployeeAssignment[]).filter((a) => a.activo);
        setEmployeeAssignments(activas);
        const eppPendiente = ((emp.kitAssignments || []) as EmployeeKitAssignment[]).filter(
          (k) => k.estado === 'entregado' && k.item.categoria === 'epp'
        );
        setEmployeeEppAssignments(eppPendiente);
      }
    } catch (err) {
      console.error('Error fetching employee assignments:', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setFieldErrors((prev) => sinErrores(prev, 'employeeId'));
    setEmployeeId(emp.id);
    setSearchEmployee('');
    setShowResults(false);
    if (tipo === 'offboarding' || tipo === 'cambio_equipo') fetchEmployeeAssignments(emp.id);
    // Desvinculacion y Cambio de Equipo son sobre un empleado que ya
    // pertenece a una sede, asi que se fija sola al elegirlo.
    if ((tipo === 'offboarding' || tipo === 'cambio_equipo') && emp.sedeId) {
      setSedeId(emp.sedeId);
    }
  };

  const clearEmployee = () => {
    setSelectedEmployee(null);
    setEmployeeId('');
    setEmployeeAssignments([]);
    setDevolucionEstados({});
    setDevolucionObservaciones({});
    setEmployeeEppAssignments([]);
    setDevolucionEppEstados({});
    setDevolucionEppObservaciones({});
    setCambioSeleccion(null);
  };

  // Create new employee (usado por cambio_equipo / offboarding, vía modal)
  const handleCreateEmployee = async () => {
    setCreateError('');
    if (esAdminSede && !sedeEmpleadoNuevo) {
      setCreateError('Debes seleccionar la sede del empleado');
      return;
    }
    setCreatingEmployee(true);
    try {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: newEmp.nombres,
          apellidoPaterno: newEmp.apellidoPaterno,
          apellidoMaterno: newEmp.apellidoMaterno || null,
          correoEmpresa: newEmp.correoEmpresa || null,
          correoPersonal: newEmp.correoPersonal || null,
          rut: newEmp.rut || null,
          cargo: newEmp.cargo || null,
          ubicacion: newEmp.ubicacion || null,
          tipoContrato: newEmp.tipoContrato,
          estado: 'activo',
          sedeId: sedeEmpleadoNuevo || undefined,
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
        correoPersonal: created.correoPersonal,
        correoEmpresa: created.correoEmpresa,
      });
      setShowCreateModal(false);
      setNewEmp({ ...NEW_EMPLOYEE_INITIAL });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error al crear empleado');
    } finally {
      setCreatingEmployee(false);
    }
  };

  const openCreateModal = () => {
    setSedeEmpleadoNuevo(sedeId);
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

  useEffect(() => {
    let cancelado = false;
    fetch('/api/sedes?activas=true')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelado) setSedes(data);
      })
      .catch(() => {
        if (!cancelado) setSedes([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch('/api/categorias')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelado) setCategorias(data.data || data);
      })
      .catch(() => {
        if (!cancelado) setCategorias([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Disponibilidad de equipos por categoria (5 primeros de cada estado +
  // total), para mostrar stock en "Equipos Requeridos" sin salir del
  // formulario. "disponible" es el unico estado asignable; nuevo/usado lo
  // dice `condicion`.
  useEffect(() => {
    if (categorias.length === 0) return;
    let cancelado = false;
    const mapearItem = (a: EquipoDisponible): EquipoDisponible => ({
      id: a.id,
      marca: a.marca,
      modelo: a.modelo,
      numeroSerie: a.numeroSerie,
      procesador: a.procesador,
      ram: a.ram,
      discoDuro: a.discoDuro,
      sistemaOperativo: a.sistemaOperativo,
      imei: a.imei,
      numeroTelefono: a.numeroTelefono,
      tipoPlan: a.tipoPlan,
      operador: a.operador,
      pulgadas: a.pulgadas,
      condicion: a.condicion,
      tieneCargador: a.tieneCargador,
    });
    Promise.all(
      categorias.map((cat) =>
        // El stock que se muestra es el de la sede elegida para la solicitud.
        Promise.all([
          // Se piden hasta 100 (la lista queda con scroll propio) para poder
          // llegar a todo el stock, no solo a los primeros resultados.
          fetch(
            `/api/activos?categoriaId=${cat.id}&estado=disponible&limit=100${sedeId ? `&sedeId=${sedeId}` : ''}`
          )
            .then((res) => (res.ok ? res.json() : { pagination: { total: 0 }, data: [] }))
            .catch(() => ({ pagination: { total: 0 }, data: [] })),
        ]).then(([disponibles]) => ({
          id: cat.id,
          total: disponibles.pagination?.total ?? 0,
          items: (disponibles.data || []).map((a: EquipoDisponible) => mapearItem(a)),
        }))
      )
    ).then((resultados) => {
      if (cancelado) return;
      const mapa: Record<string, { total: number; items: EquipoDisponible[] }> = {};
      resultados.forEach((r) => {
        mapa[r.id] = { total: r.total, items: r.items };
      });
      setDisponiblesPorCategoria(mapa);
    });
    return () => {
      cancelado = true;
    };
  }, [categorias, sedeId]);

  // Catalogo de Kit de Bienvenida / EPP con stock, para poder elegir
  // articulos y cantidades especificas al crear el ticket (igual que con los
  // equipos): si no queda nada elegido, se sigue pudiendo entregar despues,
  // al gestionar la solicitud.
  useEffect(() => {
    if (tipo !== 'onboarding') return;
    let cancelado = false;
    // Catalogo de Kit/EPP de la sede de la solicitud.
    fetch(`/api/kit-items${sedeId ? `?sedeId=${sedeId}` : ''}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp'; cantidad: number }[]) => {
        if (!cancelado) setKitCatalog(items);
      })
      .catch(() => {
        if (!cancelado) setKitCatalog([]);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo, sedeId]);

  // Quita el error de uno o varios campos apenas el usuario los corrige.
  const limpiarError = (...campos: string[]) =>
    setFieldErrors((prev) => sinErrores(prev, ...campos));

  const actualizarOnboardingEmp = (campo: keyof typeof onboardingEmp, valor: string) => {
    setOnboardingEmp((prev) => ({ ...prev, [campo]: valor }));
    limpiarError(campo);
  };

  // Todos los obligatorios del onboarding (empleado nuevo o reincorporacion),
  // juntos, para marcar cada campo que falta de una vez y no solo el primero.
  const validarOnboarding = (): Record<string, string> => {
    const errores: Record<string, string> = {};

    if (modoEmpleadoOnboarding === 'nuevo') {
      for (const [campo] of CAMPOS_OBLIGATORIOS_ONBOARDING) {
        if (!onboardingEmp[campo].trim()) errores[campo] = DATO_OBLIGATORIO;
      }
      if (
        !errores.correoPersonal &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(onboardingEmp.correoPersonal.trim())
      ) {
        errores.correoPersonal = 'Correo inválido';
      }
    } else {
      if (!selectedEmployee) errores.employeeId = 'Elige el empleado que se reincorpora';
      if (!cargoSolicitadoReincorporacion.trim()) errores.cargoSolicitado = DATO_OBLIGATORIO;
    }
    if (!fechaIngreso) errores.fechaIngreso = DATO_OBLIGATORIO;

    // Se pide al menos algo (un equipo, el Kit de Bienvenida o EPP) y todo
    // lo pedido debe tener stock.
    if (categoriasRequeridas.length === 0 && !kitBienvenidaSolicitado && !eppSolicitado) {
      errores.equipos =
        'Debes seleccionar al menos un equipo, el Kit de Bienvenida o EPP para crear la solicitud.';
    } else {
      const categoriasSinStock = categoriasRequeridas.filter((nombre) => {
        const cat = categorias.find((c) => c.nombre === nombre);
        const disp = cat ? disponiblesPorCategoria[cat.id] : undefined;
        return !disp || disp.total === 0;
      });
      if (categoriasSinStock.length > 0) {
        errores.equipos = `Sin stock disponible: ${categoriasSinStock.join(', ')}. Desmarca ${
          categoriasSinStock.length === 1 ? 'esa categoría' : 'esas categorías'
        } o espera a que haya stock.`;
      }
    }

    // Coordinacion de entrega: obligatoria si se reservo al menos un equipo.
    if (Object.values(equipoSeleccionado).length > 0) {
      if (!fechaEntregaCoordinada) errores.fechaEntregaCoordinada = DATO_OBLIGATORIO;
      if (medioEntrega === 'presencial') {
        if (!lugarEntrega.trim()) errores.lugarEntrega = DATO_OBLIGATORIO;
      } else {
        if (!otChilexpressEntrega.trim()) errores.otChilexpressEntrega = DATO_OBLIGATORIO;
        if (!ciudadEntrega.trim()) errores.ciudadEntrega = DATO_OBLIGATORIO;
      }
    }

    // Kit/EPP: solo cuentan los articulos que quedaron marcados.
    const mensajesKit: string[] = [];
    for (const [categoria, solicitado, nombre] of [
      ['kit_bienvenida', kitBienvenidaSolicitado, 'Kit de Bienvenida'],
      ['epp', eppSolicitado, 'EPP'],
    ] as const) {
      if (!solicitado) continue;
      const elegidos = kitCatalog.filter(
        (it) => it.categoria === categoria && (kitCantidadesSeleccionadas[it.id] || 0) > 0
      );
      const sinStock = elegidos.filter((it) => it.cantidad < 1).map((it) => it.nombre);
      if (elegidos.length === 0) {
        mensajesKit.push(`${nombre}: elige al menos un artículo o desmarca la opción.`);
      } else if (sinStock.length > 0) {
        mensajesKit.push(`${nombre} sin stock de: ${sinStock.join(', ')}. Quita esos artículos para continuar.`);
      }
    }
    if (mensajesKit.length > 0) errores.kitEpp = mensajesKit.join(' ');

    if (!sedeId) errores.sedeId = 'Debes seleccionar una sede';
    return errores;
  };

  // Coordinacion presencial (fecha + lugar) o por Chilexpress (fecha + OT +
  // destino): mismo patron en cambio de equipo y offboarding.
  const validarCoordinacion = (
    errores: Record<string, string>,
    medio: 'presencial' | 'chilexpress',
    campos: { fecha: [string, string]; lugar: [string, string]; ot: [string, string]; destino: [string, string] }
  ) => {
    if (!campos.fecha[1]) errores[campos.fecha[0]] = DATO_OBLIGATORIO;
    if (medio === 'presencial') {
      if (!campos.lugar[1].trim()) errores[campos.lugar[0]] = DATO_OBLIGATORIO;
    } else {
      if (!campos.ot[1].trim()) errores[campos.ot[0]] = DATO_OBLIGATORIO;
      if (!campos.destino[1].trim()) errores[campos.destino[0]] = DATO_OBLIGATORIO;
    }
  };

  // Todos los obligatorios del cambio de equipo, juntos (igual que onboarding).
  const validarCambio = (): Record<string, string> => {
    const errores: Record<string, string> = {};
    if (!selectedEmployee) errores.employeeId = 'Elige el empleado';
    if (!motivoCambio.trim()) errores.motivoCambio = DATO_OBLIGATORIO;
    if (selectedEmployee) {
      if (!cambioSeleccion) {
        errores.cambioSeleccion = 'Elige el equipo a cambiar, su estado y el reemplazo';
      }
      validarCoordinacion(errores, medioCambio, {
        fecha: ['fechaCambioCoordinada', fechaCambioCoordinada],
        lugar: ['lugarCambio', lugarCambio],
        ot: ['otCambioChilexpress', otCambioChilexpress],
        destino: ['ciudadCambio', ciudadCambio],
      });
    }
    // La sede sale del empleado: sin empleado, lo que falta es elegirlo.
    if (selectedEmployee && !sedeId) errores.sedeId = 'Debes seleccionar una sede';
    return errores;
  };

  // Todos los obligatorios del offboarding: cada equipo y EPP calificado (el
  // ticket se cierra al crearse, SPEC 2.82) y la coordinacion si hay algo
  // que devolver.
  const validarOffboarding = (): Record<string, string> => {
    const errores: Record<string, string> = {};
    if (!selectedEmployee) errores.employeeId = 'Elige el empleado';
    if (!fechaDesvinculacion) errores.fechaDesvinculacion = DATO_OBLIGATORIO;
    if (selectedEmployee) {
      if (employeeAssignments.some((a) => !devolucionEstados[a.id])) {
        errores.devoluciones = 'Califica cada equipo (usa "No devolvió" si no lo entregó)';
      }
      if (employeeEppAssignments.some((k) => !devolucionEppEstados[k.id])) {
        errores.devolucionesEpp = 'Califica cada artículo de EPP';
      }
      if (employeeAssignments.length + employeeEppAssignments.length > 0) {
        validarCoordinacion(errores, medioDevolucion, {
          fecha: ['fechaDevolucionCoordinada', fechaDevolucionCoordinada],
          lugar: ['lugarDevolucion', lugarDevolucion],
          ot: ['otChilexpress', otChilexpress],
          destino: ['ciudadDevolucion', ciudadDevolucion],
        });
      }
    }
    if (selectedEmployee && !sedeId) errores.sedeId = 'Debes seleccionar una sede';
    return errores;
  };

  const handleCancelOnboarding = () => {
    setTipo('');
    setOnboardingEmp({ ...NEW_EMPLOYEE_INITIAL });
    setResumenErrores('');
    setModoEmpleadoOnboarding('nuevo');
    setCargoSolicitadoReincorporacion('');
    setTipoContratoReincorporacion('contrato');
    clearEmployee();
    setStep(1);
  };

  // Map Zod field paths to human-readable labels
  const fieldLabels: Record<string, string> = {
    tipo: 'Tipo de solicitud',
    employeeId: 'Empleado',
    fechaIngreso: 'Fecha de Ingreso',
    cargoSolicitado: 'Cargo',
    motivoCambio: 'Motivo del Cambio',
    fechaDesvinculacion: 'Fecha de Desvinculacion',
    observaciones: 'Observaciones',
  };

  const handleSubmit = async () => {
    setError('');
    setFieldErrors({});
    setResumenErrores('');

    {
      const errores =
        tipo === 'onboarding'
          ? validarOnboarding()
          : tipo === 'cambio_equipo'
            ? validarCambio()
            : validarOffboarding();
      if (Object.keys(errores).length > 0) {
        setFieldErrors(errores);
        setResumenErrores(
          `Faltan o están incorrectos: ${Object.keys(errores)
            .map((campo) => ETIQUETAS_ERROR[campo] ?? campo)
            .join(', ')}.`
        );
        enfocarPrimerError();
        return;
      }
    }

    // Defensa en profundidad ademas del "required" del select: si no se
    // eligio sede, no se manda -- evita un ticket sin sede asignada.
    if (!sedeId) {
      setFieldErrors({ sedeId: 'Debes seleccionar una sede' });
      enfocarPrimerError();
      return;
    }

    setSubmitting(true);

    try {
      // Kit de Bienvenida y EPP se manejan en su propia tabla (welcome_kit_items),
      // separada de Activos/equipos. Aqui solo se registra la intencion (si
      // corresponde entregar o no); los articulos y cantidades especificas se
      // eligen despues, al gestionar la solicitud.
      const base = {
        tipo,
        observaciones: observaciones || null,
        sedeId: sedeId || undefined,
      };

      let body: Record<string, unknown> = base;

      // cargadorOnboarding esta guardado por categoria (cat.id); se traduce
      // a assetId, que es como lo espera el backend.
      const condicionCargadorPorAsset: Record<
        string,
        { condicion: CondicionCargador; observaciones?: string }
      > = {};
      // Sin tocar el select se manda el valor por defecto que se ve en
      // pantalla; el backend lo descarta si el equipo no tiene cargador.
      for (const [catId, assetId] of Object.entries(equipoSeleccionado)) {
        condicionCargadorPorAsset[assetId] = cargadorOnboarding[catId] ?? {
          condicion: CONDICION_CARGADOR_POR_DEFECTO,
        };
      }

      if (tipo === 'onboarding' && modoEmpleadoOnboarding === 'existente') {
        // Reincorporacion: se manda el employeeId del registro ya existente
        // (no nuevoEmpleado) -- el backend lo detecta, lo reactiva
        // (desvinculado -> activo) y crea el ticket sobre el mismo Employee,
        // sin duplicar rut/correo.
        body = {
          ...base,
          employeeId: selectedEmployee!.id,
          tipoContrato: tipoContratoReincorporacion,
          fechaIngreso,
          cargoSolicitado: cargoSolicitadoReincorporacion,
          ubicacionDestino: null,
          categoriasRequeridas,
          assetIdsSeleccionados: Object.values(equipoSeleccionado),
          condicionCargadorPorAsset,
          ...(Object.values(equipoSeleccionado).length > 0 && {
            fechaEntregaCoordinada: fechaEntregaCoordinada || undefined,
            medioEntrega,
            lugarEntrega: medioEntrega === 'presencial' ? lugarEntrega || undefined : undefined,
            otChilexpressEntrega:
              medioEntrega === 'chilexpress' ? otChilexpressEntrega || undefined : undefined,
            ciudadEntrega: medioEntrega === 'chilexpress' ? ciudadEntrega || undefined : undefined,
          }),
          kitBienvenidaSolicitado,
          eppSolicitado,
          kitItemsSeleccionados: Object.entries(kitCantidadesSeleccionadas)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([itemId, cantidad]) => ({ itemId, cantidad })),
          kitItemsRequeridos: Object.entries(kitCantidadesSeleccionadas)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([itemId, cantidad]) => ({ itemId, cantidad })),
        };
      } else if (tipo === 'onboarding') {
        // El empleado nuevo se manda dentro del mismo envio (nuevoEmpleado)
        // en vez de crearse aparte primero: si algo despues falla (p.ej. un
        // activo ya no esta disponible), la transaccion del backend revierte
        // todo junto y no queda un empleado sin ticket asociado.
        body = {
          ...base,
          nuevoEmpleado: {
            nombres: onboardingEmp.nombres,
            apellidoPaterno: onboardingEmp.apellidoPaterno,
            apellidoMaterno: onboardingEmp.apellidoMaterno || null,
            correoEmpresa: onboardingEmp.correoEmpresa || null,
            correoPersonal: onboardingEmp.correoPersonal || null,
            rut: onboardingEmp.rut || null,
            cargo: onboardingEmp.cargo || null,
            supervisor: onboardingEmp.supervisor || null,
            telefonoContacto: onboardingEmp.telefonoContacto || null,
            division: onboardingEmp.division || null,
            area: onboardingEmp.area || null,
            subArea: onboardingEmp.subArea || null,
            direccionParticular: onboardingEmp.direccionParticular || null,
            listasDistribucion: onboardingEmp.listasDistribucion || null,
            ubicacion: onboardingEmp.ubicacion || null,
            tipoContrato: onboardingEmp.tipoContrato,
            estado: 'activo',
          },
          fechaIngreso,
          cargoSolicitado: onboardingEmp.cargo,
          ubicacionDestino: onboardingEmp.direccionParticular || null,
          categoriasRequeridas,
          assetIdsSeleccionados: Object.values(equipoSeleccionado),
          condicionCargadorPorAsset,
          ...(Object.values(equipoSeleccionado).length > 0 && {
            fechaEntregaCoordinada: fechaEntregaCoordinada || undefined,
            medioEntrega,
            lugarEntrega: medioEntrega === 'presencial' ? lugarEntrega || undefined : undefined,
            otChilexpressEntrega:
              medioEntrega === 'chilexpress' ? otChilexpressEntrega || undefined : undefined,
            ciudadEntrega: medioEntrega === 'chilexpress' ? ciudadEntrega || undefined : undefined,
          }),
          kitBienvenidaSolicitado,
          eppSolicitado,
          // Cada articulo elegido aca (con su cantidad) se entrega de
          // inmediato Y queda registrado como requerido individualmente
          // (RequestKitItem) -- asi el cierre del ticket puede exigir ese
          // articulo puntual en vez de solo un booleano por categoria.
          kitItemsSeleccionados: Object.entries(kitCantidadesSeleccionadas)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([itemId, cantidad]) => ({ itemId, cantidad })),
          kitItemsRequeridos: Object.entries(kitCantidadesSeleccionadas)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([itemId, cantidad]) => ({ itemId, cantidad })),
        };
      } else if (tipo === 'cambio_equipo') {
        body = {
          ...base,
          employeeId,
          motivoCambio,
          // Solo se manda si se completo la seleccion (equipo viejo + estado
          // + equipo nuevo); si no, el ticket nace en "Incidencia Detectada"
          // y se completa despues desde el detalle.
          ...(cambioSeleccion && {
            oldAssignmentId: cambioSeleccion.oldAssignmentId,
            newAssetId: cambioSeleccion.newAssetId,
            estadoDevolucionAnterior: cambioSeleccion.estadoDevolucion,
            observacionesDevolucionAnterior: cambioSeleccion.observaciones || undefined,
            // Condicion del cargador, si el equipo la trae.
            condicionCargadorAnterior: cambioSeleccion.condicionCargadorAnterior || undefined,
            observacionesCargadorAnterior:
              cambioSeleccion.observacionesCargadorAnterior || undefined,
            condicionCargadorNuevo: cambioSeleccion.condicionCargadorNuevo || undefined,
            observacionesCargadorNuevo: cambioSeleccion.observacionesCargadorNuevo || undefined,
            // Coordinacion de cambio: junto con la seleccion del equipo de
            // reemplazo, en el mismo formulario.
            fechaCambioCoordinada: fechaCambioCoordinada || undefined,
            medioCambio,
            lugarCambio: medioCambio === 'presencial' ? lugarCambio || undefined : undefined,
            otCambioChilexpress:
              medioCambio === 'chilexpress' ? otCambioChilexpress || undefined : undefined,
            ciudadCambio: medioCambio === 'chilexpress' ? ciudadCambio || undefined : undefined,
          }),
        };
      } else if (tipo === 'offboarding') {
        body = {
          ...base,
          employeeId,
          fechaDesvinculacion,
          medioDevolucion,
          otChilexpress: medioDevolucion === 'chilexpress' ? otChilexpress || undefined : undefined,
          ciudadDevolucion: medioDevolucion === 'chilexpress' ? ciudadDevolucion || undefined : undefined,
          fechaDevolucionCoordinada: fechaDevolucionCoordinada || undefined,
          lugarDevolucion: medioDevolucion === 'presencial' ? lugarDevolucion || undefined : undefined,
          // Solo se envian los equipos que efectivamente se calificaron; si
          // se dejaron sin calificar, el ticket nace igual (solicitud_emitida)
          // y se completan despues desde el detalle.
          devoluciones: employeeAssignments
            .filter((a) => devolucionEstados[a.id])
            .map((a) => ({
              assignmentId: a.id,
              estadoDevolucion: devolucionEstados[a.id],
              observaciones: devolucionObservaciones[a.id] || undefined,
              // Condicion del cargador, si el equipo la trae.
              condicionCargador: a.asset.tieneCargador
                ? devolucionCargador[a.id] || CONDICION_CARGADOR_POR_DEFECTO
                : undefined,
              observacionesCargador: a.asset.tieneCargador
                ? devolucionCargadorObservaciones[a.id] || undefined
                : undefined,
            })),
          devolucionesEpp: employeeEppAssignments
            .filter((k) => devolucionEppEstados[k.id])
            .map((k) => ({
              kitAssignmentId: k.id,
              estadoDevolucion: devolucionEppEstados[k.id],
              observaciones: devolucionEppObservaciones[k.id] || undefined,
            })),
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

  const stepDescriptions: Record<number, string> = {
    1: 'Selecciona el tipo de solicitud',
    2: tipo === 'onboarding' ? 'Datos del nuevo empleado y de la solicitud' : 'Completa los datos',
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <PageHeader
        backHref="/solicitudes"
        title="Nueva Solicitud"
        description={<>{stepDescriptions[step]}</>}
      />

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
                  // Si ya habia un empleado elegido (se volvio atras y se
                  // cambio el tipo) y el nuevo tipo es Offboarding, hay que
                  // traer sus asignaciones/EPP -- si no, quedan datos vacios
                  // o del tipo anterior y el paso de devolucion sale en
                  // blanco pese a tener un empleado seleccionado.
                  if (t.value === 'offboarding' && selectedEmployee) {
                    fetchEmployeeAssignments(selectedEmployee.id);
                  }
                  setStep(2);
                }}
                className={cn(
                  'flex items-center gap-4 p-5 border-2 rounded-xl text-left transition-all hover:shadow-md',
                  tipo === t.value ? t.color : 'border-line hover:border-line-strong'
                )}
              >
                <div className="card p-3">
                  <Icon className="h-6 w-6 text-fg-muted" />
                </div>
                <div>
                  <h3 className="font-semibold text-fg">{t.label}</h3>
                  <p className="text-sm text-fg-subtle">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Step 2 (Onboarding): crear empleado */}
      {step === 2 && tipo === 'onboarding' && (
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="font-medium text-fg">
              {modoEmpleadoOnboarding === 'nuevo' ? 'Datos del Nuevo Empleado' : 'Empleado que se reincorpora'}
            </h3>
            <p className="text-sm text-fg-subtle mt-1">
              {modoEmpleadoOnboarding === 'nuevo'
                ? 'Estos datos se guardan junto con la solicitud al presionar "Siguiente" y avanzar; el empleado se crea recién al enviar la solicitud.'
                : 'Si la persona ya trabajó aquí antes y quedó desvinculada, búscala y elígela: se reactiva automáticamente (pasa a "activo") al crear el ticket, sin crear un registro duplicado.'}
            </p>
          </div>

          {/* Nuevo vs. reincorporación: por defecto "nuevo" para no cambiar
              el flujo de siempre. "Existe" evita el error de RUT/correo
              duplicado que salía al tratar de dar de alta de nuevo a alguien
              que el sistema ya tiene registrado como desvinculado. */}
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setModoEmpleadoOnboarding('nuevo')}
              className={cn(
                'px-3 py-1.5 rounded-lg border',
                modoEmpleadoOnboarding === 'nuevo'
                  ? 'bg-brand text-white border-primary-700'
                  : 'bg-surface text-fg-muted border-line-strong hover:bg-surface-muted'
              )}
            >
              Empleado nuevo
            </button>
            <button
              type="button"
              onClick={() => setModoEmpleadoOnboarding('existente')}
              className={cn(
                'px-3 py-1.5 rounded-lg border',
                modoEmpleadoOnboarding === 'existente'
                  ? 'bg-brand text-white border-primary-700'
                  : 'bg-surface text-fg-muted border-line-strong hover:bg-surface-muted'
              )}
            >
              Ya trabajó aquí (reincorporación)
            </button>
          </div>

          {resumenErrores && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {resumenErrores}
            </div>
          )}

          {modoEmpleadoOnboarding === 'existente' && (
            <div className="space-y-4">
              <div>
                <label className="field-label mb-2">Empleado *</label>

                {selectedEmployee ? (
                  <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-fg flex items-center gap-2">
                        {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                        {selectedEmployee.apellidoMaterno ? ` ${selectedEmployee.apellidoMaterno}` : ''}
                        {selectedEmployee.estado === 'desvinculado' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                            Desvinculado — se reactivará
                          </span>
                        )}
                        {selectedEmployee.estado === 'activo' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-fg-subtle">
                            Ya está activo
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-fg-subtle">
                        {selectedEmployee.rut || '—'} · {selectedEmployee.correoPersonal ?? selectedEmployee.correoEmpresa ?? ''}
                        {selectedEmployee.cargo ? ` · ${selectedEmployee.cargo}` : ''}
                      </p>
                    </div>
                    <button onClick={clearEmployee} className="text-fg-subtle hover:text-fg-muted p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div ref={searchContainerRef} className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
                      <input
                        type="text"
                        placeholder="Buscar por nombre, RUT o correo (mín. 2 caracteres)..."
                        value={searchEmployee}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={() => {
                          if (searchResults.length > 0) setShowResults(true);
                        }}
                        aria-invalid={!!fieldErrors.employeeId}
                        className={cn(
                          'field-input pl-10 pr-10',
                          fieldErrors.employeeId && 'border-red-500 bg-red-50'
                        )}
                      />
                      {searchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle animate-spin" />
                      )}
                    </div>
                    {showResults && (
                      <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {searchResults.length > 0 ? (
                          searchResults.map((emp) => (
                            <button
                              key={emp.id}
                              onClick={() => selectEmployee(emp)}
                              className="w-full text-left px-4 py-3 hover:bg-primary-50 border-b last:border-b-0 transition-colors"
                            >
                              <span className="text-sm font-medium text-fg flex items-center gap-2">
                                {emp.nombres} {emp.apellidoPaterno}
                                {emp.apellidoMaterno ? ` ${emp.apellidoMaterno}` : ''}
                                {emp.estado === 'desvinculado' && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                                    Desvinculado
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-fg-subtle mt-0.5">
                                <span>{emp.rut || 'Sin RUT'}</span>
                                <span>·</span>
                                <span>{emp.correoPersonal ?? emp.correoEmpresa ?? ''}</span>
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
                          <p className="px-4 py-6 text-center text-sm text-fg-subtle">
                            No se encontraron empleados para &quot;{searchEmployee}&quot;. Si no existe, usa
                            &quot;Empleado nuevo&quot; arriba.
                          </p>
                        )}
                      </div>
                    )}
                    <MensajeCampo mensaje={fieldErrors.employeeId} />
                    {!fieldErrors.employeeId && !showResults && searchEmployee.length === 0 && (
                      <p className="text-xs text-fg-subtle mt-1">
                        Escribe al menos 2 caracteres para buscar.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <CampoTexto
                  label="Cargo Solicitado"
                  obligatorio
                  error={fieldErrors.cargoSolicitado}
                  value={cargoSolicitadoReincorporacion}
                  onChange={(v) => {
                    setCargoSolicitadoReincorporacion(v);
                    limpiarError('cargoSolicitado');
                  }}
                  placeholder="Puede ser el mismo cargo anterior u otro"
                />
                <CampoFormulario
                  label="Tipo Contrato"
                  obligatorio
                  ayuda="Puede haber cambiado desde la vez anterior."
                >
                  <select
                    value={tipoContratoReincorporacion}
                    onChange={(e) => setTipoContratoReincorporacion(e.target.value)}
                    className={claseInput()}
                  >
                    <option value="contrato">Contrato</option>
                    <option value="boleta">Boleta</option>
                  </select>
                </CampoFormulario>
                <CampoTexto
                  label="Fecha de Ingreso"
                  obligatorio
                  type="date"
                  error={fieldErrors.fechaIngreso}
                  value={fechaIngreso}
                  onChange={(v) => {
                    setFechaIngreso(v);
                    limpiarError('fechaIngreso');
                  }}
                />
              </div>
            </div>
          )}

          {modoEmpleadoOnboarding === 'nuevo' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <CampoTexto
                  label="Nombres"
                  obligatorio
                  error={fieldErrors.nombres}
                  value={onboardingEmp.nombres}
                  onChange={(v) => actualizarOnboardingEmp('nombres', v)}
                />
                <CampoTexto
                  label="Apellido Paterno"
                  obligatorio
                  error={fieldErrors.apellidoPaterno}
                  value={onboardingEmp.apellidoPaterno}
                  onChange={(v) => actualizarOnboardingEmp('apellidoPaterno', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <CampoTexto
                  label="Apellido Materno"
                  obligatorio
                  error={fieldErrors.apellidoMaterno}
                  value={onboardingEmp.apellidoMaterno}
                  onChange={(v) => actualizarOnboardingEmp('apellidoMaterno', v)}
                />
                <CampoTexto
                  label="RUT"
                  obligatorio
                  error={fieldErrors.rut}
                  value={onboardingEmp.rut}
                  onChange={(v) => actualizarOnboardingEmp('rut', v)}
                  placeholder="12.345.678-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <CampoTexto
                  label="Correo Personal"
                  obligatorio
                  type="email"
                  error={fieldErrors.correoPersonal}
                  value={onboardingEmp.correoPersonal}
                  onChange={(v) => actualizarOnboardingEmp('correoPersonal', v)}
                  placeholder="nombre.personal@gmail.com"
                />
                <CampoTexto
                  label="Correo Empresa"
                  type="email"
                  value={onboardingEmp.correoEmpresa}
                  onChange={(v) => actualizarOnboardingEmp('correoEmpresa', v)}
                  placeholder="nombre@sclconsultores.com (opcional)"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <CampoTexto
                  label="Cargo"
                  obligatorio
                  error={fieldErrors.cargo}
                  value={onboardingEmp.cargo}
                  onChange={(v) => actualizarOnboardingEmp('cargo', v)}
                />
                <CampoFormulario label="Tipo Contrato" obligatorio>
                  <select
                    value={onboardingEmp.tipoContrato}
                    onChange={(e) => actualizarOnboardingEmp('tipoContrato', e.target.value)}
                    className={claseInput()}
                  >
                    <option value="contrato">Contrato</option>
                    <option value="boleta">Boleta</option>
                  </select>
                </CampoFormulario>
                <CampoTexto
                  label="Fecha de Ingreso"
                  obligatorio
                  type="date"
                  error={fieldErrors.fechaIngreso}
                  value={fechaIngreso}
                  onChange={(v) => {
                    setFechaIngreso(v);
                    limpiarError('fechaIngreso');
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <CampoTexto
                  label="División"
                  value={onboardingEmp.division}
                  onChange={(v) => actualizarOnboardingEmp('division', v)}
                  placeholder="Ej: SCL"
                />
                <CampoTexto
                  label="Área"
                  value={onboardingEmp.area}
                  onChange={(v) => actualizarOnboardingEmp('area', v)}
                  placeholder="Ej: RPA y Soporte IT"
                />
                <CampoTexto
                  label="Sub-Área"
                  value={onboardingEmp.subArea}
                  onChange={(v) => actualizarOnboardingEmp('subArea', v)}
                  placeholder="Ej: RPA"
                />
              </div>
              <CampoTexto
                label="Supervisor"
                obligatorio
                error={fieldErrors.supervisor}
                value={onboardingEmp.supervisor}
                onChange={(v) => actualizarOnboardingEmp('supervisor', v)}
                placeholder="Nombre del supervisor directo"
              />
              <CampoTexto
                label="Celular Contacto"
                obligatorio
                error={fieldErrors.telefonoContacto}
                value={onboardingEmp.telefonoContacto}
                onChange={(v) => actualizarOnboardingEmp('telefonoContacto', v)}
                placeholder="+56 9 1234 5678"
              />
              <CampoTexto
                label="Dirección Particular"
                obligatorio
                error={fieldErrors.direccionParticular}
                value={onboardingEmp.direccionParticular}
                onChange={(v) => actualizarOnboardingEmp('direccionParticular', v)}
                placeholder="Incluir comuna y región"
              />
              <CampoTexto
                label="Listas de Distribución"
                value={onboardingEmp.listasDistribucion}
                onChange={(v) => actualizarOnboardingEmp('listasDistribucion', v)}
                placeholder="Ej: SCL Masivo, Corporativo..."
              />
            </div>
          )}

          {/* Responsable de la solicitud (solo lectura) */}
          <div className="border-t pt-4">
            <label className="field-label">Responsable</label>
            <input
              type="text"
              value={
                session?.user?.name
                  ? `${session.user.name}${session.user.email ? ` (${session.user.email})` : ''}`
                  : 'Cargando...'
              }
              disabled
              className="w-full px-3 py-2 border border-line rounded-lg bg-surface-muted text-fg-muted"
            />
          </div>

          <div>
            <label className="field-label mb-2">
              Equipos Requeridos *
            </label>
            <AvisoSeccion mensaje={fieldErrors.equipos} className="mb-2" />
            {categorias.length === 0 ? (
              <p className="text-sm text-fg-subtle">Cargando categorías...</p>
            ) : (
              <div className="flex flex-col gap-2">
                {categorias.map((cat) => {
                  const disp = disponiblesPorCategoria[cat.id];
                  const expandida = categoriaExpandida === cat.id;
                  const seleccionado = equipoSeleccionado[cat.id];
                  const equipoElegido = seleccionado
                    ? disp?.items.find((item) => item.id === seleccionado)
                    : undefined;
                  const conStock = !!disp && disp.total > 0;
                  // La categoria queda requerida solo al elegir un equipo
                  // concreto: la casilla va en el equipo, no en la categoria.
                  const elegirEquipo = (itemId: string | null) => {
                    // Con un equipo elegido la sede queda fijada: un cambio
                    // del navbar no debe dejarlo en otra sede.
                    if (itemId) setSedeId(sedeId);
                    setEquipoSeleccionado((prev) => {
                      const next = { ...prev };
                      if (itemId) next[cat.id] = itemId;
                      else delete next[cat.id];
                      return next;
                    });
                    setCategoriasRequeridas((prev) =>
                      toggleCategoriaRequerida(prev, cat.nombre, itemId !== null)
                    );
                    limpiarError('equipos', 'fechaEntregaCoordinada', 'lugarEntrega', 'otChilexpressEntrega', 'ciudadEntrega');
                  };
                  return (
                    <div key={cat.id} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => conStock && setCategoriaExpandida(expandida ? null : cat.id)}
                        disabled={!conStock}
                        className={cn(
                          'flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5',
                          conStock ? 'hover:bg-surface-muted' : 'cursor-not-allowed opacity-70'
                        )}
                      >
                        <span className="flex items-center gap-1 text-sm flex-1">
                          <CategoryIcon categoria={cat.nombre} className="h-4 w-4" />
                          {cat.nombre}
                          {equipoElegido && (
                            <span className="ml-2 text-xs text-fg-subtle truncate">
                              — {equipoElegido.marca} {equipoElegido.modelo}
                            </span>
                          )}
                        </span>
                        {seleccionado && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 border border-primary-200">
                            Reservado
                          </span>
                        )}
                        {disp !== undefined && (
                          <span
                            className={cn(
                              'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
                              conStock
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            )}
                          >
                            {disp.total} disponible{disp.total === 1 ? '' : 's'}
                            {conStock && (expandida ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                          </span>
                        )}
                      </button>
                      {expandida && disp && disp.items.length > 0 && (
                        <div className="ml-6 mt-1 mb-1 space-y-0.5">
                          <p className="text-xs text-fg-subtle">
                            Marca el equipo que se entregará (uno por categoría).
                          </p>
                          <ul className="text-xs text-fg-muted space-y-0.5 max-h-60 overflow-y-auto pr-1">
                            {disp.items.map((item) => (
                              <li key={item.id}>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={seleccionado === item.id}
                                    onChange={(e) => elegirEquipo(e.target.checked ? item.id : null)}
                                    className="rounded border-line-strong"
                                  />
                                  <span>
                                    {item.marca} {item.modelo}
                                    {item.numeroSerie ? ` — N° serie ${item.numeroSerie}` : ''}
                                    {item.condicion === 'usado' && (
                                      <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                                        Usado
                                      </span>
                                    )}
                                    {especificacionesEquipo(item) && (
                                      <span className="block text-fg-subtle">
                                        {especificacionesEquipo(item)}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                          {disp.total > disp.items.length && (
                            <p className="text-fg-subtle">y {disp.total - disp.items.length} más...</p>
                          )}
                        </div>
                      )}
                      {/* Estado del cargador del equipo reservado, solo si es
                          un notebook con cargador. */}
                      {seleccionado &&
                        disp?.items.find((item) => item.id === seleccionado)?.tieneCargador && (
                          <div className="ml-6 mt-1 mb-1 border border-line rounded-lg p-2">
                            <p className="text-xs font-medium text-fg-muted mb-1">
                              Estado del cargador
                            </p>
                            <SelectCondicionCargador
                              contexto="entrega"
                              value={cargadorOnboarding[cat.id]?.condicion}
                              onChange={(condicion) =>
                                setCargadorOnboarding((prev) => ({
                                  ...prev,
                                  [cat.id]: {
                                    condicion,
                                    observaciones: prev[cat.id]?.observaciones || '',
                                  },
                                }))
                              }
                              className="w-full px-2 py-1.5 text-xs border border-line-strong rounded mb-1"
                            />
                            <input
                              type="text"
                              value={cargadorOnboarding[cat.id]?.observaciones || ''}
                              onChange={(e) =>
                                setCargadorOnboarding((prev) => ({
                                  ...prev,
                                  [cat.id]: {
                                    condicion: prev[cat.id]?.condicion || CONDICION_CARGADOR_POR_DEFECTO,
                                    observaciones: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Observación (opcional)"
                              className="w-full px-2 py-1.5 text-xs border border-line-strong rounded"
                            />
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Coordinacion de entrega: se pide junto con la eleccion de
              equipos, en vez de en un paso aparte despues, y solo tiene
              sentido si ya se reservo al menos un equipo. */}
          {Object.values(equipoSeleccionado).length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-medium text-fg mb-1">Coordinar Entrega</h3>
              <p className="text-xs text-fg-subtle mb-3">
                Define cuándo y cómo se le hará llegar el equipo reservado.
              </p>
              <div className="space-y-3">
                <CampoTexto
                  label={medioEntrega === 'presencial' ? 'Fecha y hora de entrega' : 'Fecha y hora de entrega estimada'}
                  obligatorio
                  type="datetime-local"
                  error={fieldErrors.fechaEntregaCoordinada}
                  value={fechaEntregaCoordinada}
                  onChange={(v) => {
                    setFechaEntregaCoordinada(v);
                    limpiarError('fechaEntregaCoordinada');
                  }}
                />
                <div>
                  <label className="field-label">Medio</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioEntregaNueva"
                        checked={medioEntrega === 'presencial'}
                        onChange={() => {
                          setMedioEntrega('presencial');
                          limpiarError('otChilexpressEntrega', 'ciudadEntrega');
                        }}
                      />
                      Presencial
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioEntregaNueva"
                        checked={medioEntrega === 'chilexpress'}
                        onChange={() => {
                          setMedioEntrega('chilexpress');
                          limpiarError('lugarEntrega');
                        }}
                      />
                      Despacho (Chilexpress)
                    </label>
                  </div>
                </div>
                {medioEntrega === 'presencial' ? (
                  <CampoTexto
                    label="Lugar de entrega"
                    obligatorio
                    error={fieldErrors.lugarEntrega}
                    value={lugarEntrega}
                    onChange={(v) => {
                      setLugarEntrega(v);
                      limpiarError('lugarEntrega');
                    }}
                    placeholder="ej: Oficina Santiago, piso 4"
                  />
                ) : (
                  <>
                    <CampoTexto
                      label="N° de OT Chilexpress"
                      obligatorio
                      error={fieldErrors.otChilexpressEntrega}
                      value={otChilexpressEntrega}
                      onChange={(v) => {
                        setOtChilexpressEntrega(v);
                        limpiarError('otChilexpressEntrega');
                      }}
                      placeholder="ej: CH-2026-004567"
                    />
                    <CampoTexto
                      label="Ubicación de destino"
                      obligatorio
                      error={fieldErrors.ciudadEntrega}
                      value={ciudadEntrega}
                      onChange={(v) => {
                        setCiudadEntrega(v);
                        limpiarError('ciudadEntrega');
                      }}
                      placeholder="ej: Hotel HD Express, Concepción"
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Kit de Bienvenida / EPP: aparte de Equipos Requeridos, no son Activos */}
          <div className="border-t pt-4">
            <h3 className="font-medium text-fg mb-1">Kit de Bienvenida y EPP</h3>
            <p className="text-xs text-fg-subtle mb-3">
              {kitEppBloqueadoPorContrato
                ? 'No aplica para boleta de honorarios: solo se entrega a personal con contrato.'
                : 'Al marcar una opción se seleccionan todos sus artículos (1 de cada uno); puedes quitar los que no correspondan. No se puede crear la solicitud con artículos sin stock marcados.'}
            </p>
            <AvisoSeccion mensaje={fieldErrors.kitEpp} className="mb-3" />
            <div className="flex flex-col gap-2">
              {(['kit_bienvenida', 'epp'] as const).map((categoria) => {
                const items = kitCatalog.filter((it) => it.categoria === categoria);
                const total = items.reduce((sum, it) => sum + it.cantidad, 0);
                const expandida = kitCategoriaExpandida === categoria;
                const requerida = categoria === 'kit_bienvenida' ? kitBienvenidaSolicitado : eppSolicitado;
                const setRequerida = categoria === 'kit_bienvenida' ? setKitBienvenidaSolicitado : setEppSolicitado;
                const label = categoria === 'kit_bienvenida' ? 'Kit de Bienvenida' : 'EPP';
                const seleccionCount = items.filter((it) => (kitCantidadesSeleccionadas[it.id] || 0) > 0).length;
                return (
                  <div key={categoria} className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <label
                        className={cn(
                          'flex items-center gap-2 flex-1',
                          kitEppBloqueadoPorContrato && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={requerida}
                          disabled={kitEppBloqueadoPorContrato}
                          onChange={(e) => {
                            const marcado = e.target.checked;
                            setRequerida(marcado);
                            limpiarError('kitEpp', 'equipos');
                            // El stock de Kit/EPP es por sede: fija la sede.
                            if (marcado) setSedeId(sedeId);
                            // Al marcar se seleccionan todos los articulos (1
                            // de cada uno); despues se pueden quitar uno a uno.
                            setKitCantidadesSeleccionadas((prev) => {
                              const next = { ...prev };
                              items.forEach((it) => {
                                if (marcado) next[it.id] = 1;
                                else delete next[it.id];
                              });
                              return next;
                            });
                            if (marcado) setKitCategoriaExpandida(categoria);
                          }}
                          className="rounded border-line-strong"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                      {seleccionCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 border border-primary-200">
                          Reservado
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setKitCategoriaExpandida(expandida ? null : categoria)}
                        className={cn(
                          'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
                          total > 0
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        )}
                      >
                        {total} disponible{total === 1 ? '' : 's'}
                        {total > 0 && (expandida ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </button>
                    </div>
                    {expandida && items.length > 0 && (
                      <div className="ml-6 mt-1 mb-1 space-y-1">
                        <p className="text-xs text-fg-subtle">
                          {requerida
                            ? 'Se reserva 1 de cada artículo marcado. Quita los que no correspondan:'
                            : `Incluye (1 de cada uno al marcar "${label}"):`}
                        </p>
                        {items.map((it) => {
                          const elegido = (kitCantidadesSeleccionadas[it.id] || 0) > 0;
                          return (
                            <label
                              key={it.id}
                              className={cn(
                                'flex items-center justify-between gap-3 text-xs',
                                !requerida && 'opacity-60 cursor-not-allowed'
                              )}
                            >
                              <span className="flex items-center gap-2 text-fg-muted">
                                <input
                                  type="checkbox"
                                  checked={elegido}
                                  disabled={!requerida}
                                  onChange={(e) => {
                                    const marcarItem = e.target.checked;
                                    setKitCantidadesSeleccionadas((prev) => {
                                      const next = { ...prev };
                                      if (marcarItem) next[it.id] = 1;
                                      else delete next[it.id];
                                      return next;
                                    });
                                    limpiarError('kitEpp');
                                  }}
                                  className="rounded border-line-strong"
                                />
                                {it.nombre} <span className="text-fg-subtle">({it.cantidad} disp.)</span>
                              </span>
                              {it.cantidad < 1 ? (
                                <span className={elegido ? 'text-red-600 font-medium' : 'text-fg-subtle'}>
                                  Sin stock
                                </span>
                              ) : (
                                elegido && <span className="text-fg">1 unidad</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field-label">
              Sede <span className="text-red-500">*</span>
            </label>
            <select
              value={sedeId}
              onChange={(e) => {
                setSedeId(e.target.value);
                limpiarError('sedeId');
              }}
              required
              disabled={!esAdminSede}
              aria-invalid={!!fieldErrors.sedeId}
              className={cn(
                claseInput(fieldErrors.sedeId),
                'disabled:bg-surface-muted disabled:text-fg-muted disabled:cursor-not-allowed'
              )}
            >
              <option value="" disabled>
                Selecciona una sede...
              </option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
            <MensajeCampo mensaje={fieldErrors.sedeId} />
            <p className="text-xs text-fg-subtle mt-1">
              {esAdminSede
                ? 'Obligatorio: a qué sede pertenece esta solicitud.'
                : 'Es tu sede: la solicitud queda registrada en ella.'}
            </p>
          </div>

          {/* Observaciones */}
          <div>
            <label className="field-label">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-line-strong rounded-lg"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={handleCancelOnboarding}
              className="px-4 py-2 text-fg-muted hover:text-fg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={buttonClasses({ className: "px-6" })}
            >
              {submitting ? 'Creando...' : 'Crear Solicitud'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 (Cambio de Equipo / Offboarding): formulario con búsqueda de empleado */}
      {step === 2 && tipo !== 'onboarding' && tipo !== '' && (
        <div className="card p-6 space-y-6">
          {resumenErrores && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {resumenErrores}
            </div>
          )}

          {/* Employee Selection */}
          <div>
            <label className={cn(
              'block text-sm font-medium mb-2',
              fieldErrors.employeeId ? 'text-red-600' : 'text-fg-muted'
            )}>
              Empleado *
              {fieldErrors.employeeId && (
                <span className="ml-2 text-xs font-normal">({fieldErrors.employeeId})</span>
              )}
            </label>

            {selectedEmployee ? (
              <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg p-3">
                <div>
                  <p className="font-medium text-fg">
                    {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                    {selectedEmployee.apellidoMaterno ? ` ${selectedEmployee.apellidoMaterno}` : ''}
                  </p>
                  <p className="text-sm text-fg-subtle">
                    {selectedEmployee.rut || '—'} · {selectedEmployee.correoPersonal ?? selectedEmployee.correoEmpresa ?? ''}
                    {selectedEmployee.cargo ? ` · ${selectedEmployee.cargo}` : ''}
                  </p>
                </div>
                <button
                  onClick={clearEmployee}
                  className="text-fg-subtle hover:text-fg-muted p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div ref={searchContainerRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, RUT o correo (mín. 2 caracteres)..."
                    value={searchEmployee}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => {
                      if (searchResults.length > 0) setShowResults(true);
                    }}
                    aria-invalid={!!fieldErrors.employeeId}
                    className={cn(
                      'field-input pl-10 pr-10',
                      fieldErrors.employeeId && 'border-red-500 bg-red-50'
                    )}
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle animate-spin" />
                  )}
                </div>

                {/* Search Results Dropdown */}
                {showResults && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {searchResults.length > 0 ? (
                      searchResults.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => selectEmployee(emp)}
                          className="w-full text-left px-4 py-3 hover:bg-primary-50 border-b last:border-b-0 transition-colors"
                        >
                          <span className="text-sm font-medium text-fg">
                            {emp.nombres} {emp.apellidoPaterno}
                            {emp.apellidoMaterno ? ` ${emp.apellidoMaterno}` : ''}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-fg-subtle mt-0.5">
                            <span>{emp.rut || 'Sin RUT'}</span>
                            <span>·</span>
                            <span>{emp.correoPersonal ?? emp.correoEmpresa ?? ''}</span>
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
                        <p className="text-sm text-fg-subtle mb-3">
                          No se encontraron empleados para &quot;{searchEmployee}&quot;
                        </p>
                        <button
                          onClick={openCreateModal}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-success-hover transition-colors"
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
                        className="w-full text-left px-4 py-3 hover:bg-green-50 border-t border-line transition-colors flex items-center gap-2"
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
                  <p className="text-xs text-fg-subtle mt-1">
                    Escribe al menos 2 caracteres para buscar. Si no existe,{' '}
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="text-primary-700 hover:underline"
                    >
                      crea uno nuevo
                    </button>
                    .
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Responsable de la solicitud (solo lectura) */}
          <div>
            <label className="field-label">Responsable</label>
            <input
              type="text"
              value={
                session?.user?.name
                  ? `${session.user.name}${session.user.email ? ` (${session.user.email})` : ''}`
                  : 'Cargando...'
              }
              disabled
              className="w-full px-3 py-2 border border-line rounded-lg bg-surface-muted text-fg-muted"
            />
          </div>

          {tipo === 'cambio_equipo' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-fg">Datos del Cambio</h3>

              <div>
                <label className={cn(
                  'block text-sm font-medium mb-1',
                  fieldErrors.motivoCambio ? 'text-red-600' : 'text-fg-muted'
                )}>
                  Motivo del Cambio *
                </label>
                <textarea
                  value={motivoCambio}
                  onChange={(e) => {
                    setMotivoCambio(e.target.value);
                    limpiarError('motivoCambio');
                  }}
                  placeholder="Ej: Sobrecalentamiento, pantalla danada..."
                  rows={3}
                  aria-invalid={!!fieldErrors.motivoCambio}
                  className={claseInput(fieldErrors.motivoCambio)}
                />
                <MensajeCampo mensaje={fieldErrors.motivoCambio} />
              </div>

              {/* Equipo a cambiar + reemplazo: obligatorio para poder crear la
                  solicitud (ver validacion en handleSubmit). */}
              {selectedEmployee && (
                <div>
                  <label className={cn(
                    'block text-sm font-medium mb-2',
                    fieldErrors.cambioSeleccion ? 'text-red-600' : 'text-fg-muted'
                  )}>
                    Equipo a cambiar *
                  </label>
                  <AvisoSeccion mensaje={fieldErrors.cambioSeleccion} className="mb-2" />
                  {loadingAssignments ? (
                    <div className="flex items-center gap-2 text-fg-subtle text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : (
                    <SeleccionarCambioEquipo
                      asignacionesActivas={employeeAssignments}
                      // Reemplazos solo de la sede de la solicitud (la del empleado).
                      sedeId={sedeId}
                      submitting={submitting}
                      showSubmitButton={false}
                      onChange={(sel) => {
                        setCambioSeleccion(sel);
                        if (sel) setFieldErrors((prev) => { const { cambioSeleccion: _, ...rest } = prev; return rest; });
                      }}
                    />
                  )}
                </div>
              )}

              {/* Coordinacion de cambio: se muestra siempre junto con la
                  seleccion del equipo, igual que "Coordinar Entrega" en
                  Onboarding y "Coordinar Devolucion" en Offboarding. */}
              {selectedEmployee && (
                <>
                  <hr className="border-line" />
                  <div>
                    <h4 className="font-medium text-fg mb-1">Coordinar Entrega del Reemplazo</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="field-label">
                        {medioCambio === 'presencial' ? 'Fecha y hora del cambio' : 'Fecha estimada de llegada'}
                      </label>
                      <input
                        type="datetime-local"
                        value={fechaCambioCoordinada}
                        onChange={(e) => {
                          setFechaCambioCoordinada(e.target.value);
                          limpiarError('fechaCambioCoordinada');
                        }}
                        aria-invalid={!!fieldErrors.fechaCambioCoordinada}
                        className={cn(claseInput(fieldErrors.fechaCambioCoordinada), 'text-sm')}
                      />
                      <MensajeCampo mensaje={fieldErrors.fechaCambioCoordinada} />
                    </div>
                    <div>
                      <label className="field-label">Medio</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="medioCambioNueva"
                            checked={medioCambio === 'presencial'}
                            onChange={() => setMedioCambio('presencial')}
                          />
                          Presencial
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="medioCambioNueva"
                            checked={medioCambio === 'chilexpress'}
                            onChange={() => setMedioCambio('chilexpress')}
                          />
                          Despacho (Chilexpress)
                        </label>
                      </div>
                    </div>
                    {medioCambio === 'presencial' ? (
                      <div>
                        <label className="field-label">Lugar</label>
                        <input
                          type="text"
                          value={lugarCambio}
                          onChange={(e) => {
                            setLugarCambio(e.target.value);
                            limpiarError('lugarCambio');
                          }}
                          placeholder="ej: Oficina Santiago, piso 4"
                          aria-invalid={!!fieldErrors.lugarCambio}
                          className={cn(claseInput(fieldErrors.lugarCambio), 'text-sm')}
                        />
                        <MensajeCampo mensaje={fieldErrors.lugarCambio} />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="field-label">
                            N° de OT Chilexpress
                          </label>
                          <input
                            type="text"
                            value={otCambioChilexpress}
                            onChange={(e) => {
                              setOtCambioChilexpress(e.target.value);
                              limpiarError('otCambioChilexpress');
                            }}
                            placeholder="ej: CH-2026-004567"
                            aria-invalid={!!fieldErrors.otCambioChilexpress}
                            className={cn(claseInput(fieldErrors.otCambioChilexpress), 'text-sm')}
                          />
                          <MensajeCampo mensaje={fieldErrors.otCambioChilexpress} />
                        </div>
                        <div>
                          <label className="field-label">
                            Ubicación de destino
                          </label>
                          <input
                            type="text"
                            value={ciudadCambio}
                            onChange={(e) => {
                              setCiudadCambio(e.target.value);
                              limpiarError('ciudadCambio');
                            }}
                            placeholder="ej: Hotel HD Express, Concepción"
                            aria-invalid={!!fieldErrors.ciudadCambio}
                            className={cn(claseInput(fieldErrors.ciudadCambio), 'text-sm')}
                          />
                          <MensajeCampo mensaje={fieldErrors.ciudadCambio} />
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tipo === 'offboarding' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-fg">Datos de Devolucion</h3>

              {/* Equipos actuales del empleado */}
              {selectedEmployee && (
                <div>
                  <label className="field-label mb-2">
                    Equipos a devolver *
                  </label>
                  <MensajeCampo mensaje={fieldErrors.devoluciones} />
                  {loadingAssignments ? (
                    <div className="flex items-center gap-2 text-fg-subtle text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : employeeAssignments.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs text-fg-subtle">
                        Califica cada equipo: el ticket se cierra al enviarse. Si el empleado no
                        lo entregó, marca &quot;No devolvió&quot;.
                      </p>
                      <div className="space-y-2">
                        {employeeAssignments.map((a) => {
                          const asset = a.asset;
                          return (
                            <div
                              key={a.id}
                              // Sin calificar tras intentar enviar: en rojo y enfocable,
                              // para que enfocarPrimerError() lleve hasta aca.
                              tabIndex={-1}
                              aria-invalid={!!fieldErrors.devoluciones && !devolucionEstados[a.id]}
                              className={cn(
                                'p-3 rounded-lg border outline-none',
                                fieldErrors.devoluciones && !devolucionEstados[a.id]
                                  ? 'bg-red-50 border-red-500'
                                  : 'bg-orange-50 border-orange-200'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-orange-100 rounded-lg text-orange-700">
                                  <CategoryIcon categoria={asset.categoria.nombre} className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-fg">
                                    {asset.categoria.nombre}: {asset.marca} {asset.modelo}
                                  </p>
                                  <p className="text-xs text-fg-subtle">
                                    Serie: {asset.numeroSerie || 'Sin serie'}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 pl-1 space-y-2">
                                  <div className="flex gap-4 text-sm text-fg-muted">
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`devolucion-${a.id}`}
                                        checked={devolucionEstados[a.id] === 'ok'}
                                        onChange={() => {
                                          limpiarError('devoluciones');
                                          setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'ok' }));
                                        }}
                                      />
                                      Buen estado
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`devolucion-${a.id}`}
                                        checked={devolucionEstados[a.id] === 'danado'}
                                        onChange={() => {
                                          limpiarError('devoluciones');
                                          setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'danado' }));
                                        }}
                                      />
                                      Dañado
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`devolucion-${a.id}`}
                                        checked={devolucionEstados[a.id] === 'no_devuelto'}
                                        onChange={() => {
                                          limpiarError('devoluciones');
                                          setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'no_devuelto' }));
                                        }}
                                      />
                                      No devolvió
                                    </label>
                                  </div>
                                  <input
                                    type="text"
                                    value={devolucionObservaciones[a.id] || ''}
                                    onChange={(e) =>
                                      setDevolucionObservaciones((prev) => ({
                                        ...prev,
                                        [a.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Observaciones (opcional)"
                                    className="w-full px-2 py-1.5 text-sm border border-line-strong rounded"
                                  />
                                  {/* Estado del cargador, solo si el equipo
                                      es un notebook con cargador. */}
                                  {asset.tieneCargador && (
                                    <div className="border border-line rounded-lg p-2 bg-surface">
                                      <p className="text-xs font-medium text-fg-muted mb-1">
                                        Estado del cargador
                                      </p>
                                      <SelectCondicionCargador
                                        contexto="devolucion"
                                        value={devolucionCargador[a.id]}
                                        onChange={(condicion) =>
                                          setDevolucionCargador((prev) => ({ ...prev, [a.id]: condicion }))
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-line-strong rounded mb-1"
                                      />
                                      <input
                                        type="text"
                                        value={devolucionCargadorObservaciones[a.id] || ''}
                                        onChange={(e) =>
                                          setDevolucionCargadorObservaciones((prev) => ({
                                            ...prev,
                                            [a.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Observación del cargador (opcional)"
                                        className="w-full px-2 py-1.5 text-sm border border-line-strong rounded"
                                      />
                                    </div>
                                  )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Este empleado no tiene equipos asignados actualmente
                    </div>
                  )}
                </div>
              )}

              {/* EPP entregado y pendiente de devolver. El Kit de Bienvenida
                  no se pide de vuelta -- es consumible. */}
              {selectedEmployee && employeeEppAssignments.length > 0 && (
                <div>
                  <label className="field-label mb-2">
                    EPP a devolver *
                  </label>
                  <MensajeCampo mensaje={fieldErrors.devolucionesEpp} />
                  <div className="space-y-2">
                    {employeeEppAssignments.map((k) => (
                      <div
                        key={k.id}
                        tabIndex={-1}
                        aria-invalid={!!fieldErrors.devolucionesEpp && !devolucionEppEstados[k.id]}
                        className={cn(
                          'p-3 rounded-lg border outline-none',
                          fieldErrors.devolucionesEpp && !devolucionEppEstados[k.id]
                            ? 'bg-red-50 border-red-500'
                            : 'bg-orange-50 border-orange-200'
                        )}
                      >
                        <p className="text-sm font-medium text-fg mb-2">{k.item.nombre}</p>
                        <div className="flex gap-4 text-sm text-fg-muted mb-2">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'ok'}
                              onChange={() => {
                                limpiarError('devolucionesEpp');
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'ok' }));
                              }}
                            />
                            Buen estado
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'danado'}
                              onChange={() => {
                                limpiarError('devolucionesEpp');
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'danado' }));
                              }}
                            />
                            Dañado
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'no_devuelto'}
                              onChange={() => {
                                limpiarError('devolucionesEpp');
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'no_devuelto' }));
                              }}
                            />
                            No devolvió
                          </label>
                        </div>
                        <input
                          type="text"
                          value={devolucionEppObservaciones[k.id] || ''}
                          onChange={(e) =>
                            setDevolucionEppObservaciones((prev) => ({
                              ...prev,
                              [k.id]: e.target.value,
                            }))
                          }
                          placeholder="Observaciones (opcional)"
                          className="w-full px-2 py-1.5 text-sm border border-line-strong rounded"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={cn(
                  'block text-sm font-medium mb-1',
                  fieldErrors.fechaDesvinculacion ? 'text-red-600' : 'text-fg-muted'
                )}>
                  Fecha Desvinculacion *
                </label>
                <input
                  type="date"
                  value={fechaDesvinculacion}
                  onChange={(e) => { setFechaDesvinculacion(e.target.value); setFieldErrors((prev) => { const { fechaDesvinculacion: _, ...rest } = prev; return rest; }); }}
                  aria-invalid={!!fieldErrors.fechaDesvinculacion}
                  className={cn(claseInput(fieldErrors.fechaDesvinculacion), 'max-w-xs')}
                />
                <MensajeCampo mensaje={fieldErrors.fechaDesvinculacion} />
              </div>

              {/* Coordinacion de devolucion en su propia tarjeta, separada de
                  los datos de la desvinculacion. Mismo patron
                  presencial/chilexpress que Onboarding y Cambio de Equipo. */}
              <hr className="border-line" />
              <div>
                <h4 className="font-medium text-fg mb-1">Coordinar Devolución</h4>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Medio</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="medioDevolucionNueva"
                          checked={medioDevolucion === 'presencial'}
                          onChange={() => setMedioDevolucion('presencial')}
                        />
                        Presencial
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="medioDevolucionNueva"
                          checked={medioDevolucion === 'chilexpress'}
                          onChange={() => setMedioDevolucion('chilexpress')}
                        />
                        Despacho (Chilexpress)
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">
                      {medioDevolucion === 'presencial'
                        ? 'Fecha y hora de la devolución'
                        : 'Fecha estimada de llegada'}
                    </label>
                    <input
                      type="datetime-local"
                      value={fechaDevolucionCoordinada}
                      onChange={(e) => {
                        setFechaDevolucionCoordinada(e.target.value);
                        limpiarError('fechaDevolucionCoordinada');
                      }}
                      aria-invalid={!!fieldErrors.fechaDevolucionCoordinada}
                      className={cn(claseInput(fieldErrors.fechaDevolucionCoordinada), 'text-sm')}
                    />
                    <MensajeCampo mensaje={fieldErrors.fechaDevolucionCoordinada} />
                  </div>
                  {medioDevolucion === 'presencial' ? (
                    <div>
                      <label className="field-label">
                        Lugar de devolución
                      </label>
                      <input
                        type="text"
                        value={lugarDevolucion}
                        onChange={(e) => {
                          setLugarDevolucion(e.target.value);
                          limpiarError('lugarDevolucion');
                        }}
                        placeholder="ej: Oficina Santiago, piso 4"
                        aria-invalid={!!fieldErrors.lugarDevolucion}
                        className={cn(claseInput(fieldErrors.lugarDevolucion), 'text-sm')}
                      />
                      <MensajeCampo mensaje={fieldErrors.lugarDevolucion} />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="field-label">
                          N° de OT Chilexpress
                        </label>
                        <input
                          type="text"
                          value={otChilexpress}
                          onChange={(e) => {
                            setOtChilexpress(e.target.value);
                            limpiarError('otChilexpress');
                          }}
                          placeholder="ej: CH-2026-004567"
                          aria-invalid={!!fieldErrors.otChilexpress}
                          className={cn(claseInput(fieldErrors.otChilexpress), 'text-sm')}
                        />
                        <MensajeCampo mensaje={fieldErrors.otChilexpress} />
                      </div>
                      <div>
                        <label className="field-label">
                          Ubicación de destino
                        </label>
                        <input
                          type="text"
                          value={ciudadDevolucion}
                          onChange={(e) => {
                            setCiudadDevolucion(e.target.value);
                            limpiarError('ciudadDevolucion');
                          }}
                          placeholder="ej: Hotel HD Express, Concepción"
                          aria-invalid={!!fieldErrors.ciudadDevolucion}
                          className={cn(claseInput(fieldErrors.ciudadDevolucion), 'text-sm')}
                        />
                        <MensajeCampo mensaje={fieldErrors.ciudadDevolucion} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* En Desvinculacion y Cambio de Equipo la sede ya no se elige: el
              empleado ya pertenece a una y se fija sola al elegirlo. */}
          <div>
            <label className="field-label">
              Sede <span className="text-red-500">*</span>
            </label>
            {((tipo === 'offboarding' || tipo === 'cambio_equipo') && selectedEmployee) ||
            !esAdminSede ? (
              <input
                type="text"
                value={sedes.find((s) => s.id === sedeId)?.nombre || 'Cargando...'}
                disabled
                className="w-full px-3 py-2 border border-line rounded-lg bg-surface-muted text-fg-muted"
              />
            ) : (
              <select
                value={sedeId}
                onChange={(e) => {
                  setSedeId(e.target.value);
                  limpiarError('sedeId');
                }}
                required
                aria-invalid={!!fieldErrors.sedeId}
                className={claseInput(fieldErrors.sedeId)}
              >
                <option value="" disabled>
                  Selecciona una sede...
                </option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-fg-subtle mt-1">
              {(tipo === 'offboarding' || tipo === 'cambio_equipo') && selectedEmployee
                ? 'Es la sede del empleado.'
                : !esAdminSede
                ? 'Es tu sede: la solicitud queda registrada en ella.'
                : 'Obligatorio: a qué sede pertenece esta solicitud.'}
            </p>
          </div>

          {/* Observaciones */}
          <div>
            <label className="field-label">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-line-strong rounded-lg"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-fg-muted hover:text-fg"
            >
              Volver
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={buttonClasses({ className: "px-6" })}
            >
              {submitting ? 'Creando...' : 'Crear Solicitud'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 (Onboarding): detalles de la solicitud */}
      {/* Create Employee Modal (cambio_equipo / offboarding) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-surface rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-fg">Crear Nuevo Empleado</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-fg-subtle hover:text-fg-muted"
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
              {esAdminSede && (
                <div>
                  <label className="field-label">
                    Sede *
                  </label>
                  <select
                    value={sedeEmpleadoNuevo}
                    onChange={(e) => setSedeEmpleadoNuevo(e.target.value)}
                    required
                    className="field-input"
                  >
                    <option value="" disabled>
                      Selecciona una sede...
                    </option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    value={newEmp.nombres}
                    onChange={(e) => setNewEmp({ ...newEmp, nombres: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg"
                  />
                </div>
                <div>
                  <label className="field-label">
                    Apellido Paterno *
                  </label>
                  <input
                    type="text"
                    value={newEmp.apellidoPaterno}
                    onChange={(e) => setNewEmp({ ...newEmp, apellidoPaterno: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Apellido Materno
                  </label>
                  <input
                    type="text"
                    value={newEmp.apellidoMaterno}
                    onChange={(e) => setNewEmp({ ...newEmp, apellidoMaterno: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg"
                  />
                </div>
                <div>
                  <label className="field-label">RUT</label>
                  <input
                    type="text"
                    value={newEmp.rut}
                    onChange={(e) => setNewEmp({ ...newEmp, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className="w-full px-3 py-2 border border-line-strong rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">
                  Correo Personal *
                </label>
                <input
                  type="email"
                  value={newEmp.correoPersonal ?? ''}
                  onChange={(e) => setNewEmp({ ...newEmp, correoPersonal: e.target.value })}
                  placeholder="nombre.personal@gmail.com"
                  className="w-full px-3 py-2 border border-line-strong rounded-lg"
                />
              </div>
              <div>
                <label className="field-label">
                  Correo Empresa
                </label>
                <input
                  type="email"
                  value={newEmp.correoEmpresa ?? ''}
                  onChange={(e) => setNewEmp({ ...newEmp, correoEmpresa: e.target.value })}
                  placeholder="nombre@sclconsultores.com (opcional)"
                  className="w-full px-3 py-2 border border-line-strong rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Cargo</label>
                  <input
                    type="text"
                    value={newEmp.cargo}
                    onChange={(e) => setNewEmp({ ...newEmp, cargo: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg"
                  />
                </div>
                <div>
                  <label className="field-label">
                    Tipo Contrato *
                  </label>
                  <select
                    value={newEmp.tipoContrato}
                    onChange={(e) => setNewEmp({ ...newEmp, tipoContrato: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg"
                  >
                    <option value="contrato">Contrato</option>
                    <option value="boleta">Boleta</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Ubicación</label>
                <input
                  type="text"
                  value={newEmp.ubicacion}
                  onChange={(e) => setNewEmp({ ...newEmp, ubicacion: e.target.value })}
                  className="w-full px-3 py-2 border border-line-strong rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-fg-muted hover:text-fg"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateEmployee}
                disabled={
                  creatingEmployee ||
                  !newEmp.nombres ||
                  !newEmp.apellidoPaterno ||
                  !newEmp.correoPersonal
                }
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-success-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
