/**
 * Guarda de la Ola 0 — baseline de migraciones.
 *
 * `prisma db push` sincroniza el schema contra la base sin dejar migracion
 * versionada. Fue lo que dejo 18 de los 19 modelos sin historial auditable.
 * Para ISO 9001 el control de cambios de la base es evidencia, asi que el
 * comando queda deshabilitado a proposito.
 */
console.error(`
  db:push esta deshabilitado desde la Ola 0 (baseline de migraciones).

  El historial de migraciones es evidencia auditable (ISO 9001, 7.5.3).
  Usa en su lugar:

    npm run db:migrate        crear una migracion versionada (desarrollo)
    npm run db:migrate:prod   aplicar migraciones pendientes (produccion)
    npm run db:status         verificar que no haya deriva

  Si necesitas iterar rapido sobre el schema, hazlo contra una base local
  y consolida el resultado en una sola migracion antes de commitear.
`);
process.exit(1);
