// Componentes que usan otros modulos y las pantallas (etapa 4, SPEC 2.118).
export {
  FilaEquipoTicket,
  type AsignacionFila,
} from '@/modules/solicitudes/componentes/FilaEquipoTicket';
export {
  SeleccionarCambioEquipo,
  itemCambioCompleto,
  type ItemCambioEquipo,
} from '@/modules/solicitudes/componentes/SeleccionarCambioEquipo';
export {
  BuscadorEmpleado,
  useBuscarEmpleado,
  type BuscadorEmpleadoEstado,
} from '@/modules/solicitudes/componentes/nueva/BuscadorEmpleado';
export {
  ElegirEstadoDevolucion,
  type EstadoDevolucion,
} from '@/modules/solicitudes/componentes/nueva/ElegirEstadoDevolucion';
export {
  FormEmpleadoNuevo,
  type EmpleadoNuevo,
} from '@/modules/solicitudes/componentes/nueva/FormEmpleadoNuevo';
export { SeccionCoordinacion } from '@/modules/solicitudes/componentes/nueva/SeccionCoordinacion';
export {
  SeccionKitEpp,
  type ArticuloKit,
  type CategoriaKit,
} from '@/modules/solicitudes/componentes/nueva/SeccionKitEpp';
export {
  CLAVES,
  COORDINACION_VACIA,
  cuerpoCoordinacion,
  erroresCoordinacion,
  type ClavesCoordinacion,
  type Coordinacion,
  type Medio,
} from '@/modules/solicitudes/componentes/nueva/coordinacion';
export {
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
} from '@/modules/solicitudes/componentes/nueva/datos';
