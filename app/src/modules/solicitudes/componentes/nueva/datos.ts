import { ArrowLeftRight, Undo2, UserPlus } from 'lucide-react';
import { textoLineas } from '@/modules/activos';

/**
 * Tipos, constantes y funciones auxiliares de Nueva Solicitud (auditoria
 * 28-sep-2026, 3.6): antes estaban al inicio de la pagina, que tenia 2.700
 * lineas. Se movieron tal cual; solo se exportan.
 */

export type Employee = {
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
export type EmployeeAssignment = {
  id: string;
  activo: boolean;
  // "no_devuelto" si quedo pendiente en una desvinculacion anterior.
  estadoDevolucion?: string | null;
  asset: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    imei?: string | null;
    categoria: { nombre: string };
    tieneCargador: boolean;
  };
};

// EPP entregado al empleado y aun no devuelto -- el Kit de Bienvenida no
// entra aca porque es consumible, no se devuelve al desvincularse.
export type EmployeeKitAssignment = {
  id: string;
  estado: string;
  item: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp' };
};

export function toggleCategoriaRequerida(
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
export type EquipoDisponible = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  imei: string | null;
  lineas?: { numero: string; plan: { nombre: string } | null }[];
  operador: string | null;
  pulgadas: string | number | null;
  // Si el equipo es nuevo o usado; sale del campo `condicion`.
  condicion: 'nuevo' | 'usado' | 'danado';
  tieneCargador: boolean;
};

export function especificacionesEquipo(a: EquipoDisponible): string {
  const partes: string[] = [];
  if (a.procesador) partes.push(a.procesador);
  if (a.ram) partes.push(a.ram);
  if (a.discoDuro) partes.push(a.discoDuro);
  if (a.sistemaOperativo) partes.push(a.sistemaOperativo);
  if (a.imei) partes.push(`IMEI ${a.imei}`);
  if (a.lineas?.length) partes.push(textoLineas(a.lineas));
  if (a.operador) partes.push(a.operador);
  if (a.pulgadas) partes.push(`${a.pulgadas}"`);
  return partes.join(' · ');
}

export const TIPOS = [
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

export const NEW_EMPLOYEE_INITIAL = {
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
export const CAMPOS_OBLIGATORIOS_ONBOARDING = [
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
export const ETIQUETAS_ERROR: Record<string, string> = {
  ...Object.fromEntries(CAMPOS_OBLIGATORIOS_ONBOARDING),
  idTicket: 'ID Ticket',
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
  cambioSeleccion: 'Equipos a cambiar',
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

export const DATO_OBLIGATORIO = 'Este dato es obligatorio';
