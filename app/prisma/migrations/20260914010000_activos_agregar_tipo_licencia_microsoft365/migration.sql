-- Activos (14-sep-2026, SPEC 2.23): se agrega el nombre del plan/licencia de
-- Microsoft 365 ("Premium", "E3", etc). Antes el sistema solo guardaba un
-- booleano Si/No (microsoft_365) -- el Excel de Notebooks trae el nombre del
-- plan en la columna "Microsoft 365 Empresa" y se perdia al importar.
-- Pedido explicito de Javier, al revisar el Excel de Notebooks antes de
-- importarlo.

ALTER TABLE "assets" ADD COLUMN "tipo_licencia_microsoft365" TEXT;
