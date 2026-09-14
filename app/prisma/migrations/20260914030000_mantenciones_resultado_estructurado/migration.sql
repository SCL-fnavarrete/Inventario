-- Mantenciones (14-sep-2026, SPEC 2.25): resultado estructurado que decide
-- que pasa con el activo al completar la mantencion. Antes "resultado" era
-- solo texto libre y el activo SIEMPRE volvia a disponible/asignado/
-- reutilizable, sin importar lo que dijera ese texto -- si alguien escribia
-- "no reparable" a mano, el activo igual quedaba operativo. Pedido explicito
-- de Javier: que exista un boton "No reparable" que efectivamente de de baja
-- el equipo.
--
-- resultado_tipo: "reparado" | "no_reparable" | "pendiente_repuestos".
-- motivo_baja: obligatorio solo cuando resultado_tipo = "no_reparable".
-- Ambas nullable porque las mantenciones ya completadas antes de este
-- cambio no las tienen.

ALTER TABLE "maintenances" ADD COLUMN "resultado_tipo" TEXT;
ALTER TABLE "maintenances" ADD COLUMN "motivo_baja" TEXT;
