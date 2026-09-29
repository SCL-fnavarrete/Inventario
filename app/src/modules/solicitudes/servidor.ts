// Puerta de solicitudes para el servidor: servicios y consultas con base de datos.
// Las pantallas usan '@/modules/solicitudes'. Los PDF tienen su propia puerta,
// '@/modules/solicitudes/documentos', para no cargar react-pdf en otras rutas (SPEC 2.118).
export * from '@/modules/solicitudes/consultasAsignaciones';
export * from '@/modules/solicitudes/crear';
export * from '@/modules/solicitudes/ejecucion';
export * from '@/modules/solicitudes/transicion';
