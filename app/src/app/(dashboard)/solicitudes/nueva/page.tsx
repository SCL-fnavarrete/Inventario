'use client';

import { mensajeDeError } from '@/shared/utilidades/apiErrors';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { nombreConUsuario } from '@/shared/auth/usuario';
import { Loader2, AlertCircle, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { cn } from '@/shared/cn';
import { CategoryIcon, SelectCondicionCargador } from '@/modules/activos/componentes';
import { CamposMotivoBaja, erroresMotivoBaja, useMotivosBaja } from '@/modules/mantenciones/componentes';
import {
  SeleccionarCambioEquipo,
  itemCambioCompleto,
  type ItemCambioEquipo,
  SeleccionarCambioLinea,
  LineasAlDesvincular,
  itemLineaCompleto,
  type ItemCambioLinea,
  SeccionCoordinacion,
  BuscadorEmpleado,
  useBuscarEmpleado,
  SeccionKitEpp,
  type ArticuloKit,
  FormEmpleadoNuevo,
  ElegirLineaCelular,
  SIN_LINEA,
  type EleccionLinea,
  ElegirEstadoDevolucion,
  type EstadoDevolucion,
  CLAVES,
  COORDINACION_VACIA,
  cuerpoCoordinacion,
  erroresCoordinacion,
  type Coordinacion,
  CAMPOS_OBLIGATORIOS_ONBOARDING,
  DATO_OBLIGATORIO,
  ETIQUETAS_ERROR,
  NEW_EMPLOYEE_INITIAL,
  TIPOS,
  especificacionesEquipo,
  toggleCategoriaRequerida,
  type Employee,
  type EmployeeAssignment,
  type EmployeeKitAssignment,
  type EquipoDisponible,
} from '@/modules/solicitudes/componentes';
import { buttonClasses } from '@/shared/ui/buttonStyles';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useBorrador } from '@/shared/hooks/useBorrador';
import {
  CONDICION_CARGADOR_POR_DEFECTO,
  type CondicionCargador,
  identificadorActivo,
} from '@/modules/activos';
import {
  AvisoSeccion,
  CampoFormulario,
  CampoTexto,
  MensajeCampo,
  ResumenErrores,
  claseInput,
  enfocarPrimerError,
  sinErrores,
  textoResumenErrores,
} from '@/shared/ui/CampoFormulario';
import { coincidePorPalabras, esCorreoValido } from '@/shared/utilidades/text';
import { formatearFechaHora } from '@/shared/utilidades/fechas';
import { useCampoSede, useSedeSeleccionada } from '@/shared/ui/providers/SedeSeleccionadaProvider';
import { logger } from '@/shared/logger';


