import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
