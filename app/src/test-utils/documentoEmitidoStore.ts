import { createHash } from 'crypto';

/**
 * Doble de la tabla `documentos_emitidos` y del drive de SharePoint.
 *
 * Se escribe a mano en vez de con `jest.fn()` sueltos porque las reglas que
 * Task 6 debe cumplir son justamente las que un mock plano no puede expresar:
 * la unicidad de `(numero, version)`, el trigger que solo deja tocar los
 * campos staged, y que la descarga devuelva exactamente los bytes subidos.
 */

export type FilaDocumento = {
  id: string;
  numero: string;
  tipo: string;
  version: number;
  contenidoSnapshot: unknown;
  /** Los bytes exactos del PDF emitido. Inmutables, como el snapshot. */
  contenidoPdf: Buffer;
  hashSha256: string;
  sharepointItemId: string | null;
  sharepointUrl: string | null;
  archivoEstado: 'pendiente' | 'archivado' | 'fallido';
  archivoError: string | null;
  intentosArchivo: number;
  emitidoPor: string;
  emitidoEn: Date;
  firmaEmpleado: string | null;
  firmaEmpleadoEn: Date | null;
  motivoReemision: string | null;
  employeeId: string;
  requestId: string | null;
  assignmentId: string | null;
  terminationId: string | null;
};

/** Los unicos campos que el trigger de la base deja actualizar (SPEC 2.1 ter). */
const CAMPOS_STAGED = new Set([
  'sharepointItemId',
  'sharepointUrl',
  'archivoEstado',
  'archivoError',
  'intentosArchivo',
]);

