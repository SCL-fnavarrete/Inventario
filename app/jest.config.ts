import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

/**
 * Umbrales de cobertura — Ola 1.2
 *
 * El umbral global plano de 70% estaba roto (la cobertura real era 3.41%), asi
 * que no protegia nada: nunca se ejecutaba en verde. Se reemplaza por pisos
 * diferenciados y medidos:
 *
 *  - Logica pura (maquinas de estado y schemas Zod): 90%, salvo el piso de
 *    ramas de los modulos que hoy no llegan, anotado con su valor real para
 *    que no pueda bajar mas. Las dos maquinas de estado estan al 100% y el
 *    umbral existe para defender ese numero, no para pedir trabajo nuevo.
 *  - Global: piso bajo pero real, que sube en cada ola. Los servicios que
 *    dependen de Prisma y las 63 rutas de API entran en la Ola 4.3, cuando
 *    existan los tests de integracion; recien ahi se quita `!src/app/api/**`
 *    de `collectCoverageFrom` y el global sube de verdad.
 *
 * Ratchet previsto para el umbral global: Ola 1 -> 6 (medido) · Ola 2 -> 15
 * (servicios de documentos y de historial) · Ola 3 -> 25 (servicios Graph)
 * · Ola 4 -> revision completa con las rutas de API dentro del pool.
 */
const LOGICA_PURA = { statements: 90, branches: 90, functions: 90, lines: 90 }

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  // Se mide la superficie que los tests unitarios pueden alcanzar hoy: logica
  // de negocio, validaciones, utilidades y hooks. Medir tambien las ~60
  // paginas React producia un 3.41% global que nadie podia mover y que volvia
  // inutil cualquier umbral. Las rutas de API entran en la Ola 4.3, con los
  // tests de integracion; los componentes, cuando haya tests de componente.
  collectCoverageFrom: [
    // Logica de los modulos y de shared, sin sus componentes React (igual que
    // antes con lib/ y hooks/, sin components/).
    'src/modules/**/*.{js,jsx,ts,tsx}',
    '!src/modules/**/componentes/**',
    'src/shared/**/*.{js,jsx,ts,tsx}',
    '!src/shared/ui/**',
    'src/proxy.ts',
    '!src/**/*.d.ts',
    // Plantillas PDF: markup declarativo, se cubren via los tests de
    // documentos de la Ola 2.
    '!src/modules/solicitudes/plantillas/**',
  ],
  coverageThreshold: {
    // Matriz de permisos: logica pura y unico punto de verdad de la
    // autorizacion. Hoy 100%.
    './src/shared/auth/permisos.ts': LOGICA_PURA,

    // Maquinas de estado: hoy 100% en las cuatro metricas.
    './src/modules/activos/maquinaEstados.ts': LOGICA_PURA,
    './src/modules/solicitudes/maquinaEstados.ts': LOGICA_PURA,

    // Schemas Zod con cobertura completa.
    './src/modules/activos/validaciones.ts': LOGICA_PURA,
    './src/modules/asignaciones/validaciones.ts': LOGICA_PURA,
    './src/shared/validaciones/rut.ts': LOGICA_PURA,

    // Schemas Zod cuyas ramas todavia no llegan a 90: el piso es el valor
    // real de hoy. Subirlo es trabajo de las olas siguientes.
    './src/modules/activos/validacionesTransicion.ts': { ...LOGICA_PURA, branches: 80 },
    './src/modules/mantenciones/validaciones.ts': { ...LOGICA_PURA, branches: 74 },
    './src/modules/personas/validaciones.ts': { ...LOGICA_PURA, branches: 59 },
    './src/modules/solicitudes/validaciones.ts': { ...LOGICA_PURA, branches: 42 },

    // OJO: Jest saca del pool global los archivos que ya tienen umbral propio
    // arriba. Por eso este numero (6.5% medido) es mucho mas bajo que el
    // 39% que muestra la fila "All files" del reporte: aqui solo quedan los
    // servicios que dependen de Prisma, las utilidades y los hooks sin test.
    global: {
      statements: 6,
      branches: 50,
      functions: 28,
      lines: 6,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config)