export default function NuevaSolicitudPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [sedes, setSedes] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  // Sede de la solicitud: precargada con la del navbar o la propia
  // (useCampoSede, SPEC 2.80). En offboarding/cambio de equipo la fija el
  // empleado elegido (ver selectEmployee).
  const [sedeId, setSedeId] = useCampoSede();
  const { sedeSeleccionada } = useSedeSeleccionada();
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Busqueda de empleado (reincorporacion, cambio de equipo y desvinculacion):
  // su estado y logica viven en useBuscarEmpleado.
  const buscador = useBuscarEmpleado(sedeSeleccionada);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  // Desvinculacion de alguien ya desvinculado: solo sirve para recuperar sus
  // equipos "No devuelto" (SPEC 2.87). Usa la fecha de la desvinculacion
  // original, asi que no se pide.
  const esRecuperacion = tipo === 'offboarding' && selectedEmployee?.estado === 'desvinculado';
  // Asignaciones activas del empleado, para poder calificarlas y cerrarlas
  // de una al crear el ticket -- offboarding (devoluciones) y cambio_equipo
  // (equipo viejo a cambiar) comparten esta misma carga.
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [devolucionEstados, setDevolucionEstados] = useState<Record<string, EstadoDevolucion>>({});
  const [devolucionObservaciones, setDevolucionObservaciones] = useState<Record<string, string>>({});
  // Equipo devuelto danado: se da de baja en el acto con su motivo (SPEC 2.135).
  const [devolucionMotivos, setDevolucionMotivos] = useState<Record<string, { motivoBajaId: string; detalle: string }>>({});
  const motivosBaja = useMotivosBaja();
  const motivoDe = (id: string) => devolucionMotivos[id] ?? { motivoBajaId: '', detalle: '' };
  // Condicion del cargador al devolver, solo si el equipo es un notebook
  // con tieneCargador.
  const [devolucionCargador, setDevolucionCargador] = useState<Record<string, CondicionCargador>>({});
  const [devolucionCargadorObservaciones, setDevolucionCargadorObservaciones] = useState<Record<string, string>>({});
  // EPP entregado y pendiente de devolver (offboarding)
  const [employeeEppAssignments, setEmployeeEppAssignments] = useState<EmployeeKitAssignment[]>([]);
  const [devolucionEppEstados, setDevolucionEppEstados] = useState<Record<string, EstadoDevolucion>>({});
  const [devolucionEppObservaciones, setDevolucionEppObservaciones] = useState<Record<string, string>>({});

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
  // Ticket de la ticketera que origina la solicitud (SPEC 2.123), obligatorio.
  const [idTicket, setIdTicket] = useState('');

  // Onboarding fields
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [categorias, setCategorias] = useState<{ id: string; nombre: string; tipoFicha?: string }[]>([]);
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
  // Lo escrito en el buscador de la categoria abierta: acorta la lista de equipos.
  const [busquedaEquipos, setBusquedaEquipos] = useState('');
  // Condicion del cargador del equipo elegido, por categoria; solo se pide
  // si el equipo reservado es un notebook con tieneCargador.
  const [cargadorOnboarding, setCargadorOnboarding] = useState<
    Record<string, { condicion: CondicionCargador; observaciones: string }>
  >({});
  // Linea de cada celular reservado que llega sin linea, por categoria (SPEC 2.143).
  const [lineaOnboarding, setLineaOnboarding] = useState<Record<string, EleccionLinea>>({});
  // El empleado usa su propio telefono con una eSIM, en vez de un celular de la empresa.
  const [usaEsim, setUsaEsim] = useState(false);
  // Sin elegir hasta que se aprieta Celular y se marca una de las dos opciones.
  const [modoCelular, setModoCelular] = useState<'' | 'chip' | 'esim'>('');
  const [esimLineaId, setEsimLineaId] = useState('');
  // Coordinacion de entrega, cambio y devolucion: un objeto por tipo (fecha,
  // medio, lugar, OT, destino) en vez de 5 estados sueltos cada una; ver
  // modules/solicitudes/componentes/nueva/coordinacion.ts.
  const [coordEntrega, setCoordEntrega] = useState<Coordinacion>(COORDINACION_VACIA);
  const [coordCambio, setCoordCambio] = useState<Coordinacion>(COORDINACION_VACIA);
  const [coordDevolucion, setCoordDevolucion] = useState<Coordinacion>(COORDINACION_VACIA);
  // Kit de Bienvenida y EPP: aparte de Equipos Requeridos porque no son
  // Activos (ver /activos/kit-bienvenida). Igual que con los equipos, si hay
  // stock se puede elegir de una los articulos y cantidades especificas y
  // quedan reservados desde que se crea el ticket.
  const [kitBienvenidaSolicitado, setKitBienvenidaSolicitado] = useState(false);
  const [eppSolicitado, setEppSolicitado] = useState(false);
  const [kitCatalog, setKitCatalog] = useState<ArticuloKit[]>([]);
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
  // Equipos marcados para cambiar (uno o varios, SPEC 2.84), cada uno con su
  // estado de devolucion y su reemplazo; se ejecutan al crear el ticket.
  const [cambios, setCambios] = useState<ItemCambioEquipo[]>([]);
  // Lineas de la persona que se cambian por otra disponible (SPEC 2.143).
  const [cambiosLinea, setCambiosLinea] = useState<ItemCambioLinea[]>([]);
  // Una linea de celular que pasa a eSIM marca ese celular con eSIM en la seccion de equipos.
  const [pedidoEsim, setPedidoEsim] = useState<{ activoId: string; n: number } | null>(null);
  // ejecuta de inmediato al crear el ticket; si se deja en null, el ticket
  // nace en "Incidencia Detectada" como antes.

  // Offboarding fields
  const [fechaDesvinculacion, setFechaDesvinculacion] = useState('');

  // Borrador en esta pestaña (auditoria 27-sep-2026, 2.8): si la sesion
  // vence a mitad del formulario, lo escrito se recupera al volver. Solo lo
  // que escribe o elige la persona; lo que viene de la base (stock,
  // asignaciones del empleado, catalogos) se vuelve a consultar.
  const datosBorrador = {
    step, tipo, sedeId, selectedEmployee, employeeId, observaciones, idTicket,
    devolucionEstados, devolucionObservaciones, devolucionMotivos, devolucionCargador, devolucionCargadorObservaciones,
    devolucionEppEstados, devolucionEppObservaciones,
    onboardingEmp, modoEmpleadoOnboarding, cargoSolicitadoReincorporacion, tipoContratoReincorporacion,
    fechaIngreso, categoriasRequeridas, equipoSeleccionado, cargadorOnboarding, lineaOnboarding, usaEsim, esimLineaId, modoCelular,
    kitBienvenidaSolicitado, eppSolicitado, kitCantidadesSeleccionadas,
    motivoCambio, cambios, fechaDesvinculacion,
    coordEntrega, coordCambio, coordDevolucion,
  };
  const borrador = useBorrador({
    clave: 'borrador:nueva-solicitud',
    datos: datosBorrador,
    activo: tipo !== '' && !submitting,
  });

  const recuperarBorrador = () => {
    const d = borrador.recuperar() as Partial<typeof datosBorrador> | null;
    if (!d) return;
    // Cada campo se restaura solo si vino en el borrador: uno guardado por
    // una version anterior de esta pantalla no rompe nada.
    const poner = <K extends keyof typeof datosBorrador>(k: K, fijar: (v: (typeof datosBorrador)[K]) => void) => {
      if (d[k] !== undefined) fijar(d[k] as (typeof datosBorrador)[K]);
    };
    poner('tipo', setTipo);
    poner('step', setStep);
    poner('sedeId', (v) => v && setSedeId(v));
    poner('selectedEmployee', setSelectedEmployee);
    poner('employeeId', setEmployeeId);
    poner('observaciones', setObservaciones);
    poner('idTicket', setIdTicket);
    poner('devolucionEstados', setDevolucionEstados);
    poner('devolucionObservaciones', setDevolucionObservaciones);
    poner('devolucionMotivos', setDevolucionMotivos);
    poner('devolucionCargador', setDevolucionCargador);
    poner('devolucionCargadorObservaciones', setDevolucionCargadorObservaciones);
    poner('devolucionEppEstados', setDevolucionEppEstados);
    poner('devolucionEppObservaciones', setDevolucionEppObservaciones);
    poner('onboardingEmp', setOnboardingEmp);
    poner('modoEmpleadoOnboarding', setModoEmpleadoOnboarding);
    poner('cargoSolicitadoReincorporacion', setCargoSolicitadoReincorporacion);
    poner('tipoContratoReincorporacion', setTipoContratoReincorporacion);
    poner('fechaIngreso', setFechaIngreso);
    poner('categoriasRequeridas', setCategoriasRequeridas);
    poner('equipoSeleccionado', setEquipoSeleccionado);
    poner('cargadorOnboarding', setCargadorOnboarding);
    poner('lineaOnboarding', setLineaOnboarding);
    poner('usaEsim', setUsaEsim);
    poner('modoCelular', setModoCelular);
    poner('esimLineaId', setEsimLineaId);
    poner('kitBienvenidaSolicitado', setKitBienvenidaSolicitado);
    poner('eppSolicitado', setEppSolicitado);
    poner('kitCantidadesSeleccionadas', setKitCantidadesSeleccionadas);
    poner('motivoCambio', setMotivoCambio);
    poner('cambios', setCambios);
    poner('fechaDesvinculacion', setFechaDesvinculacion);
    poner('coordEntrega', setCoordEntrega);
    poner('coordCambio', setCoordCambio);
    poner('coordDevolucion', setCoordDevolucion);
    // Las asignaciones del empleado vienen de la base: se vuelven a pedir.
    if (d.selectedEmployee && (d.tipo === 'offboarding' || d.tipo === 'cambio_equipo')) {
      fetchEmployeeAssignments(d.selectedEmployee.id);
    }
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
      logger.error('Error fetching employee assignments', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setFieldErrors((prev) => sinErrores(prev, 'employeeId'));
    setEmployeeId(emp.id);
    buscador.reiniciar();
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
    setDevolucionMotivos({});
    setEmployeeEppAssignments([]);
    setDevolucionEppEstados({});
    setDevolucionEppObservaciones({});
    setCambios([]);
    setCambiosLinea([]);
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
      lineas: a.lineas,
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
  // En una desvinculacion, hay equipo que vuelve si alguno se califico y no es "no devolvio".

  const validarOnboarding = (): Record<string, string> => {
    const errores: Record<string, string> = {};

    if (modoEmpleadoOnboarding === 'nuevo') {
      for (const [campo] of CAMPOS_OBLIGATORIOS_ONBOARDING) {
        if (!onboardingEmp[campo].trim()) errores[campo] = DATO_OBLIGATORIO;
      }
      if (
        !errores.correoPersonal &&
        !esCorreoValido(onboardingEmp.correoPersonal)
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
    if (categoriasRequeridas.length === 0 && !kitBienvenidaSolicitado && !eppSolicitado && !usaEsim) {
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

    // Todo celular reservado sin linea necesita chip fisico o eSIM con su linea.
    const celularSinLinea = categorias.some((c) => {
      const id = equipoSeleccionado[c.id];
      const equipo = id ? disponiblesPorCategoria[c.id]?.items.find((i) => i.id === id) : undefined;
      const l = lineaOnboarding[c.id];
      return c.tipoFicha === 'celular' && !!equipo && !equipo.lineas?.length && !l?.lineaId;
    });
    if (usaEsim && !esimLineaId) errores.lineaCelular = 'Elige la eSIM de la persona';
    if (celularSinLinea) errores.lineaCelular = 'Elige la línea (chip físico) del celular';

    // Coordinacion de entrega: obligatoria si se reservo al menos un equipo.
    if (Object.values(equipoSeleccionado).length > 0) {
      Object.assign(errores, erroresCoordinacion(coordEntrega, CLAVES.entrega, DATO_OBLIGATORIO));
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

  // Todos los obligatorios del cambio de equipo, juntos (igual que onboarding).
  const validarCambio = (): Record<string, string> => {
    const errores: Record<string, string> = {};
    if (!selectedEmployee) errores.employeeId = 'Elige el empleado';
    if (!motivoCambio.trim()) errores.motivoCambio = DATO_OBLIGATORIO;
    if (selectedEmployee) {
      if (cambios.length === 0 && cambiosLinea.length === 0) {
        errores.cambioSeleccion = 'Marca al menos un equipo o una línea a cambiar';
      } else if (!cambios.every(itemCambioCompleto)) {
        errores.cambioSeleccion = 'Completa el estado de devolución y el reemplazo de cada equipo marcado';
      } else if (!cambiosLinea.every(itemLineaCompleto)) {
        errores.cambioSeleccion = 'Completa la línea nueva de cada línea marcada';
      }
      Object.assign(errores, erroresCoordinacion(coordCambio, CLAVES.cambio, DATO_OBLIGATORIO));
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
    if (!esRecuperacion && !fechaDesvinculacion) errores.fechaDesvinculacion = DATO_OBLIGATORIO;
    if (esRecuperacion && !loadingAssignments && employeeAssignments.length === 0) {
      errores.employeeId = 'Ya está desvinculado y no tiene equipos pendientes de devolución';
    }
    if (selectedEmployee) {
      if (employeeAssignments.some((a) => !devolucionEstados[a.id])) {
        errores.devoluciones = esRecuperacion
          ? 'Califica cada equipo (usa "Sigue sin devolver" si todavía no lo entrega)'
          : 'Califica cada equipo (usa "No devolvió" si no lo entregó)';
      } else if (
        esRecuperacion &&
        employeeAssignments.length > 0 &&
        employeeAssignments.every((a) => devolucionEstados[a.id] === 'no_devuelto')
      ) {
        errores.devoluciones = 'Marca al menos un equipo como devuelto (Buen estado o Dañado)';
      }
      if (
        !errores.devoluciones &&
        employeeAssignments.some(
          (a) =>
            devolucionEstados[a.id] === 'danado' &&
            Object.keys(erroresMotivoBaja(motivosBaja, motivoDe(a.id).motivoBajaId, motivoDe(a.id).detalle)).length > 0
        )
      ) {
        errores.devoluciones = 'Elige el motivo de baja de cada equipo dañado (y descríbelo si es "Otro")';
      }
      if (employeeEppAssignments.some((k) => !devolucionEppEstados[k.id])) {
        errores.devolucionesEpp = 'Califica cada artículo de EPP';
      }
      if (employeeAssignments.length + employeeEppAssignments.length > 0) {
        Object.assign(errores, erroresCoordinacion(coordDevolucion, CLAVES.devolucion, DATO_OBLIGATORIO));
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
    fechaDesvinculacion: 'Fecha de Desvinculación',
    observaciones: 'Observaciones',
    idTicket: 'ID Ticket',
  };

  const handleSubmit = async () => {
    setError('');
    setFieldErrors({});
    setResumenErrores('');

    {
      const errores = {
        ...(idTicket.trim() ? {} : { idTicket: 'Escribe el ID del ticket' }),
        ...(tipo === 'onboarding'
          ? validarOnboarding()
          : tipo === 'cambio_equipo'
            ? validarCambio()
            : validarOffboarding()),
      };
      if (Object.keys(errores).length > 0) {
        setFieldErrors(errores);
        setResumenErrores(textoResumenErrores(errores, ETIQUETAS_ERROR));
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
        idTicket: idTicket.trim(),
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

      // Onboarding (nuevo o reincorporacion): la coordinacion solo viaja si se
      // reservo algun equipo, y los articulos de Kit/EPP elegidos con cantidad.
      // Cada articulo elegido se entrega de inmediato Y queda registrado como
      // requerido individualmente (RequestKitItem): asi el cierre del ticket
      // puede exigir ese articulo puntual y no solo un booleano por categoria.
      const kitElegidos = Object.entries(kitCantidadesSeleccionadas)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([itemId, cantidad]) => ({ itemId, cantidad }));
      // Linea de cada celular (assetId -> id de la linea), solo de los reservados.
      const lineaPorAsset: Record<string, string> = {};
      for (const [catId, assetId] of Object.entries(equipoSeleccionado)) {
        const eleccion = lineaOnboarding[catId];
        if (eleccion?.lineaId) lineaPorAsset[assetId] = eleccion.lineaId;
      }
      const entregaOnboarding = {
        categoriasRequeridas,
        assetIdsSeleccionados: Object.values(equipoSeleccionado),
        condicionCargadorPorAsset,
        lineaPorAsset,
        lineaEsim: usaEsim && esimLineaId ? esimLineaId : undefined,
        ...(Object.values(equipoSeleccionado).length > 0 && cuerpoCoordinacion(coordEntrega, CLAVES.entrega)),
        kitBienvenidaSolicitado,
        eppSolicitado,
        kitItemsSeleccionados: kitElegidos,
        kitItemsRequeridos: kitElegidos,
      };

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
          ...entregaOnboarding,
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
          ...entregaOnboarding,
        };
      } else if (tipo === 'cambio_equipo') {
        body = {
          ...base,
          employeeId,
          motivoCambio,
          cambios: cambios.map((c) => ({
            oldAssignmentId: c.oldAssignmentId,
            newAssetId: c.modoCelular === 'esim' ? undefined : c.newAssetId,
            newLineaId: c.lineaNueva?.lineaId || undefined,
            newEsimLineaId: c.modoCelular === 'esim' ? c.esimLineaId : undefined,
            estadoDevolucion: c.estadoDevolucion,
            // Danado: se da de baja con el motivo de la lista (SPEC 2.135).
            ...((c.estadoDevolucion === 'danado' || c.estadoDevolucion === 'baja') && {
              motivoBajaId: c.motivoBajaId,
              motivoBajaDetalle: c.motivoBajaDetalle.trim() || undefined,
            }),
            observacionesDevolucion: c.observaciones || undefined,
            // Condicion del cargador, si el equipo la trae.
            condicionCargadorAnterior: c.condicionCargadorAnterior || undefined,
            observacionesCargadorAnterior: c.observacionesCargadorAnterior || undefined,
            condicionCargadorNuevo: c.condicionCargadorNuevo || undefined,
            observacionesCargadorNuevo: c.observacionesCargadorNuevo || undefined,
          })),
          cambiosLinea: cambiosLinea.map((l) => ({
            lineaId: l.lineaId,
            newLineaId: l.newLineaId || undefined,
            newAssetId: l.newAssetId || undefined,
          })),
          // Coordinacion de la entrega de los reemplazos, en el mismo formulario.
          ...cuerpoCoordinacion(coordCambio, CLAVES.cambio),
        };
      } else if (tipo === 'offboarding') {
        body = {
          ...base,
          employeeId,
          fechaDesvinculacion: esRecuperacion ? undefined : fechaDesvinculacion,
          ...cuerpoCoordinacion(coordDevolucion, CLAVES.devolucion),
          // Solo se envian los equipos que efectivamente se calificaron; si
          // se dejaron sin calificar, el ticket nace igual (solicitud_emitida)
          // y se completan despues desde el detalle.
          devoluciones: employeeAssignments
            .filter((a) => devolucionEstados[a.id])
            .map((a) => ({
              assignmentId: a.id,
              estadoDevolucion: devolucionEstados[a.id],
              // Danado: se da de baja con su motivo (SPEC 2.135).
              ...(devolucionEstados[a.id] === 'danado' && {
                motivoBajaId: motivoDe(a.id).motivoBajaId,
                motivoBajaDetalle: motivoDe(a.id).detalle.trim() || undefined,
              }),
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
        // Un dato repetido (409) trae details {field, message} sin path: se muestra su mensaje.
        if (err.details && Array.isArray(err.details) && err.details.every((d: { path?: unknown }) => Array.isArray(d.path))) {
          const errors: Record<string, string> = {};
          const messages: string[] = [];

          for (const issue of err.details) {
            const fieldPath = issue.path?.join('.') || '';
            const fieldName = fieldLabels[fieldPath] || fieldPath;
            const msg = issue.message || 'Campo inválido';
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
      borrador.limpiar();
      router.push(`/solicitudes/${data.id}`);
    } catch (err) {
      setError(mensajeDeError(err, 'Error al crear solicitud'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepDescriptions: Record<number, string> = {
    1: 'Selecciona el tipo de solicitud',
    2: tipo === 'onboarding' ? 'Datos del nuevo empleado y de la solicitud' : 'Completa los datos',
  };

  // Mismo campo en los dos formularios (onboarding y cambio/devolucion).
  const campoIdTicket = (
    <CampoTexto
      id="solicitud-id-ticket"
      label="ID Ticket"
      obligatorio
      value={idTicket}
      onChange={(v) => {
        setIdTicket(v);
        limpiarError('idTicket');
      }}
      error={fieldErrors.idTicket}
      maxLength={50}
      placeholder="Ej: 45821 o INC-2026-0045"
      ayuda="El ticket de la ticketera que origina esta solicitud."
    />
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <PageHeader
        backHref="/solicitudes"
        title="Nueva Solicitud"
        description={<>{stepDescriptions[step]}</>}
      />

      {borrador.borradorDe && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-fg sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm">
            Tienes un borrador sin enviar de las{' '}
            <span className="font-medium">
              {formatearFechaHora(borrador.borradorDe, { hour: '2-digit', minute: '2-digit' })}
            </span>
            .
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={recuperarBorrador} className={buttonClasses({ size: 'sm' })}>
              Recuperar
            </button>
            <button
              type="button"
              onClick={borrador.descartar}
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              Descartar
            </button>
          </div>
        </div>
      )}

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

          <ResumenErrores mensaje={resumenErrores} />

          {modoEmpleadoOnboarding === 'existente' && (
            <div className="space-y-4">
              <div>
                <p className="field-label mb-2">Empleado *</p>
                <BuscadorEmpleado
                  buscador={buscador}
                  seleccionado={selectedEmployee}
                  onElegir={selectEmployee}
                  onQuitar={clearEmployee}
                  error={fieldErrors.employeeId}
                  mostrarEstado
                  sinResultados="Si no existe, usa &quot;Empleado nuevo&quot; arriba."
                  ayuda="Escribe al menos 2 caracteres para buscar."
                />
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
            <FormEmpleadoNuevo
              valor={onboardingEmp}
              onCambiar={actualizarOnboardingEmp}
              errores={fieldErrors}
              fechaIngreso={fechaIngreso}
              onFechaIngreso={(v) => {
                setFechaIngreso(v);
                limpiarError('fechaIngreso');
              }}
            />
          )}

          <div className="border-t pt-4">{campoIdTicket}</div>

          {/* Responsable de la solicitud (solo lectura) */}
          <div>
            <label htmlFor="solicitud-responsable" className="field-label">Responsable</label>
            <input id="solicitud-responsable"
              type="text"
              value={
                session?.user?.name
                  ? nombreConUsuario(session.user.name, session.user.usuario)
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
                  // Celular: la persona usa su propio telefono con una eSIM (no se entrega equipo).
                  const esimAqui = cat.tipoFicha === 'celular' && usaEsim;
                  // La categoria queda requerida solo al elegir un equipo
                  // concreto: la casilla va en el equipo, no en la categoria.
                  const elegirEquipo = (itemId: string | null) => {
                    // Con un equipo elegido la sede queda fijada: un cambio
                    // del navbar no debe dejarlo en otra sede.
                    if (itemId) setSedeId(sedeId);
                    // Otro equipo, otra linea.
                    setLineaOnboarding((prev) => ({ ...prev, [cat.id]: SIN_LINEA }));
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
                  // Chip fisico despliega la lista de celulares; eSIM, el selector de eSIM.
                  const elegirModoCelular = (esim: boolean) => {
                    setModoCelular(esim ? 'esim' : 'chip');
                    setUsaEsim(esim);
                    if (esim !== usaEsim) setEsimLineaId('');
                    limpiarError('lineaCelular', 'equipos');
                    if (esim) elegirEquipo(null);
                    else setBusquedaEquipos('');
                  };
                  // Celular siempre se puede abrir: aunque no haya stock, queda la eSIM.
                  const sePuedeAbrir = conStock || cat.tipoFicha === 'celular';
                  return (
                    <div key={cat.id} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => {
                          if (!sePuedeAbrir) return;
                          setBusquedaEquipos('');
                          setCategoriaExpandida(expandida ? null : cat.id);
                        }}
                        disabled={!sePuedeAbrir}
                        className={cn(
                          'flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5',
                          sePuedeAbrir ? 'hover:bg-surface-muted' : 'cursor-not-allowed opacity-70'
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
                      {/* Siempre se pregunta: celular de la empresa (chip fisico) o eSIM en su propio telefono. */}
                      {cat.tipoFicha === 'celular' && (expandida || modoCelular !== '') && (
                        <div className="ml-6 mt-1 mb-1 flex flex-wrap gap-x-4 gap-y-1">
                          {([
                            [false, 'Chip físico (celular de la empresa)'],
                            [true, 'eSIM (usa su propio teléfono)'],
                          ] as const).map(([esim, titulo]) => (
                            <label key={titulo} className={cn('flex cursor-pointer items-center gap-1.5 text-xs', modoCelular === (esim ? 'esim' : 'chip') ? 'text-fg' : 'text-fg-muted')}>
                              <input
                                type="radio"
                                name="tipo-linea-celular"
                                checked={modoCelular === (esim ? 'esim' : 'chip')}
                                onChange={() => elegirModoCelular(esim)}
                                onClick={() => elegirModoCelular(esim)}
                              />
                              {titulo}
                            </label>
                          ))}
                        </div>
                      )}
                      {esimAqui && (
                        <ElegirLineaCelular
                          tipo="esim"
                          valor={{ modo: esimLineaId ? 'fisico' : 'ninguna', lineaId: esimLineaId }}
                          onChange={(v) => {
                            setEsimLineaId(v.lineaId);
                            limpiarError('lineaCelular');
                          }}
                          error={fieldErrors.lineaCelular}
                        />
                      )}
                      {cat.tipoFicha === 'celular' && expandida && modoCelular === 'chip' && !conStock && (
                        <p className="ml-6 text-xs text-fg-subtle">No hay celulares disponibles.</p>
                      )}
                      {expandida && !esimAqui && (cat.tipoFicha !== 'celular' || modoCelular === 'chip') && disp && disp.items.length > 0 && (
                        <div className="ml-6 mt-1 mb-1 space-y-0.5">
                          <p className="text-xs text-fg-subtle">
                            Marca el equipo que se entregará (uno por categoría).
                          </p>
                          {/* Buscador en todas las categorias, aunque haya pocos equipos. */}
                          <div className="relative my-1.5">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
                            <input
                              type="search"
                              value={busquedaEquipos}
                              onChange={(e) => setBusquedaEquipos(e.target.value)}
                              placeholder="Buscar por marca, modelo, serie o IMEI"
                              aria-label={`Buscar ${cat.nombre.toLowerCase()} disponible`}
                              className="field-input field-input-sm pl-7"
                            />
                          </div>
                          <ul className="text-xs text-fg-muted space-y-0.5 max-h-60 overflow-y-auto pr-1">
                            {disp.items
                              .filter((item) => item.id === seleccionado || coincidePorPalabras(busquedaEquipos, [item.marca, item.modelo, item.numeroSerie, item.imei, especificacionesEquipo(item)]))
                              .map((item) => (
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
                                    {item.numeroSerie ? ` — N° serie ${item.numeroSerie}` : item.imei ? ` — IMEI ${item.imei}` : ''}
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
                          {busquedaEquipos.trim() && !disp.items.some((item) => coincidePorPalabras(busquedaEquipos, [item.marca, item.modelo, item.numeroSerie, item.imei, especificacionesEquipo(item)])) && (
                            <p className="text-fg-subtle">Ningún equipo coincide con «{busquedaEquipos}».</p>
                          )}
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
                      {/* Un celular que llega sin linea: se le puede asociar una al momento (SPEC 2.143). */}
                      {cat.tipoFicha === 'celular' && equipoElegido && !equipoElegido.lineas?.length && (
                        <ElegirLineaCelular
                          valor={lineaOnboarding[cat.id] ?? SIN_LINEA}
                          onChange={(v) => {
                            setLineaOnboarding((prev) => ({ ...prev, [cat.id]: v }));
                            limpiarError('lineaCelular');
                          }}
                          excluidas={Object.entries(lineaOnboarding).filter(([id]) => id !== cat.id).map(([, l]) => l.lineaId).filter(Boolean)}
                          error={fieldErrors.lineaCelular}
                        />
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
              <SeccionCoordinacion
                titulo="Coordinar Entrega"
                descripcion="Define cuándo y cómo se le hará llegar el equipo reservado."
                valor={coordEntrega}
                onChange={setCoordEntrega}
                claves={CLAVES.entrega}
                errores={fieldErrors}
                limpiarError={limpiarError}
                etiquetas={{
                  fechaPresencial: 'Fecha y hora de entrega',
                  fechaDespacho: 'Fecha y hora de entrega estimada',
                  lugar: 'Lugar de entrega',
                }}
              />
            </div>
          )}

          {/* Kit de Bienvenida / EPP: aparte de Equipos Requeridos, no son Activos */}
          <SeccionKitEpp
            catalogo={kitCatalog}
            bloqueado={kitEppBloqueadoPorContrato}
            error={fieldErrors.kitEpp}
            solicitado={{ kit_bienvenida: kitBienvenidaSolicitado, epp: eppSolicitado }}
            onSolicitar={(categoria, marcado) => {
              if (categoria === 'kit_bienvenida') setKitBienvenidaSolicitado(marcado);
              else setEppSolicitado(marcado);
              // El stock de Kit/EPP es por sede: fija la sede.
              if (marcado) setSedeId(sedeId);
            }}
            cantidades={kitCantidadesSeleccionadas}
            onCantidades={setKitCantidadesSeleccionadas}
            limpiarError={limpiarError}
          />

          <div>
            <label htmlFor="solicitud-sede" className="field-label">
              Sede <span className="text-red-500">*</span>
            </label>
            <select id="solicitud-sede"
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
            <MensajeCampo mensaje={fieldErrors.sedeId} />
            <p className="text-xs text-fg-subtle mt-1">
              Obligatorio: a qué sede pertenece esta solicitud.
            </p>
          </div>

          {/* Observaciones */}
          <div>
            <label htmlFor="solicitud-observaciones" className="field-label">Observaciones</label>
            <textarea id="solicitud-observaciones"
              value={observaciones}
              maxLength={2000}
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
          <ResumenErrores mensaje={resumenErrores} />

          {/* Employee Selection */}
          <div>
            <p className="field-label mb-2">Empleado *</p>
            <BuscadorEmpleado
              buscador={buscador}
              seleccionado={selectedEmployee}
              onElegir={selectEmployee}
              onQuitar={clearEmployee}
              error={fieldErrors.employeeId}
              sinResultados="Si es una persona nueva, se registra con una solicitud de Onboarding."
              ayuda="Escribe al menos 2 caracteres para buscar. Una persona nueva se registra con una solicitud de Onboarding."
            />
          </div>

          {campoIdTicket}

          {/* Responsable de la solicitud (solo lectura) */}
          <div>
            <label htmlFor="solicitud-responsable-2" className="field-label">Responsable</label>
            <input id="solicitud-responsable-2"
              type="text"
              value={
                session?.user?.name
                  ? nombreConUsuario(session.user.name, session.user.usuario)
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
                  maxLength={1000}
                  onChange={(e) => {
                    setMotivoCambio(e.target.value);
                    limpiarError('motivoCambio');
                  }}
                  placeholder="Ej: Sobrecalentamiento, pantalla dañada..."
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
                    Equipos y líneas a cambiar *
                  </label>
                  <AvisoSeccion mensaje={fieldErrors.cambioSeleccion} className="mb-2" />
                  {loadingAssignments ? (
                    <div className="flex items-center gap-2 text-fg-subtle text-sm py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando equipos...
                    </div>
                  ) : (
                    <SeleccionarCambioEquipo
                      // Otra sede, otro inventario: se remonta el selector.
                      key={sedeId}
                      asignacionesActivas={employeeAssignments}
                      pedidoEsim={pedidoEsim}
                      activosElegidos={cambiosLinea.flatMap((l) => (l.newAssetId ? [l.newAssetId] : []))}
                      // Reemplazos solo de la sede de la solicitud (la del empleado).
                      sedeId={sedeId}
                      marcarIncompletos={!!fieldErrors.cambioSeleccion}
                      onChange={(lista) => {
                        setCambios(lista);
                        if (lista.length > 0 && lista.every(itemCambioCompleto)) {
                          limpiarError('cambioSeleccion');
                        }
                      }}
                    />
                  )}
                  {/* Lineas de la persona: se cambian solas o junto con sus equipos. */}
                  <p className="mt-4 mb-2 text-xs text-fg-subtle">También puedes cambiar una línea (su eSIM o la de su celular).</p>
                  <SeleccionarCambioLinea
                    key={selectedEmployee.id}
                    empleadoId={selectedEmployee.id}
                    sedeId={sedeId}
                    activosElegidos={cambios.flatMap((c) => (c.newAssetId ? [c.newAssetId] : []))}
                    celularesEnCambio={cambios.flatMap((c) => employeeAssignments.find((a) => a.id === c.oldAssignmentId)?.asset.id ?? [])}
                    marcarIncompletos={!!fieldErrors.cambioSeleccion}
                    onPasarAEsim={(activoId) => setPedidoEsim((p) => ({ activoId, n: (p?.n ?? 0) + 1 }))}
                    onChange={(lista) => {
                      setCambiosLinea(lista);
                      if (lista.length > 0 && lista.every(itemLineaCompleto)) limpiarError('cambioSeleccion');
                    }}
                  />
                </div>
              )}

              {/* Coordinacion de cambio: se muestra siempre junto con la
                  seleccion del equipo, igual que "Coordinar Entrega" en
                  Onboarding y "Coordinar Devolucion" en Offboarding. */}
              {selectedEmployee && (
                <>
                  <hr className="border-line" />
                  <SeccionCoordinacion
                    titulo="Coordinar Entrega del Reemplazo"
                    valor={coordCambio}
                    onChange={setCoordCambio}
                    claves={CLAVES.cambio}
                    errores={fieldErrors}
                    limpiarError={limpiarError}
                    etiquetas={{
                      fechaPresencial: 'Fecha y hora del cambio',
                      fechaDespacho: 'Fecha estimada de llegada',
                      lugar: 'Lugar',
                    }}
                  />
                </>
              )}
            </div>
          )}

          {tipo === 'offboarding' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-fg">Datos de Devolución</h3>

              {esRecuperacion && selectedEmployee && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Recuperación de equipos</p>
                  <p className="mt-0.5 text-amber-800">
                    {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno} ya está
                    desvinculado. Aquí se registran los equipos que quedaron &quot;No devuelto&quot;
                    y que entrega ahora; los que sigan sin devolver quedan como están.
                  </p>
                </div>
              )}

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
                        Califica cada equipo: el ticket se cierra al enviarse.{' '}
                        {esRecuperacion
                          ? 'Si todavía no lo entrega, marca "Sigue sin devolver".'
                          : 'Si el empleado no lo entregó, marca "No devolvió".'}{' '}
                        Un equipo dañado pasa a Mantención para evaluarlo.
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
                                    {asset.numeroSerie || !asset.imei ? 'Serie: ' : ''}{identificadorActivo(asset, 'Sin serie')}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 pl-1 space-y-2">
                                  <ElegirEstadoDevolucion
                                    nombre={`devolucion-${a.id}`}
                                    etiqueta={`${asset.marca} ${asset.modelo}`}
                                    valor={devolucionEstados[a.id]}
                                    onElegir={(estado) => {
                                      limpiarError('devoluciones');
                                      setDevolucionEstados((prev) => ({ ...prev, [a.id]: estado }));
                                    }}
                                    textoNoDevuelto={esRecuperacion ? 'Sigue sin devolver' : 'No devolvió'}
                                  />
                                  {devolucionEstados[a.id] === 'danado' && (
                                    <div className="space-y-2 rounded-md border border-line bg-surface p-2">
                                      <CamposMotivoBaja
                                        motivos={motivosBaja}
                                        motivoBajaId={motivoDe(a.id).motivoBajaId}
                                        detalle={motivoDe(a.id).detalle}
                                        onMotivo={(id) => {
                                          limpiarError('devoluciones');
                                          setDevolucionMotivos((prev) => ({ ...prev, [a.id]: { ...motivoDe(a.id), motivoBajaId: id } }));
                                        }}
                                        onDetalle={(texto) => setDevolucionMotivos((prev) => ({ ...prev, [a.id]: { ...motivoDe(a.id), detalle: texto } }))}
                                        errores={{}}
                                      />
                                      <p className="text-xs text-fg-subtle">El equipo queda de baja con este motivo al registrar la devolución.</p>
                                    </div>
                                  )}
                                  <input
                                    type="text"
                                    aria-label={`Observaciones de ${asset.marca} ${asset.modelo}`}
                                    maxLength={1000}
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

              {/* Lineas de la persona: solo para verlas (vuelven con el celular o
                  quedan disponibles al cerrar). En una recuperacion ya no aplica. */}
              {selectedEmployee && !esRecuperacion && <LineasAlDesvincular empleadoId={selectedEmployee.id} />}

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
                        <ElegirEstadoDevolucion
                          nombre={`devolucion-epp-${k.id}`}
                          etiqueta={k.item.nombre}
                          valor={devolucionEppEstados[k.id]}
                          onElegir={(estado) => {
                            limpiarError('devolucionesEpp');
                            setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: estado }));
                          }}
                          className="flex gap-4 text-sm text-fg-muted mb-2"
                        />
                        <input
                          type="text"
                          aria-label={`Observaciones de ${k.item.nombre}`}
                          maxLength={1000}
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

              {!esRecuperacion && (
                <CampoTexto
                  label="Fecha Desvinculación"
                  obligatorio
                  type="date"
                  className="max-w-xs"
                  error={fieldErrors.fechaDesvinculacion}
                  value={fechaDesvinculacion}
                  onChange={(v) => {
                    setFechaDesvinculacion(v);
                    limpiarError('fechaDesvinculacion');
                  }}
                />
              )}

              {/* Coordinacion de devolucion en su propia tarjeta, separada de
                  los datos de la desvinculacion. Mismo patron
                  presencial/chilexpress que Onboarding y Cambio de Equipo. */}
              <hr className="border-line" />
              <SeccionCoordinacion
                titulo="Coordinar Devolución"
                valor={coordDevolucion}
                onChange={setCoordDevolucion}
                claves={CLAVES.devolucion}
                errores={fieldErrors}
                limpiarError={limpiarError}
                etiquetas={{
                  fechaPresencial: 'Fecha y hora de la devolución',
                  fechaDespacho: 'Fecha estimada de llegada',
                  lugar: 'Lugar de devolución',
                }}
              />
            </div>
          )}

          {/* En Desvinculacion y Cambio de Equipo la sede ya no se elige: el
              empleado ya pertenece a una y se fija sola al elegirlo. */}
          <div>
            <label htmlFor="solicitud-sede-ticket" className="field-label">
              Sede <span className="text-red-500">*</span>
            </label>
            {(tipo === 'offboarding' || tipo === 'cambio_equipo') && selectedEmployee ? (
              <input id="solicitud-sede-ticket"
                type="text"
                value={sedes.find((s) => s.id === sedeId)?.nombre || 'Cargando...'}
                disabled
                className="w-full px-3 py-2 border border-line rounded-lg bg-surface-muted text-fg-muted"
              />
            ) : (
              <select id="solicitud-sede-ticket"
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
                : 'Obligatorio: a qué sede pertenece esta solicitud.'}
            </p>
          </div>

          {/* Observaciones */}
          <div>
            <label htmlFor="solicitud-observaciones-2" className="field-label">Observaciones</label>
            <textarea id="solicitud-observaciones-2"
              value={observaciones}
              maxLength={2000}
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

    </div>
  );
}
