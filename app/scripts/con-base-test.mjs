// Corre un comando contra la base de pruebas (inventario_it_test) en vez de la
// de desarrollo, sin tocar .env. Lee .env con Node para que caracteres como
// `$` en la clave no los interprete la shell.
//
//   node --env-file=.env scripts/con-base-test.mjs npx prisma migrate deploy
//   node --env-file=.env scripts/con-base-test.mjs npx jest concurrencia.int
import { spawnSync } from "node:child_process";

const aTest = (url) => url?.replace(/\/inventario_it_dev(\?|$)/, "/inventario_it_test$1");
const env = {
  ...process.env,
  DATABASE_URL: aTest(process.env.DATABASE_URL),
  DATABASE_URL_UNPOOLED: aTest(process.env.DATABASE_URL_UNPOOLED),
};

// Nunca contra otra base: el test de integracion escribe y borra datos.
if (!env.DATABASE_URL?.includes("_test") || !env.DATABASE_URL_UNPOOLED?.includes("_test")) {
  console.error("DATABASE_URL no apunta a inventario_it_test. No se ejecuta nada.");
  process.exit(1);
}

const [comando, ...argumentos] = process.argv.slice(2);
const r = spawnSync(comando, argumentos, { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
