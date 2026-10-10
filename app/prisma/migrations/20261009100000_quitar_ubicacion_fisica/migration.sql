-- La ubicacion fisica del equipo se quita (SPEC 2.138): la sede dice donde esta y la persona asignada, con quien.
ALTER TABLE "assets" DROP COLUMN "ubicacion_fisica";
