'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft,
  UserPlus,
  ArrowLeftRight,
  Undo2,
  X,
  Search,
  Loader2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SeleccionarCambioEquipo,
  type SeleccionCambioEquipo,
} from '@/components/solicitudes/SeleccionarCambioEquipo';

type Employee = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  cargo: string | null;
  correoPersonal: string;
  correoEmpresa: string | null;
  estado?: string;
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

const ICONOS_CATEGORIA: Record<string, React.ReactNode> = {
  Notebook: <Laptop className="h-4 w-4" />,
  Celular: <Smartphone className="h-4 w-4" />,
  Monitor: <Monitor className="h-4 w-4" />,
};

function iconoCategoria(nombre: string): React.ReactNode {
  return ICONOS_CATEGORIA[nombre] || <Package className="h-4 w-4" />;
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
  // De donde salio: "disponible" es nuevo, nunca asignado; "reutilizable" ya
  // se uso y volvio en buen estado (ver assetStateMachine). Se muestra para
  // que el tecnico sepa que esta eligiendo un equipo usado.
  estadoActivo: 'disponible' | 'reutilizable';
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
    color: 'border-blue-500 bg-blue-50',
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

export default function NuevaSolicitudPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [sedes, setSedes] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  const [sedeId, setSedeId] = useState('');
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

  // Onboarding: nuevo empleado (paso 2), sin persistir hasta el submit final
  const [onboardingEmp, setOnboardingEmp] = useState({ ...NEW_EMPLOYEE_INITIAL });
  const [onboardingEmpError, setOnboardingEmpError] = useState('');
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

  // Cambio equipo fields
  const [motivoCambio, setMotivoCambio] = useState('');
  // Si se completa (equipo viejo + estado + equipo nuevo), el cambio se
  // ejecuta de inmediato al crear el ticket; si se deja en null, el ticket
  // nace en "Incidencia Detectada" como antes.
  const [cambioSeleccion, setCambioSeleccion] = useState<SeleccionCambioEquipo | null>(null);

  // Offboarding fields
  const [fechaDesvinculacion, setFechaDesvinculacion] = useState('');
  const [medioDevolucion, setMedioDevolucion] = useState('');
  const [otChilexpress, setOtChilexpress] = useState('');
  const [ciudadDevolucion, setCiudadDevolucion] = useState('');

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
    setEmployeeId(emp.id);
    setSearchEmployee('');
    setShowResults(false);
    if (tipo === 'offboarding' || tipo === 'cambio_equipo') fetchEmployeeAssignments(emp.id);
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
    setCreatingEmployee(true);
    try {
      const res = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: newEmp.nombres,
          apellidoPaterno: newEmp.apellidoPaterno,
          apellidoMaterno: newEmp.apellidoMaterno || null,
          correoPersonal: newEmp.correoPersonal,
          correoEmpresa: newEmp.correoEmpresa || null,
          rut: newEmp.rut || null,
          cargo: newEmp.cargo || null,
          ubicacion: newEmp.ubicacion || null,
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

  // Precarga la sede propia del usuario apenas la sesion esta disponible --
  // el "prev ||" evita pisar una eleccion manual hecha antes de que la
  // sesion terminara de cargar. SPEC 2.29: el usuario igual puede cambiarla.
  useEffect(() => {
    if (session?.user?.sedeId) {
      setSedeId((prev) => prev || session.user.sedeId!);
    }
  }, [session?.user?.sedeId]);

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
  // total), para mostrar stock en "Equipos Requeridos" sin que el usuario
  // tenga que salir del formulario a revisar el modulo de Activos.
  //
  // "disponible" es solo el equipo nuevo, nunca asignado. El equipo usado
  // que ya se devolvio y quedo en buen estado vuelve como "reutilizable"
  // (ver assetStateMachine / executeReturn) -- es asignable igual que uno
  // nuevo (executeAssignment acepta ambos estados), pero antes esta pantalla
  // solo consultaba "disponible": si todo el stock de una categoria era
  // reutilizable (nada "disponible"), mostraba "0 disponibles" y el boton de
  // avanzar igual dejaba pasar sin poder elegir nada, aunque en Activos si
  // habia equipo para asignar.
  useEffect(() => {
    if (categorias.length === 0) return;
    let cancelado = false;
    const mapearItem = (
      a: EquipoDisponible,
      estadoActivo: 'disponible' | 'reutilizable'
    ): EquipoDisponible => ({
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
      estadoActivo,
    });
    Promise.all(
      categorias.map((cat) =>
        Promise.all([
          fetch(`/api/activos?categoriaId=${cat.id}&estado=disponible&limit=5`)
            .then((res) => (res.ok ? res.json() : { pagination: { total: 0 }, data: [] }))
            .catch(() => ({ pagination: { total: 0 }, data: [] })),
          fetch(`/api/activos?categoriaId=${cat.id}&estado=reutilizable&limit=5`)
            .then((res) => (res.ok ? res.json() : { pagination: { total: 0 }, data: [] }))
            .catch(() => ({ pagination: { total: 0 }, data: [] })),
        ]).then(([disponibles, reutilizables]) => ({
          id: cat.id,
          total: (disponibles.pagination?.total ?? 0) + (reutilizables.pagination?.total ?? 0),
          items: [
            ...(disponibles.data || []).map((a: EquipoDisponible) => mapearItem(a, 'disponible')),
            ...(reutilizables.data || []).map((a: EquipoDisponible) => mapearItem(a, 'reutilizable')),
          ],
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
  }, [categorias]);

  // Catalogo de Kit de Bienvenida / EPP con stock, para poder elegir
  // articulos y cantidades especificas al crear el ticket (igual que con los
  // equipos): si no queda nada elegido, se sigue pudiendo entregar despues,
  // al gestionar la solicitud.
  useEffect(() => {
    if (tipo !== 'onboarding') return;
    let cancelado = false;
    fetch('/api/kit-items')
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
  }, [tipo]);

  const handleCancelOnboarding = () => {
    setTipo('');
    setOnboardingEmp({ ...NEW_EMPLOYEE_INITIAL });
    setOnboardingEmpError('');
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
    setOnboardingEmpError('');

    if (tipo === 'onboarding' && modoEmpleadoOnboarding === 'nuevo') {
      if (
        !onboardingEmp.nombres.trim() ||
        !onboardingEmp.apellidoPaterno.trim() ||
        !onboardingEmp.correoPersonal.trim() ||
        !onboardingEmp.cargo.trim()
      ) {
        setOnboardingEmpError('Nombres, apellido paterno, correo y cargo son obligatorios.');
        return;
      }
      if (!fechaIngreso) {
        setFieldErrors({ fechaIngreso: 'Fecha de ingreso requerida' });
        return;
      }
    }

    // Defensa en profundidad ademas del "required" del select: si no se
    // eligio sede, no se manda -- evita que quede un ticket sin sede
    // (invisible para todos) por un descuido. Desde SPEC 2.29 esto aplica a
    // cualquier rol, no solo admin: toda accion debe quedar ligada a una
    // sede explicita.
    if (!sedeId) {
      setFieldErrors({ sedeId: 'Debes seleccionar una sede' });
      return;
    }

    if (tipo === 'onboarding' && modoEmpleadoOnboarding === 'existente') {
      if (!selectedEmployee) {
        setFieldErrors({ employeeId: 'Elige el empleado que se reincorpora' });
        return;
      }
      if (!cargoSolicitadoReincorporacion.trim()) {
        setFieldErrors({ cargoSolicitado: 'Cargo requerido' });
        return;
      }
      if (!fechaIngreso) {
        setFieldErrors({ fechaIngreso: 'Fecha de ingreso requerida' });
        return;
      }
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
            correoPersonal: onboardingEmp.correoPersonal,
            correoEmpresa: onboardingEmp.correoEmpresa || null,
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
          }),
        };
      } else if (tipo === 'offboarding') {
        body = {
          ...base,
          employeeId,
          fechaDesvinculacion,
          medioDevolucion: medioDevolucion || null,
          otChilexpress: otChilexpress || null,
          ciudadDevolucion: ciudadDevolucion || null,
          // Solo se envian los equipos que efectivamente se calificaron; si
          // se dejaron sin calificar, el ticket nace igual (solicitud_emitida)
          // y se completan despues desde el detalle.
          devoluciones: employeeAssignments
            .filter((a) => devolucionEstados[a.id])
            .map((a) => ({
              assignmentId: a.id,
              estadoDevolucion: devolucionEstados[a.id],
              observaciones: devolucionObservaciones[a.id] || undefined,
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

  const totalSteps = 2;
  const stepDescriptions: Record<number, string> = {
    1: 'Selecciona el tipo de solicitud',
    2: tipo === 'onboarding' ? 'Datos del nuevo empleado y de la solicitud' : 'Completa los datos',
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
          <p className="text-gray-600">{stepDescriptions[step]}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n, idx) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0',
                step >= n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              )}
            >
              {n}
            </div>
            {idx < totalSteps - 1 && (
              <div className={cn('h-0.5 flex-1', step > n ? 'bg-blue-600' : 'bg-gray-200')} />
            )}
          </div>
        ))}
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

      {/* Step 2 (Onboarding): crear empleado */}
      {step === 2 && tipo === 'onboarding' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <h3 className="font-medium text-gray-900">
              {modoEmpleadoOnboarding === 'nuevo' ? 'Datos del Nuevo Empleado' : 'Empleado que se reincorpora'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
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
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
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
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              )}
            >
              Ya trabajó aquí (reincorporación)
            </button>
          </div>

          {onboardingEmpError && modoEmpleadoOnboarding === 'nuevo' && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {onboardingEmpError}
            </div>
          )}

          {modoEmpleadoOnboarding === 'existente' && (
            <div className="space-y-4">
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
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                        {selectedEmployee.apellidoMaterno ? ` ${selectedEmployee.apellidoMaterno}` : ''}
                        {selectedEmployee.estado === 'desvinculado' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                            Desvinculado — se reactivará
                          </span>
                        )}
                        {selectedEmployee.estado === 'activo' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-500">
                            Ya está activo
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {selectedEmployee.rut || '—'} · {selectedEmployee.correoPersonal}
                        {selectedEmployee.cargo ? ` · ${selectedEmployee.cargo}` : ''}
                      </p>
                    </div>
                    <button onClick={clearEmployee} className="text-gray-400 hover:text-gray-600 p-1">
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
                    {showResults && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {searchResults.length > 0 ? (
                          searchResults.map((emp) => (
                            <button
                              key={emp.id}
                              onClick={() => selectEmployee(emp)}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                            >
                              <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                {emp.nombres} {emp.apellidoPaterno}
                                {emp.apellidoMaterno ? ` ${emp.apellidoMaterno}` : ''}
                                {emp.estado === 'desvinculado' && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                                    Desvinculado
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                <span>{emp.rut || 'Sin RUT'}</span>
                                <span>·</span>
                                <span>{emp.correoPersonal}</span>
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
                          <p className="px-4 py-6 text-center text-sm text-gray-500">
                            No se encontraron empleados para &quot;{searchEmployee}&quot;. Si no existe, usa
                            &quot;Empleado nuevo&quot; arriba.
                          </p>
                        )}
                      </div>
                    )}
                    {!showResults && searchEmployee.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Escribe al menos 2 caracteres para buscar.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={cn(
                    'block text-sm font-medium mb-1',
                    fieldErrors.cargoSolicitado ? 'text-red-600' : 'text-gray-700'
                  )}>
                    Cargo Solicitado *
                  </label>
                  <input
                    type="text"
                    value={cargoSolicitadoReincorporacion}
                    onChange={(e) => { setCargoSolicitadoReincorporacion(e.target.value); setFieldErrors((prev) => { const { cargoSolicitado: _, ...rest } = prev; return rest; }); }}
                    placeholder="Puede ser el mismo cargo anterior u otro"
                    className={cn('w-full px-3 py-2 border rounded-lg', fieldErrors.cargoSolicitado ? 'border-red-500 bg-red-50' : 'border-gray-300')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo Contrato *
                  </label>
                  <select
                    value={tipoContratoReincorporacion}
                    onChange={(e) => setTipoContratoReincorporacion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="contrato">Contrato</option>
                    <option value="boleta">Boleta</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Puede haber cambiado desde la vez anterior.</p>
                </div>
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
              </div>
            </div>
          )}

          {modoEmpleadoOnboarding === 'nuevo' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombres *</label>
                <input
                  type="text"
                  value={onboardingEmp.nombres}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, nombres: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido Paterno *</label>
                <input
                  type="text"
                  value={onboardingEmp.apellidoPaterno}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, apellidoPaterno: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido Materno</label>
                <input
                  type="text"
                  value={onboardingEmp.apellidoMaterno}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, apellidoMaterno: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                <input
                  type="text"
                  value={onboardingEmp.rut}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, rut: e.target.value })}
                  placeholder="12.345.678-9"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Personal *</label>
                <input
                  type="email"
                  value={onboardingEmp.correoPersonal}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, correoPersonal: e.target.value })}
                  placeholder="nombre.personal@gmail.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Empresa</label>
                <input
                  type="email"
                  value={onboardingEmp.correoEmpresa}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, correoEmpresa: e.target.value })}
                  placeholder="nombre@empresa.cl (si ya se creó)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo *</label>
                <input
                  type="text"
                  value={onboardingEmp.cargo}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, cargo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Contrato *</label>
                <select
                  value={onboardingEmp.tipoContrato}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, tipoContrato: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="contrato">Contrato</option>
                  <option value="boleta">Boleta</option>
                </select>
              </div>
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
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">División</label>
                <input
                  type="text"
                  value={onboardingEmp.division}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, division: e.target.value })}
                  placeholder="Ej: SCL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Área</label>
                <input
                  type="text"
                  value={onboardingEmp.area}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, area: e.target.value })}
                  placeholder="Ej: RPA y Soporte IT"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Área</label>
                <input
                  type="text"
                  value={onboardingEmp.subArea}
                  onChange={(e) => setOnboardingEmp({ ...onboardingEmp, subArea: e.target.value })}
                  placeholder="Ej: RPA"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <input
                type="text"
                value={onboardingEmp.supervisor}
                onChange={(e) => setOnboardingEmp({ ...onboardingEmp, supervisor: e.target.value })}
                placeholder="Nombre del supervisor directo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Celular Contacto</label>
              <input
                type="text"
                value={onboardingEmp.telefonoContacto}
                onChange={(e) => setOnboardingEmp({ ...onboardingEmp, telefonoContacto: e.target.value })}
                placeholder="+56 9 1234 5678"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dirección Particular
              </label>
              <input
                type="text"
                value={onboardingEmp.direccionParticular}
                onChange={(e) => setOnboardingEmp({ ...onboardingEmp, direccionParticular: e.target.value })}
                placeholder="Incluir comuna y región"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Listas de Distribución
              </label>
              <input
                type="text"
                value={onboardingEmp.listasDistribucion}
                onChange={(e) => setOnboardingEmp({ ...onboardingEmp, listasDistribucion: e.target.value })}
                placeholder="Ej: SCL Masivo, Corporativo..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          )}

          {/* Responsable de la solicitud (solo lectura) */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
            <input
              type="text"
              value={
                session?.user?.name
                  ? `${session.user.name}${session.user.email ? ` (${session.user.email})` : ''}`
                  : 'Cargando...'
              }
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Equipos Requeridos
            </label>
            {categorias.length === 0 ? (
              <p className="text-sm text-gray-400">Cargando categorías...</p>
            ) : (
              <div className="flex flex-col gap-2">
                {categorias.map((cat) => {
                  const disp = disponiblesPorCategoria[cat.id];
                  const expandida = categoriaExpandida === cat.id;
                  const requerida = categoriasRequeridas.includes(cat.nombre);
                  const seleccionado = equipoSeleccionado[cat.id];
                  return (
                    <div key={cat.id} className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 flex-1">
                          <input
                            type="checkbox"
                            checked={requerida}
                            onChange={(e) => {
                              setCategoriasRequeridas((prev) =>
                                toggleCategoriaRequerida(prev, cat.nombre, e.target.checked)
                              );
                              if (!e.target.checked) {
                                setEquipoSeleccionado((prev) => {
                                  const next = { ...prev };
                                  delete next[cat.id];
                                  return next;
                                });
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="flex items-center gap-1 text-sm">
                            {iconoCategoria(cat.nombre)}
                            {cat.nombre}
                          </span>
                        </label>
                        {seleccionado && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            Reservado
                          </span>
                        )}
                        {disp !== undefined && (
                          <button
                            type="button"
                            onClick={() => setCategoriaExpandida(expandida ? null : cat.id)}
                            className={cn(
                              'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
                              disp.total > 0
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            )}
                          >
                            {disp.total} disponible{disp.total === 1 ? '' : 's'}
                            {disp.total > 0 && (expandida ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                          </button>
                        )}
                      </div>
                      {expandida && disp && disp.items.length > 0 && (
                        <div className="ml-6 mt-1 mb-1 space-y-0.5">
                          <p className="text-xs text-gray-400">
                            {requerida
                              ? 'Elige uno para reservarlo desde ya, o déjalo sin elegir y se asigna después en Gestión TI.'
                              : 'Marca la categoría para poder reservar un equipo.'}
                          </p>
                          <ul className="text-xs text-gray-600 space-y-0.5">
                            {disp.items.map((item) => (
                              <li key={item.id}>
                                <label
                                  className={cn(
                                    'flex items-center gap-2',
                                    !requerida && 'opacity-50 cursor-not-allowed'
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`equipo-${cat.id}`}
                                    disabled={!requerida}
                                    checked={seleccionado === item.id}
                                    onChange={() =>
                                      setEquipoSeleccionado((prev) => ({ ...prev, [cat.id]: item.id }))
                                    }
                                  />
                                  <span>
                                    {item.marca} {item.modelo}
                                    {item.numeroSerie ? ` — N° serie ${item.numeroSerie}` : ''}
                                    {item.estadoActivo === 'reutilizable' && (
                                      <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                                        Usado
                                      </span>
                                    )}
                                    {especificacionesEquipo(item) && (
                                      <span className="block text-gray-400">
                                        {especificacionesEquipo(item)}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              </li>
                            ))}
                            {seleccionado && (
                              <li>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEquipoSeleccionado((prev) => {
                                      const next = { ...prev };
                                      delete next[cat.id];
                                      return next;
                                    })
                                  }
                                  className="text-blue-600 hover:underline"
                                >
                                  Quitar selección
                                </button>
                              </li>
                            )}
                          </ul>
                          {disp.total > disp.items.length && (
                            <p className="text-gray-400">y {disp.total - disp.items.length} más...</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Kit de Bienvenida / EPP: aparte de Equipos Requeridos, no son Activos */}
          <div className="border-t pt-4">
            <h3 className="font-medium text-gray-900 mb-1">Kit de Bienvenida y EPP</h3>
            <p className="text-xs text-gray-500 mb-3">
              Si hay stock puedes elegir de una los artículos y cantidades para reservarlos desde
              ahora. Si no, igual puedes marcar la categoría y entregarlo después al gestionar la
              solicitud.
            </p>
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
                      <label className="flex items-center gap-2 flex-1">
                        <input
                          type="checkbox"
                          checked={requerida}
                          onChange={(e) => {
                            setRequerida(e.target.checked);
                            if (!e.target.checked) {
                              setKitCantidadesSeleccionadas((prev) => {
                                const next = { ...prev };
                                items.forEach((it) => delete next[it.id]);
                                return next;
                              });
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                      {seleccionCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
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
                        <p className="text-xs text-gray-400">
                          {requerida
                            ? 'Elige cantidades para reservarlas desde ya, o déjalo en 0 y se entrega después.'
                            : `Marca "${label}" para poder reservar artículos.`}
                        </p>
                        {items.map((it) => (
                          <div key={it.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-gray-700">
                              {it.nombre} <span className="text-gray-400">({it.cantidad} disp.)</span>
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={it.cantidad}
                              disabled={!requerida}
                              value={kitCantidadesSeleccionadas[it.id] || ''}
                              onChange={(e) =>
                                setKitCantidadesSeleccionadas((prev) => ({
                                  ...prev,
                                  [it.id]: Math.max(0, Math.min(it.cantidad, Number(e.target.value) || 0)),
                                }))
                              }
                              placeholder="0"
                              className="w-16 border border-gray-300 rounded px-2 py-1 disabled:bg-gray-100"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sede <span className="text-red-500">*</span>
            </label>
            <select
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
            <p className="text-xs text-gray-500 mt-1">
              Obligatorio: a qué sede pertenece esta solicitud.
            </p>
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
              onClick={handleCancelOnboarding}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creando...' : 'Crear Solicitud'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 (Cambio de Equipo / Offboarding): formulario con búsqueda de empleado */}
      {step === 2 && tipo !== 'onboarding' && tipo !== '' && (
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
                    {selectedEmployee.rut || '—'} · {selectedEmployee.correoPersonal}
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
                            <span>{emp.correoPersonal}</span>
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

          {/* Responsable de la solicitud (solo lectura) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
            <input
              type="text"
              value={
                session?.user?.name
                  ? `${session.user.name}${session.user.email ? ` (${session.user.email})` : ''}`
                  : 'Cargando...'
              }
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          {tipo === 'cambio_equipo' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-gray-900">Datos del Cambio</h3>

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

              {/* Equipo a cambiar + reemplazo: opcional. Si se completa, el
                  cambio se ejecuta de inmediato al crear el ticket; si se
                  deja incompleto, el ticket nace en "Incidencia Detectada"
                  y se completa despues desde el detalle. */}
              {selectedEmployee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Equipo a cambiar (opcional -- si no lo eliges ahora, se hace después)
                  </label>
                  {loadingAssignments ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : (
                    <SeleccionarCambioEquipo
                      asignacionesActivas={employeeAssignments}
                      submitting={submitting}
                      showSubmitButton={false}
                      onChange={setCambioSeleccion}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {tipo === 'offboarding' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-gray-900">Datos de Devolucion</h3>

              {/* Equipos actuales del empleado */}
              {selectedEmployee && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Equipos a devolver
                  </label>
                  {loadingAssignments ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : employeeAssignments.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">
                        Si ya tienes los equipos en mano, califica cada uno abajo y el ticket se
                        cerrará solo al enviarse. Si no, déjalos sin calificar y hazlo después.
                      </p>
                      <div className="space-y-2">
                        {employeeAssignments.map((a) => {
                          const asset = a.asset;
                          const iconMap: Record<string, React.ReactNode> = {
                            notebook: <Laptop className="h-4 w-4" />,
                            celular: <Smartphone className="h-4 w-4" />,
                            monitor: <Monitor className="h-4 w-4" />,
                          };
                          const icon = iconMap[asset.categoria.nombre.toLowerCase()] || <Package className="h-4 w-4" />;
                          return (
                            <div
                              key={a.id}
                              className="p-3 bg-orange-50 border border-orange-200 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
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
                              <div className="mt-3 pl-1 space-y-2">
                                  <div className="flex gap-4 text-sm text-gray-700">
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`devolucion-${a.id}`}
                                        checked={devolucionEstados[a.id] === 'ok'}
                                        onChange={() =>
                                          setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'ok' }))
                                        }
                                      />
                                      Buen estado
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`devolucion-${a.id}`}
                                        checked={devolucionEstados[a.id] === 'danado'}
                                        onChange={() =>
                                          setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'danado' }))
                                        }
                                      />
                                      Dañado
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`devolucion-${a.id}`}
                                        checked={devolucionEstados[a.id] === 'no_devuelto'}
                                        onChange={() =>
                                          setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'no_devuelto' }))
                                        }
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
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                                  />
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    EPP a devolver
                  </label>
                  <div className="space-y-2">
                    {employeeEppAssignments.map((k) => (
                      <div key={k.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <p className="text-sm font-medium text-gray-900 mb-2">{k.item.nombre}</p>
                        <div className="flex gap-4 text-sm text-gray-700 mb-2">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'ok'}
                              onChange={() =>
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'ok' }))
                              }
                            />
                            Buen estado
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'danado'}
                              onChange={() =>
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'danado' }))
                              }
                            />
                            Dañado
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'no_devuelto'}
                              onChange={() =>
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'no_devuelto' }))
                              }
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
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    ))}
                  </div>
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
                    Ubicación
                  </label>
                  <input
                    type="text"
                    value={ciudadDevolucion}
                    onChange={(e) => setCiudadDevolucion(e.target.value)}
                    placeholder="ej: Oficina Santiago, o ciudad de destino si es despacho"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sede <span className="text-red-500">*</span>
            </label>
            <select
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
            <p className="text-xs text-gray-500 mt-1">
              Obligatorio: a qué sede pertenece esta solicitud.
            </p>
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

      {/* Step 3 (Onboarding): detalles de la solicitud */}
      {/* Create Employee Modal (cambio_equipo / offboarding) */}
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
                  Correo Personal *
                </label>
                <input
                  type="email"
                  value={newEmp.correoPersonal}
                  onChange={(e) => setNewEmp({ ...newEmp, correoPersonal: e.target.value })}
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
                    <option value="contrato">Contrato</option>
                    <option value="boleta">Boleta</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                <input
                  type="text"
                  value={newEmp.ubicacion}
                  onChange={(e) => setNewEmp({ ...newEmp, ubicacion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
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
                  !newEmp.correoPersonal
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
