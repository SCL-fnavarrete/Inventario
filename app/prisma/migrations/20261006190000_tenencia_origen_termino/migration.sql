-- Origen de un tramo de tenencia: la devolucion por termino libera las eSIM de
-- la persona (SPEC 2.131).
ALTER TYPE "OrigenTenencia" ADD VALUE IF NOT EXISTS 'termino';
