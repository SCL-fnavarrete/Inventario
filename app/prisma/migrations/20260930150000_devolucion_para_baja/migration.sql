-- SPEC 2.126: en un cambio de equipo, el anterior se puede devolver "para
-- dar de baja" con un motivo de la lista (va a mantencion).
ALTER TYPE "EstadoDevolucion" ADD VALUE 'baja';
