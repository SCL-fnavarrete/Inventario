-- Kit de Bienvenida / EPP requerido articulo por articulo.
--
-- Hasta ahora la solicitud solo guardaba dos banderas (kit_bienvenida_solicitado
-- y epp_solicitado), asi que "entregar EPP" se daba por cumplido con un solo
-- articulo cualquiera. Esta tabla lista los articulos concretos que se pidieron
-- y el estado de cada uno; el ticket no cierra mientras quede alguno pendiente,
-- y cada uno se puede marcar "no aplica" con su motivo.
--
-- Las banderas se mantienen: los tickets viejos no tienen filas aca y siguen
-- validandose con ellas.

CREATE TYPE "EstadoKitRequerido" AS ENUM ('pendiente', 'entregado', 'no_aplica');

CREATE TABLE "request_kit_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoKitRequerido" NOT NULL DEFAULT 'pendiente',
    "motivo_no_aplica" TEXT,
    "resuelto_por" TEXT,
    "resuelto_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_kit_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "request_kit_items_request_id_item_id_key" ON "request_kit_items"("request_id", "item_id");
CREATE INDEX "request_kit_items_request_id_idx" ON "request_kit_items"("request_id");

ALTER TABLE "request_kit_items" ADD CONSTRAINT "request_kit_items_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_kit_items" ADD CONSTRAINT "request_kit_items_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "welcome_kit_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