export function crearStoreDocumentos() {
  const filas: FilaDocumento[] = [];
  let secuencia = 0;

  function ordenar(a: FilaDocumento, b: FilaDocumento, orderBy?: Record<string, 'asc' | 'desc'>) {
    if (!orderBy) return 0;
    const [campo, direccion] = Object.entries(orderBy)[0];
    const va = a[campo as keyof FilaDocumento] as number | string | Date;
    const vb = b[campo as keyof FilaDocumento] as number | string | Date;
    const signo = va < vb ? -1 : va > vb ? 1 : 0;
    return direccion === 'desc' ? -signo : signo;
  }

  function coincide(fila: FilaDocumento, where: Record<string, unknown> = {}): boolean {
    return Object.entries(where).every(([campo, valor]) => {
      if (valor && typeof valor === 'object' && 'in' in (valor as object)) {
        return (valor as { in: unknown[] }).in.includes(fila[campo as keyof FilaDocumento]);
      }
      if (valor && typeof valor === 'object' && 'not' in (valor as object)) {
        return fila[campo as keyof FilaDocumento] !== (valor as { not: unknown }).not;
      }
      return fila[campo as keyof FilaDocumento] === valor;
    });
  }

  /**
   * Escribe respetando el trigger y traduciendo `{ increment }`.
   *
   * El incremento importa: escribir un absoluto calculado en memoria hace que
   * dos intentos concurrentes lean el mismo valor y el contador subestime.
   */
  function aplicar(fila: FilaDocumento, data: Record<string, unknown>): void {
    for (const [campo, valor] of Object.entries(data)) {
      if (!CAMPOS_STAGED.has(campo)) {
        throw new Error(`No se permite modificar la evidencia de un documento emitido: ${campo}`);
      }
      if (valor && typeof valor === 'object' && 'increment' in (valor as object)) {
        const actual = fila[campo as keyof FilaDocumento] as number;
        (fila as Record<string, unknown>)[campo] =
          actual + (valor as { increment: number }).increment;
        continue;
      }
      (fila as Record<string, unknown>)[campo] = valor;
    }
  }

  const documentoEmitido = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const numero = data.numero as string;
      const version = (data.version as number) ?? 1;
      if (filas.some((fila) => fila.numero === numero && fila.version === version)) {
        throw new Error(`Unique constraint failed on (numero, version): ${numero} v${version}`);
      }
      // `contenido_pdf` es NOT NULL en la base: un documento emitido sin bytes
      // no seria evidencia de nada, y el doble tiene que decirlo igual que ella.
      if (!Buffer.isBuffer(data.contenidoPdf)) {
        throw new Error('Null constraint failed on documentos_emitidos.contenido_pdf');
      }
      secuencia += 1;
      const fila: FilaDocumento = {
        id: `documento-${secuencia}`,
        numero,
        tipo: data.tipo as string,
        version,
        contenidoSnapshot: data.contenidoSnapshot,
        contenidoPdf: data.contenidoPdf,
        hashSha256: data.hashSha256 as string,
        sharepointItemId: null,
        sharepointUrl: null,
        archivoEstado: (data.archivoEstado as FilaDocumento['archivoEstado']) ?? 'pendiente',
        archivoError: null,
        intentosArchivo: 0,
        emitidoPor: data.emitidoPor as string,
        emitidoEn: data.emitidoEn as Date,
        firmaEmpleado: (data.firmaEmpleado as string) ?? null,
        firmaEmpleadoEn: (data.firmaEmpleadoEn as Date) ?? null,
        motivoReemision: (data.motivoReemision as string) ?? null,
        employeeId: data.employeeId as string,
        requestId: (data.requestId as string) ?? null,
        assignmentId: (data.assignmentId as string) ?? null,
        terminationId: (data.terminationId as string) ?? null,
      };
      filas.push(fila);
      return { ...fila };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const fila = filas.find((candidata) => candidata.id === where.id);
      return fila ? { ...fila } : null;
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }) => {
      const encontradas = filas
        .filter((fila) => coincide(fila, where))
        .sort((a, b) => ordenar(a, b, orderBy));
      return encontradas.length ? { ...encontradas[0] } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const fila = filas.find((candidata) => candidata.id === where.id);
      if (!fila) throw new Error('P2025');
      aplicar(fila, data);
      return { ...fila };
    },
    /**
     * `updateMany` es la unica forma de escribir con guarda de estado. El
     * servicio la usa para no pisar un documento ya archivado con el fallo de un
     * intento que llego tarde.
     */
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const afectadas = filas.filter((fila) => coincide(fila, where));
      for (const fila of afectadas) aplicar(fila, data);
      return { count: afectadas.length };
    },
    delete: async () => {
      throw new Error('No se permite eliminar documentos emitidos');
    },
  };

  /**
   * `$queryRaw` es una plantilla etiquetada. El doble reconoce las dos
   * consultas del servicio por su texto y responde como Postgres: el lock es
   * un no-op y el maximo se calcula sobre las filas del store.
   */
  const locksTomados: string[] = [];
  async function $queryRaw(strings: TemplateStringsArray, ...valores: unknown[]) {
    const sql = strings.join('?');
    if (sql.includes('pg_advisory_xact_lock')) {
      locksTomados.push(String(valores[0]));
      return [{ locked: true }];
    }
    if (sql.includes('MAX')) {
      if (locksTomados.length === 0) {
        throw new Error('Se leyo el maximo del correlativo sin tomar el lock antes');
      }
      const prefijo = String(valores[0]).replace('%', '');
      const maximo = filas
        .filter((fila) => fila.numero.startsWith(prefijo))
        .reduce((max, fila) => Math.max(max, Number(fila.numero.split('-')[2])), 0);
      return [{ max: maximo || null }];
    }
    throw new Error(`Consulta cruda no esperada: ${sql}`);
  }

  return { filas, documentoEmitido, $queryRaw, locksTomados };
}

/** Doble del drive: guarda los bytes exactos que le suben. */
export function crearDriveFalso() {
  const archivos = new Map<string, Buffer>();
  const rutaPorItem = new Map<string, string>();
  let secuencia = 0;

  return {
    archivos,
    async subir({ ruta, contenido }: { ruta: string; contenido: Buffer }) {
      const existente = [...rutaPorItem.entries()].find(([, valor]) => valor === ruta);
      const itemId = existente ? existente[0] : `item-${(secuencia += 1)}`;
      rutaPorItem.set(itemId, ruta);
      archivos.set(ruta, Buffer.from(contenido));
      return { itemId, webUrl: `https://contoso.sharepoint.com/${ruta}` };
    },
    async descargar(itemId: string) {
      const ruta = rutaPorItem.get(itemId);
      const contenido = ruta ? archivos.get(ruta) : undefined;
      if (!contenido) throw new Error('El item no existe en el drive');
      return Buffer.from(contenido);
    },
    corromper(ruta: string) {
      archivos.set(ruta, Buffer.from('bytes distintos de los emitidos'));
    },
  };
}

export function sha256(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('hex');
}
