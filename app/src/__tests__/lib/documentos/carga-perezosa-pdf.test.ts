/** @jest-environment node */

/**
 * El renderizador de PDF se carga solo cuando hay que renderizar.
 *
 * `@react-pdf/renderer` arrastra yoga (WebAssembly) y varios megas de
 * tipografías y parsers. Importarlo desde `documentEmissionService` a nivel de
 * módulo hacía que **cualquier** ruta que tocara evidencia lo cargara: la
 * sincronización de empleados terminaba levantando el motor de PDF para mandar
 * un correo. En una función serverless eso es arranque en frío pagado por algo
 * que no se usa.
 *
 * La prueba mide esa propiedad de la forma más directa posible: bajo Jest el
 * módulo ESM ni siquiera carga, así que si alguien vuelve a ponerlo como
 * import estático, importar estos servicios revienta aquí.
 */

/*
 * `require` en vez de `import`: la prueba mide **cuando** se carga un modulo,
 * y para eso necesita controlar el momento dentro de `isolateModules`. Un
 * import estatico se izaria fuera del bloque y no probaria nada.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

describe('carga perezosa del renderizador de PDF', () => {
  test('emitir y notificar no cargan @react-pdf/renderer al importarse', () => {
    jest.isolateModules(() => {
      expect(() => require('@/lib/services/documentEmissionService')).not.toThrow();
      expect(() => require('@/lib/services/notificationService')).not.toThrow();
    });
  });

  test('las rutas que no renderizan tampoco lo cargan', () => {
    jest.isolateModules(() => {
      jest.doMock('@/lib/prisma', () => ({ prisma: {} }));
      expect(() => require('@/app/api/microsoft-sync/route')).not.toThrow();
    });
  });
});
