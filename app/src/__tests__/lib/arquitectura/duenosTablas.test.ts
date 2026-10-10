/**
 * @jest-environment node
 */
// Monolito modular (SPEC 2.118): cada tabla tiene UN modulo dueno, el unico
// que la escribe. Los demas le piden el cambio a sus funciones (por ejemplo
// cambiarEstado de Activos, executeAssignment de Asignaciones). Este test
// falla si alguien escribe una tabla ajena, o si se agrega una tabla al
// schema sin decir de quien es.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(__dirname, '..', '..', '..');
const SCHEMA = path.join(SRC, '..', 'prisma', 'schema.prisma');

/** Dueno de cada tabla: un modulo de src/modules o una pieza de src/shared. */
const DUENOS: Record<string, string> = {
  asset: 'activos',
  assetHistory: 'activos',
  assetCategory: 'activos',
  marca: 'activos',
  sistemaOperativo: 'activos',
  antivirus: 'activos',
  licenciaMicrosoft365: 'activos',
  employee: 'personas',
  opcionPersona: 'personas',
  assignment: 'asignaciones',
  maintenance: 'mantenciones',
  maintenanceType: 'mantenciones',
  motivoBaja: 'mantenciones',
  dispatchGuide: 'despachos',
  dispatchGuideItem: 'despachos',
  dispatchGuideKitItem: 'despachos',
  purchase: 'compras',
  purchaseAsset: 'compras',
  purchaseKitItem: 'compras',
  purchaseKitReparto: 'compras',
  lineaTelefonica: 'lineas',
  tipoChip: 'lineas',
  operadorLinea: 'lineas',
  estadoLinea: 'lineas',
  lineaHistorial: 'lineas',
  lineaTenencia: 'lineas',
  motivoBajaLinea: 'lineas',
  motivoReasignacion: 'lineas',
  welcomeKitItem: 'kit-epp',
  kitAssignment: 'kit-epp',
  workflowRequest: 'solicitudes',
  workflowComment: 'solicitudes',
  workflowTransition: 'solicitudes',
  workflowPendiente: 'solicitudes',
  requestKitItem: 'solicitudes',
  sede: 'configuracion',
  systemConfig: 'configuracion',
  systemUser: 'shared/auth',
  accessLog: 'shared/auth',
  sesionCerrada: 'shared/auth',
  auditLog: 'shared/auditoria',
};

/** Tablas que activos/catalogos.ts escribe eligiendo la tabla en tiempo de ejecucion. */
const CATALOGOS_DINAMICOS = ['marca', 'sistemaOperativo', 'antivirus', 'licenciaMicrosoft365'];

const ESCRITURA = /\b(?:prisma|tx)\.(\w+)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : archivos(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

/** La zona de un archivo: su modulo, o shared/<pieza>, o app. */
function zonaDe(archivo: string): string {
  const [raiz, nombre] = path.relative(SRC, archivo).split(path.sep);
  if (raiz === 'modules') return nombre;
  if (raiz === 'shared') return `shared/${nombre.replace(/\.tsx?$/, '')}`;
  return raiz;
}

const modelosDelSchema = [...fs.readFileSync(SCHEMA, 'utf8').matchAll(/^model (\w+) \{/gm)].map(
  (m) => m[1][0].toLowerCase() + m[1].slice(1)
);

test('cada tabla del schema tiene un dueno asignado', () => {
  const sinDueno = modelosDelSchema.filter((m) => !DUENOS[m]);
  expect(sinDueno).toEqual([]);
  expect(modelosDelSchema.length).toBeGreaterThan(30);
});

test('solo el modulo dueno escribe cada tabla', () => {
  const ajenas = archivos(SRC).flatMap((archivo) => {
    const zona = zonaDe(archivo);
    return [...fs.readFileSync(archivo, 'utf8').matchAll(ESCRITURA)]
      .filter((m) => DUENOS[m[1]] && DUENOS[m[1]] !== zona)
      .map((m) => `${path.relative(SRC, archivo)}: escribe ${m[1]}, que es de ${DUENOS[m[1]]}`);
  });
  expect(ajenas).toEqual([]);
});

test('los catalogos que se eligen en tiempo de ejecucion son de Activos', () => {
  for (const c of CATALOGOS_DINAMICOS) expect(DUENOS[c]).toBe('activos');
  const catalogos = fs.readFileSync(path.join(SRC, 'modules', 'activos', 'catalogos.ts'), 'utf8');
  for (const c of CATALOGOS_DINAMICOS) expect(catalogos).toContain(`modelo: '${c}'`);
});
