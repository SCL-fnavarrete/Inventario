-- Umbral configurable de "stock bajo" por articulo de Kit de Bienvenida/EPP
-- (WelcomeKitItem, tabla real "welcome_kit_items" -- ver comentario en el
-- migration anterior sobre por que aca va el nombre mapeado, no el del
-- modelo Prisma). Default 5: alerta razonable de fabrica, cada articulo se
-- puede ajustar despues desde Configuracion > Kit y EPP.
ALTER TABLE "welcome_kit_items" ADD COLUMN "stock_minimo" INTEGER NOT NULL DEFAULT 5;
