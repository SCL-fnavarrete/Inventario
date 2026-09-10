-- Extiende al Dashboard el mismo tipo de alerta de stock que ya existe para
-- Kit de Bienvenida/EPP, ahora tambien para activos: Javier pidio que
-- avise cuando una categoria de activos (Notebook, Celular, Monitor, etc.)
-- se queda sin equipos disponibles o le quedan pocos. Tabla real
-- "asset_categories" (@@map del modelo AssetCategory).
ALTER TABLE "asset_categories" ADD COLUMN "stock_minimo" INTEGER NOT NULL DEFAULT 3;
