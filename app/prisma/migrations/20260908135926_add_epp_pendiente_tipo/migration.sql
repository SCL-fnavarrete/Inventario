-- Agrega el valor "epp" al enum TipoPendiente para el checkbox generico de EPP
-- en el flujo de Onboarding (reemplaza los valores especificos epp_zapatos/
-- epp_chaleco/epp_casco/epp_lentes para este caso de uso). ADD VALUE es
-- aditivo y seguro: no requiere backfill ni afecta las filas existentes.
ALTER TYPE "TipoPendiente" ADD VALUE 'epp';
