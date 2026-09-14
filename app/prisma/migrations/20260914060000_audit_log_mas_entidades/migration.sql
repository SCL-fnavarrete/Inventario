-- SPEC 2.31: Javier pidio que la auditoria genérica cubra "todos los
-- modulos, todas las acciones del sistema". Se agregan los 5 modulos que
-- hoy no tenian ningun registro de quien hizo que: Mantenciones, Guias de
-- Despacho, Desvinculaciones, Kit/EPP y Configuracion (Sedes/Categorias/
-- Tipos de Mantencion). Proveedores queda excluido (tabla sin uso, se va a
-- eliminar); Activos y Solicitudes quedan excluidos porque ya tienen su
-- propio historial mas detallado.

-- AlterEnum
ALTER TYPE "AuditEntidad" ADD VALUE 'mantencion';
ALTER TYPE "AuditEntidad" ADD VALUE 'guia_despacho';
ALTER TYPE "AuditEntidad" ADD VALUE 'desvinculacion';
ALTER TYPE "AuditEntidad" ADD VALUE 'kit_item';
ALTER TYPE "AuditEntidad" ADD VALUE 'sede';
ALTER TYPE "AuditEntidad" ADD VALUE 'categoria';
ALTER TYPE "AuditEntidad" ADD VALUE 'tipo_mantencion';
