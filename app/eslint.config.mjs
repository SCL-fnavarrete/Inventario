import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Monolito modular (SPEC 2.118): desde fuera de un modulo solo se entra por
// sus puertas: '@/modules/x' (reglas y tipos), '@/modules/x/servidor'
// (servicios con base de datos) y '@/modules/x/componentes'; los PDF de
// solicitudes y el Excel de activos, por su peso, entran por
// '@/modules/solicitudes/documentos' y '@/modules/activos/excel'. Dentro de su
// modulo cada archivo importa libre. shared/ no usa modulos.
const MODULOS = readdirSync(new URL("./src/modules", import.meta.url));
const soloPuertas = (m) => ({
  group: [`@/modules/${m}/*`, `!@/modules/${m}/servidor`, `!@/modules/${m}/componentes`, `!@/modules/${m}/documentos`, `!@/modules/${m}/excel`, `@/modules/${m}/componentes/*`],
  message: `Entra a "${m}" por sus puertas: '@/modules/${m}', '@/modules/${m}/servidor' o '@/modules/${m}/componentes' (SPEC 2.118).`,
});
const limitar = (files, modulos, paths = []) => ({
  files,
  ignores: ["**/*.test.ts", "**/*.test.tsx"],
  rules: { "no-restricted-imports": ["error", { paths, patterns: modulos.map(soloPuertas) }] },
});
// Las rutas y pantallas no tocan la base: le piden todo a los modulos (SPEC 3.2.2).
const SIN_BASE = [
  { name: "@/shared/prisma", message: "src/app no usa la base: llama a la función del módulo en su puerta servidor (SPEC 3.2.2)." },
];
const limitesModulos = [
  ...MODULOS.map((m) => limitar([`src/modules/${m}/**/*.{ts,tsx}`], MODULOS.filter((x) => x !== m))),
  limitar(["src/app/**/*.{ts,tsx}", "src/proxy.ts"], MODULOS, SIN_BASE),
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/modules/*"], message: "shared/ no usa módulos: lo común no depende de un dominio (SPEC 2.118)." }] }],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Scripts utilitarios de Node (CommonJS): no son codigo de la app y se
  // ejecutan con `node`, asi que `require()` es la forma correcta ahi.
  {
    files: ["*.js", "scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Los tests destructuran `{ campo, ...resto }` para probar el schema sin
  // ese campo; `campo` nunca se usa a proposito. ignoreRestSiblings evita el
  // warning de no-unused-vars para ese patron especifico, sin dejar de
  // avisar sobre variables realmente no usadas.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  ...limitesModulos,
]);

export default eslintConfig;
