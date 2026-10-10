-- Opciones de supervisor, division, area, sub-area y listas de distribucion (SPEC 2.142).
CREATE TYPE "TipoOpcionPersona" AS ENUM ('supervisor', 'division', 'area', 'sub_area', 'lista_distribucion');

CREATE TABLE "opciones_persona" (
    "id" TEXT NOT NULL,
    "tipo" "TipoOpcionPersona" NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opciones_persona_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opciones_persona_tipo_nombre_key" ON "opciones_persona"("tipo", "nombre");
