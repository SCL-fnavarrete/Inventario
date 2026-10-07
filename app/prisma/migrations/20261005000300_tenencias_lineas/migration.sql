-- Tenencias de las lineas y motivos de reasignacion (SPEC 2.131): cada tramo
-- en que una linea estuvo en un telefono y/o con una persona, para ver quien la
-- tuvo y cuantas veces se reasigno.

-- CreateEnum
CREATE TYPE "OrigenTenencia" AS ENUM ('alta', 'importacion', 'reasignacion', 'entrega_telefono', 'devolucion_telefono');

-- CreateTable
CREATE TABLE "motivos_reasignacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motivos_reasignacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lineas_tenencias" (
    "id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "activo_id" TEXT,
    "empleado_id" TEXT,
    "responsable" TEXT,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "origen" "OrigenTenencia" NOT NULL,
    "motivo_id" TEXT,
    "detalle" TEXT,
    "usuario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lineas_tenencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motivos_reasignacion_nombre_key" ON "motivos_reasignacion"("nombre");
CREATE INDEX "lineas_tenencias_linea_id_desde_idx" ON "lineas_tenencias"("linea_id", "desde");
CREATE INDEX "lineas_tenencias_empleado_id_idx" ON "lineas_tenencias"("empleado_id");
CREATE INDEX "lineas_tenencias_activo_id_idx" ON "lineas_tenencias"("activo_id");

-- AddForeignKey
ALTER TABLE "lineas_tenencias" ADD CONSTRAINT "lineas_tenencias_linea_id_fkey" FOREIGN KEY ("linea_id") REFERENCES "lineas_telefonicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lineas_tenencias" ADD CONSTRAINT "lineas_tenencias_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lineas_tenencias" ADD CONSTRAINT "lineas_tenencias_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lineas_tenencias" ADD CONSTRAINT "lineas_tenencias_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_reasignacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Motivos de base.
INSERT INTO "motivos_reasignacion" ("id", "nombre") VALUES
  (gen_random_uuid()::text, 'Cambio de equipo'),
  (gen_random_uuid()::text, 'Cambio de persona'),
  (gen_random_uuid()::text, 'Persona desvinculada'),
  (gen_random_uuid()::text, 'Línea nueva'),
  (gen_random_uuid()::text, 'Otro')
ON CONFLICT ("nombre") DO NOTHING;

-- Cada linea que ya existe parte con un tramo abierto: su telefono, su persona
-- de hoy (la del telefono o, sin telefono, la guardada en la linea) y su
-- ubicacion, desde que se registro. No se puede saber quien la tuvo antes.
INSERT INTO "lineas_tenencias" ("id", "linea_id", "activo_id", "empleado_id", "responsable", "desde", "origen")
SELECT gen_random_uuid()::text,
       l."id",
       l."activo_id",
       COALESCE(a."empleado_actual_id", l."empleado_id"),
       l."responsable",
       COALESCE(
         (SELECT min(h."vigente_desde") FROM "lineas_historial" h
           WHERE h."linea_id" = l."id" AND h."tipo" IN ('creacion', 'importacion')),
         l."created_at"
       ),
       'alta'
FROM "lineas_telefonicas" l
LEFT JOIN "assets" a ON a."id" = l."activo_id";
