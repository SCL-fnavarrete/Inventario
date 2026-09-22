-- El correo de empresa deja de ser obligatorio; el personal pasa a ser el
-- identificador principal (sigue siendo unico, pero se exige a nivel de
-- aplicacion, no de columna, porque hoy hay filas sin ese dato).
ALTER TABLE "employees" ALTER COLUMN "correo_empresa" DROP NOT NULL;

-- Catalogos de opciones para sistema operativo, antivirus y licencia
-- Microsoft 365 del activo (antes texto libre). El activo sigue guardando
-- el valor como texto plano: estas tablas solo alimentan el selector.
CREATE TABLE "sistemas_operativos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sistemas_operativos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sistemas_operativos_nombre_key" ON "sistemas_operativos"("nombre");

CREATE TABLE "antivirus_opciones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "antivirus_opciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "antivirus_opciones_nombre_key" ON "antivirus_opciones"("nombre");

CREATE TABLE "licencias_microsoft365" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "licencias_microsoft365_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "licencias_microsoft365_nombre_key" ON "licencias_microsoft365"("nombre");

-- Semilla: valores ya usados hoy en activos, uno por cada nombre distinto
-- ignorando mayusculas/espacios (ante un duplicado por typo o mayuscula,
-- se queda con la primera variante en orden alfabetico).
INSERT INTO "sistemas_operativos" ("id", "nombre", "activo", "created_at")
SELECT gen_random_uuid()::text, nombre, true, CURRENT_TIMESTAMP FROM (
  SELECT DISTINCT ON (lower(trim("sistema_operativo"))) trim("sistema_operativo") AS nombre
  FROM "assets"
  WHERE "sistema_operativo" IS NOT NULL AND trim("sistema_operativo") <> ''
  ORDER BY lower(trim("sistema_operativo")), "sistema_operativo"
) t;

INSERT INTO "antivirus_opciones" ("id", "nombre", "activo", "created_at")
SELECT gen_random_uuid()::text, nombre, true, CURRENT_TIMESTAMP FROM (
  SELECT DISTINCT ON (lower(trim("antivirus"))) trim("antivirus") AS nombre
  FROM "assets"
  WHERE "antivirus" IS NOT NULL AND trim("antivirus") <> ''
  ORDER BY lower(trim("antivirus")), "antivirus"
) t;

INSERT INTO "licencias_microsoft365" ("id", "nombre", "activo", "created_at")
SELECT gen_random_uuid()::text, nombre, true, CURRENT_TIMESTAMP FROM (
  SELECT DISTINCT ON (lower(trim("tipo_licencia_microsoft365"))) trim("tipo_licencia_microsoft365") AS nombre
  FROM "assets"
  WHERE "tipo_licencia_microsoft365" IS NOT NULL AND trim("tipo_licencia_microsoft365") <> ''
  ORDER BY lower(trim("tipo_licencia_microsoft365")), "tipo_licencia_microsoft365"
) t;
