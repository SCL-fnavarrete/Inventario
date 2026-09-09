-- Agrega el estado 'cancelada' al enum EstadoSolicitud.
-- Usado por POST /api/solicitudes/[id]/cancelar: permite cancelar una
-- solicitud (de cualquier tipo) mientras no haya ejecutado ningun efecto
-- secundario todavia (assignment_ids/kit_return_ids vacios). Ver SPEC 2.5.2
-- / 2.5.3 (v1.4).
ALTER TYPE "EstadoSolicitud" ADD VALUE 'cancelada';
