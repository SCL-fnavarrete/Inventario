-- El N° de activacion del celular se quita (SPEC 2.144): el numero y el plan viven en Lineas.
ALTER TABLE "assets" DROP COLUMN "numero_activacion";
