-- Lineas (SPEC 2.131, v2.64): el estado y el plan pasan a ser catalogos, y
-- la linea gana un historial. Los datos que ya existen se convierten.

-- CreateEnum
CREATE TYPE "TipoEventoLinea" AS ENUM ('creacion', 'importacion', 'precio', 'plan', 'estado', 'celular', 'persona', 'datos');

-- CreateTable
CREATE TABLE "estados_linea" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "de_baja" BOOLEAN NOT NULL DEFAULT false,
    "clave" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estados_linea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "estados_linea_nombre_key" ON "estados_linea"("nombre");
CREATE UNIQUE INDEX "estados_linea_clave_key" ON "estados_linea"("clave");

CREATE TABLE "planes_linea" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_mensual" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planes_linea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "planes_linea_nombre_key" ON "planes_linea"("nombre");

CREATE TABLE "lineas_historial" (
    "id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "tipo" "TipoEventoLinea" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "vigente_desde" TIMESTAMP(3) NOT NULL,
    "usuario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lineas_historial_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lineas_historial_linea_id_idx" ON "lineas_historial"("linea_id");
CREATE INDEX "lineas_historial_vigente_desde_idx" ON "lineas_historial"("vigente_desde");

-- Estados de base. Activa y Dada de baja los usa el sistema (clave).
INSERT INTO "estados_linea" ("id", "nombre", "de_baja", "clave") VALUES
  (gen_random_uuid()::text, 'Activa', false, 'activa'),
  (gen_random_uuid()::text, 'Suspendida', false, NULL),
  (gen_random_uuid()::text, 'En portabilidad', false, NULL),
  (gen_random_uuid()::text, 'Dada de baja', true, 'baja')
ON CONFLICT DO NOTHING;

-- Planes: los textos que ya tenian las lineas, con el precio mas comun de cada uno.
INSERT INTO "planes_linea" ("id", "nombre", "precio_mensual")
SELECT gen_random_uuid()::text, plan, (
  SELECT precio_mensual FROM "lineas_telefonicas" l2
  WHERE trim(l2.plan) = p.plan AND precio_mensual IS NOT NULL
  GROUP BY precio_mensual ORDER BY count(*) DESC, precio_mensual LIMIT 1
)
FROM (SELECT DISTINCT trim(plan) AS plan FROM "lineas_telefonicas" WHERE trim(coalesce(plan, '')) <> '') p
ON CONFLICT ("nombre") DO NOTHING;

-- Lineas: estado y plan pasan a apuntar al catalogo.
ALTER TABLE "lineas_telefonicas" ADD COLUMN "estado_id" TEXT, ADD COLUMN "plan_id" TEXT;
UPDATE "lineas_telefonicas" l SET "estado_id" = e.id
FROM "estados_linea" e WHERE e.clave = (CASE WHEN l.estado::text = 'baja' THEN 'baja' ELSE 'activa' END);
UPDATE "lineas_telefonicas" l SET "plan_id" = p.id FROM "planes_linea" p WHERE p.nombre = trim(l.plan);
ALTER TABLE "lineas_telefonicas" ALTER COLUMN "estado_id" SET NOT NULL;

-- Cada linea que ya existe parte su historial con lo que tiene hoy.
INSERT INTO "lineas_historial" ("id", "linea_id", "tipo", "descripcion", "datos_nuevos", "vigente_desde")
SELECT gen_random_uuid()::text, l.id, 'creacion', 'Línea registrada',
       jsonb_build_object('precioMensual', l.precio_mensual, 'estadoId', l.estado_id, 'deBaja', e.de_baja, 'planId', l.plan_id),
       l.created_at
FROM "lineas_telefonicas" l JOIN "estados_linea" e ON e.id = l.estado_id;

-- Lo anterior se quita.
DROP INDEX "lineas_telefonicas_estado_idx";
ALTER TABLE "lineas_telefonicas" DROP COLUMN "estado", DROP COLUMN "plan";
DROP TYPE "EstadoLinea";

-- CreateIndex
CREATE INDEX "lineas_telefonicas_estado_id_idx" ON "lineas_telefonicas"("estado_id");
CREATE INDEX "lineas_telefonicas_plan_id_idx" ON "lineas_telefonicas"("plan_id");

-- AddForeignKey
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estados_linea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lineas_historial" ADD CONSTRAINT "lineas_historial_linea_id_fkey" FOREIGN KEY ("linea_id") REFERENCES "lineas_telefonicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
