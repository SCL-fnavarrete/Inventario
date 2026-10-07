-- Estado "Por confirmar" de una linea (SPEC 2.131): esta en la factura del
-- operador, pero no se sabe quien la usa; queda para que alguien lo confirme.
-- Sigue contratada, asi que cuenta en el costo (no es de baja). Si ya existe no se toca.
INSERT INTO "estados_linea" ("id", "nombre", "de_baja", "clave")
VALUES (gen_random_uuid()::text, 'Por confirmar', false, 'por_confirmar')
ON CONFLICT DO NOTHING;
