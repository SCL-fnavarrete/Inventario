// Puerta de lineas para el servidor: servicios con base de datos (SPEC 2.118). La importacion
// de Excel va aparte (`@/modules/lineas/excel`): asi Activos puede avisar a Lineas sin ciclos.
export * from '@/modules/lineas/catalogos';
export * from '@/modules/lineas/consultas';
export * from '@/modules/lineas/historial';
export * from '@/modules/lineas/indicadores';
export * from '@/modules/lineas/servicio';
export * from '@/modules/lineas/tenencia';
