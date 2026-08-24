import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type DmmfField = DmmfModel['fields'][number];

const MODELS = Prisma.dmmf.datamodel.models;
const ENUMS = Prisma.dmmf.datamodel.enums;
/**
 * Los fines de linea se normalizan a LF antes de comparar.
 *
 * Varias aserciones buscan substrings de dos lineas -- la declaracion de un
 * trigger, por ejemplo --, y el repo no tiene `.gitattributes`: con
 * `core.autocrlf=true` el mismo archivo llega con CRLF en un checkout de Windows
 * y con LF en el de CI, asi que sin normalizar el test pasa o falla segun la
 * maquina y no segun el contenido de la migracion.
 */
const MIGRATION_SQL = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260822020000_ola_2_evidencia_iso',
    'migration.sql'
  ),
  'utf8'
).replace(/\r\n/g, '\n');

function model(name: string): DmmfModel {
  const found = MODELS.find((candidate) => candidate.name === name);
  expect(found).toBeDefined();
  return found!;
}

function field(modelName: string, fieldName: string): DmmfField {
  const found = model(modelName).fields.find((candidate) => candidate.name === fieldName);
  expect(found).toBeDefined();
  return found!;
}

function enumValues(name: string): string[] {
  const found = ENUMS.find((candidate) => candidate.name === name);
  expect(found).toBeDefined();
  return found!.values.map((value) => value.name);
}

function expectFieldContracts(
  modelName: string,
  contracts: Record<string, Record<string, unknown>>
): void {
  for (const [fieldName, contract] of Object.entries(contracts)) {
    expect(field(modelName, fieldName)).toMatchObject(contract);
  }
}

// SPEC: Sección 2.1 ter — evidencia ISO de documentos, historial y notificaciones.
describe('Prisma DMMF — contrato de evidencia ISO (Ola 2)', () => {
  test('declara los enums estables y estados staged de la evidencia externa', () => {
    expect(enumValues('TipoDevolucion')).toEqual(['notebook', 'celular', 'monitor', 'kit', 'otro']);
    expect(enumValues('TipoEventoEmpleado')).toEqual([
      'creacion',
      'actualizacion',
      'sync_microsoft',
      'cambio_estado',
      'desvinculacion',
      'reactivacion',
    ]);
    expect(enumValues('TipoDocumento')).toEqual([
      'anexo_entrega',
      'comprobante_entrega',
      'comprobante_cambio',
      'acta_devolucion',
    ]);
    expect(enumValues('EstadoArchivoDocumento')).toEqual(['pendiente', 'archivado', 'fallido']);
    expect(enumValues('TipoNotificacion')).toEqual([
      'cierre_onboarding',
      'cierre_desvinculacion',
      'alerta_equipos_pendientes',
    ]);
    // `enviando` separa "nunca se intento" de "se intento y no sabemos": es el
    // estado que se reclama ANTES de llamar a Graph, para que un reintento
    // concurrente no mande un segundo correo (revision 4.1, hallazgo B2).
    expect(enumValues('EstadoNotificacion')).toEqual([
      'pendiente',
      'enviando',
      'enviada',
      'fallida',
    ]);
  });

  test('mantiene el tipo de devolución estable, firmas con marca de servidor y relaciones inversas', () => {
    expect(field('AssetCategory', 'tipoDevolucion')).toMatchObject({
      kind: 'enum',
      type: 'TipoDevolucion',
      dbName: 'tipo_devolucion',
      hasDefaultValue: true,
      default: 'otro',
    });
    expect(field('Assignment', 'firmaEmpleadoEntregaEn')).toMatchObject({
      kind: 'scalar',
      type: 'DateTime',
      isRequired: false,
      dbName: 'firma_empleado_entrega_en',
    });
    expect(field('Assignment', 'firmaEmpleadoDevolucionEn')).toMatchObject({
      kind: 'scalar',
      type: 'DateTime',
      isRequired: false,
      dbName: 'firma_empleado_devolucion_en',
    });
    expect(field('Employee', 'historial')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'EmployeeHistory',
    });
    expect(field('Employee', 'documentosEmitidos')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'DocumentoEmitido',
    });
    expect(field('Assignment', 'documentosEmitidos')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'DocumentoEmitido',
    });
  });

  test('conserva el historial del empleado como evidencia requerida y no cascada', () => {
    expect(field('EmployeeHistory', 'id')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isId: true,
      default: { name: 'uuid(4)' },
    });
    expect(field('EmployeeHistory', 'employeeId')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isRequired: true,
      dbName: 'employee_id',
    });
    expect(field('EmployeeHistory', 'tipoEvento')).toMatchObject({
      kind: 'enum',
      type: 'TipoEventoEmpleado',
      dbName: 'tipo_evento',
    });
    expect(field('EmployeeHistory', 'datosAnteriores')).toMatchObject({
      kind: 'scalar',
      type: 'Json',
      isRequired: false,
      dbName: 'datos_anteriores',
    });
    expect(field('EmployeeHistory', 'datosNuevos')).toMatchObject({
      kind: 'scalar',
      type: 'Json',
      isRequired: false,
      dbName: 'datos_nuevos',
    });
    expect(field('EmployeeHistory', 'employee')).toMatchObject({
      kind: 'object',
      type: 'Employee',
      isRequired: true,
      relationOnDelete: 'Restrict',
    });
    expectFieldContracts('EmployeeHistory', {
      descripcion: { kind: 'scalar', type: 'String', isRequired: true },
      usuarioSistema: {
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        dbName: 'usuario_sistema',
      },
      createdAt: {
        kind: 'scalar',
        type: 'DateTime',
        isRequired: true,
        hasDefaultValue: true,
        default: { name: 'now' },
        dbName: 'created_at',
      },
    });
  });

  test('hace inmutable el documento emitido, lo versiona y protege la evidencia de borrar contextos', () => {
    const documento = model('DocumentoEmitido');
    expect(documento.uniqueIndexes).toContainEqual({ name: null, fields: ['numero', 'version'] });
    expect(field('DocumentoEmitido', 'contenidoSnapshot')).toMatchObject({
      kind: 'scalar',
      type: 'Json',
      isRequired: true,
      dbName: 'contenido_snapshot',
    });
    expect(field('DocumentoEmitido', 'hashSha256')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isRequired: true,
      dbName: 'hash_sha256',
    });
    expect(field('DocumentoEmitido', 'archivoEstado')).toMatchObject({
      kind: 'enum',
      type: 'EstadoArchivoDocumento',
      default: 'pendiente',
      dbName: 'archivo_estado',
    });
    expect(field('DocumentoEmitido', 'emitidoEn')).toMatchObject({
      kind: 'scalar',
      type: 'DateTime',
      isRequired: true,
      hasDefaultValue: true,
      default: { name: 'now' },
      dbName: 'emitido_en',
    });
    expect(field('DocumentoEmitido', 'employee')).toMatchObject({
      kind: 'object',
      type: 'Employee',
      isRequired: true,
      relationOnDelete: 'Restrict',
    });
    expectFieldContracts('DocumentoEmitido', {
      id: {
        kind: 'scalar',
        type: 'String',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'uuid(4)' },
      },
      numero: { kind: 'scalar', type: 'String', isRequired: true },
      tipo: { kind: 'enum', type: 'TipoDocumento', isRequired: true },
      version: { kind: 'scalar', type: 'Int', isRequired: true, default: 1 },
      // Los bytes del PDF son la evidencia, no una cache: sin ellos, archivar
      // un documento exige re-renderizarlo con el codigo del dia del reintento,
      // y cualquier cambio de plantilla lo vuelve irrecuperable (hallazgo B3).
      // Obligatorio a proposito: un documento emitido sin bytes no es evidencia.
      contenidoPdf: {
        kind: 'scalar',
        type: 'Bytes',
        isRequired: true,
        dbName: 'contenido_pdf',
      },
      sharepointItemId: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'sharepoint_item_id',
      },
      sharepointUrl: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'sharepoint_url',
      },
      archivoError: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'archivo_error',
      },
      intentosArchivo: {
        kind: 'scalar',
        type: 'Int',
        isRequired: true,
        default: 0,
        dbName: 'intentos_archivo',
      },
      emitidoPor: {
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        dbName: 'emitido_por',
      },
      firmaEmpleado: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'firma_empleado',
      },
      firmaEmpleadoEn: {
        kind: 'scalar',
        type: 'DateTime',
        isRequired: false,
        dbName: 'firma_empleado_en',
      },
      motivoReemision: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'motivo_reemision',
      },
      employeeId: {
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        dbName: 'employee_id',
      },
      requestId: { kind: 'scalar', type: 'String', isRequired: false, dbName: 'request_id' },
      assignmentId: { kind: 'scalar', type: 'String', isRequired: false, dbName: 'assignment_id' },
      terminationId: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'termination_id',
      },
    });
    for (const context of ['request', 'assignment', 'termination']) {
      expect(field('DocumentoEmitido', context)).toMatchObject({
        kind: 'object',
        isRequired: false,
        relationOnDelete: 'SetNull',
      });
    }
    expect(field('WorkflowRequest', 'documentosEmitidos')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'DocumentoEmitido',
    });
    expect(field('Termination', 'documentosEmitidos')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'DocumentoEmitido',
    });
  });

  test('registra notificaciones staged y conserva su evidencia cuando el contexto se elimina', () => {
    expect(field('NotificacionEnviada', 'destinatarios')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isList: true,
      isRequired: true,
    });
    expect(field('NotificacionEnviada', 'documentoIds')).toMatchObject({
      kind: 'scalar',
      type: 'String',
      isList: true,
      isRequired: true,
      dbName: 'documento_ids',
    });
    expect(field('NotificacionEnviada', 'estado')).toMatchObject({
      kind: 'enum',
      type: 'EstadoNotificacion',
      default: 'pendiente',
    });
    expect(field('NotificacionEnviada', 'aceptadaEn')).toMatchObject({
      kind: 'scalar',
      type: 'DateTime',
      isRequired: false,
      dbName: 'aceptada_en',
    });
    expectFieldContracts('NotificacionEnviada', {
      id: { kind: 'scalar', type: 'String', isId: true, hasDefaultValue: true },
      tipo: { kind: 'enum', type: 'TipoNotificacion', isRequired: true },
      asunto: { kind: 'scalar', type: 'String', isRequired: true },
      cuerpo: { kind: 'scalar', type: 'String', isRequired: true },
      documentoIds: {
        kind: 'scalar',
        type: 'String',
        isList: true,
        isRequired: true,
        hasDefaultValue: true,
        default: [],
        dbName: 'documento_ids',
      },
      mensajeError: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'mensaje_error',
      },
      enviadaPor: {
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        dbName: 'enviada_por',
      },
      createdAt: {
        kind: 'scalar',
        type: 'DateTime',
        isRequired: true,
        hasDefaultValue: true,
        default: { name: 'now' },
        dbName: 'created_at',
      },
      requestId: { kind: 'scalar', type: 'String', isRequired: false, dbName: 'request_id' },
      terminationId: {
        kind: 'scalar',
        type: 'String',
        isRequired: false,
        dbName: 'termination_id',
      },
    });
    for (const context of ['request', 'termination']) {
      expect(field('NotificacionEnviada', context)).toMatchObject({
        kind: 'object',
        isRequired: false,
        relationOnDelete: 'SetNull',
      });
    }
    expect(field('WorkflowRequest', 'notificacionesEnviadas')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'NotificacionEnviada',
    });
    expect(field('Termination', 'notificacionesEnviadas')).toMatchObject({
      kind: 'object',
      isList: true,
      type: 'NotificacionEnviada',
    });
  });
});

describe('migración Ola 2 — contrato físico de evidencia', () => {
  test('backfill conservador conserva el default final de categoría y los índices de consulta', () => {
    expect(MIGRATION_SQL).toContain(
      'ALTER TABLE "asset_categories" ADD COLUMN "tipo_devolucion" "TipoDevolucion";'
    );
    for (const tipo of ['notebook', 'celular', 'monitor']) {
      expect(MIGRATION_SQL).toContain(`WHEN '${tipo}' THEN '${tipo}'::"TipoDevolucion"`);
    }
    expect(MIGRATION_SQL).toContain('ELSE \'otro\'::"TipoDevolucion"');
    expect(MIGRATION_SQL).not.toContain("WHEN 'kit' THEN 'kit'::\"TipoDevolucion\"");
    expect(MIGRATION_SQL).toContain(
      'ALTER COLUMN "tipo_devolucion" SET DEFAULT \'otro\'::"TipoDevolucion"'
    );
    expect(MIGRATION_SQL).toContain('ALTER COLUMN "tipo_devolucion" SET NOT NULL;');

    for (const index of [
      '"asset_categories_tipo_devolucion_idx" ON "asset_categories"("tipo_devolucion")',
      '"employee_history_employee_id_created_at_idx" ON "employee_history"("employee_id", "created_at")',
      '"employee_history_employee_id_tipo_evento_created_at_idx" ON "employee_history"("employee_id", "tipo_evento", "created_at")',
      '"documentos_emitidos_employee_id_emitido_en_idx" ON "documentos_emitidos"("employee_id", "emitido_en")',
      '"documentos_emitidos_archivo_estado_emitido_en_idx" ON "documentos_emitidos"("archivo_estado", "emitido_en")',
      '"documentos_emitidos_request_id_idx" ON "documentos_emitidos"("request_id")',
      '"documentos_emitidos_assignment_id_idx" ON "documentos_emitidos"("assignment_id")',
      '"documentos_emitidos_termination_id_idx" ON "documentos_emitidos"("termination_id")',
      '"notificaciones_enviadas_estado_created_at_idx" ON "notificaciones_enviadas"("estado", "created_at")',
      '"notificaciones_enviadas_tipo_created_at_idx" ON "notificaciones_enviadas"("tipo", "created_at")',
      '"notificaciones_enviadas_request_id_idx" ON "notificaciones_enviadas"("request_id")',
      '"notificaciones_enviadas_termination_id_idx" ON "notificaciones_enviadas"("termination_id")',
    ]) {
      expect(MIGRATION_SQL).toContain(index);
    }
    expect(MIGRATION_SQL).toContain(
      'CREATE UNIQUE INDEX "documentos_emitidos_numero_version_key" ON "documentos_emitidos"("numero", "version");'
    );
  });

  test('impone arrays físicamente no nulos y retiene evidencia sin FK cascade', () => {
    expect(MIGRATION_SQL).toContain(
      'CONSTRAINT "notificaciones_enviadas_destinatarios_not_null_check" CHECK ("destinatarios" IS NOT NULL)'
    );
    expect(MIGRATION_SQL).toContain(
      'CONSTRAINT "notificaciones_enviadas_documento_ids_not_null_check" CHECK ("documento_ids" IS NOT NULL)'
    );
    expect(MIGRATION_SQL).toContain('"documento_ids" TEXT[] DEFAULT ARRAY[]::TEXT[]');

    const evidenceForeignKeys = MIGRATION_SQL.match(
      /ALTER TABLE "(?:employee_history|documentos_emitidos|notificaciones_enviadas)" ADD CONSTRAINT[^;]+;/g
    );
    expect(evidenceForeignKeys).toHaveLength(7);
    for (const foreignKey of evidenceForeignKeys ?? []) {
      expect(foreignKey).not.toContain('ON DELETE CASCADE');
    }
    expect(MIGRATION_SQL).toContain(
      'REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;'
    );
    for (const context of ['request', 'assignment', 'termination']) {
      expect(MIGRATION_SQL).toContain(`documentos_emitidos_${context}_id_fkey`);
    }
    for (const context of ['request', 'termination']) {
      expect(MIGRATION_SQL).toContain(`notificaciones_enviadas_${context}_id_fkey`);
    }
    expect(MIGRATION_SQL.match(/ON DELETE SET NULL ON UPDATE CASCADE;/g)).toHaveLength(5);
  });

  test('protege el documento emitido: bloquea delete y evidencia, permite staging y solo SET NULL de contexto', () => {
    const documentTable = MIGRATION_SQL.match(
      /CREATE TABLE "documentos_emitidos" \(([\s\S]*?)\n\);/
    )?.[1];
    expect(documentTable).toBeDefined();
    const documentColumns = Array.from(
      documentTable!.matchAll(/^\s+"([^"]+)"\s+/gm),
      (match) => match[1]
    );

    const protectionFunction = MIGRATION_SQL.match(
      /CREATE OR REPLACE FUNCTION "proteger_documentos_emitidos"\(\)[\s\S]*?\$\$;/
    )?.[0];
    expect(protectionFunction).toBeDefined();
    const sql = protectionFunction!;
    const triggerColumns = Array.from(
      sql.matchAll(/\b(?:OLD|NEW)\.([a-z0-9_]+)/g),
      (match) => match[1]
    );

    expect(triggerColumns.length).toBeGreaterThan(0);
    for (const column of triggerColumns) {
      expect(documentColumns).toContain(column);
    }

    expect(sql).toContain("IF TG_OP = 'DELETE' THEN");
    // Los triggers de FILA no se disparan nunca en TRUNCATE: sin una rama y un
    // trigger de STATEMENT propios, `TRUNCATE documentos_emitidos` —o un
    // `TRUNCATE employees CASCADE`, que RESTRICT no detiene— borra la evidencia
    // completa sin error ni traza (hallazgo G6).
    expect(sql).toContain("IF TG_OP = 'TRUNCATE' THEN");
    expect(sql).toContain('RETURN NEW;');
    for (const protectedColumn of [
      'id',
      'numero',
      'tipo',
      'version',
      'contenido_snapshot',
      'contenido_pdf',
      'hash_sha256',
      'emitido_por',
      'emitido_en',
      'firma_empleado',
      'firma_empleado_en',
      'motivo_reemision',
      'employee_id',
    ]) {
      expect(sql).toContain(`OLD.${protectedColumn} IS DISTINCT FROM NEW.${protectedColumn}`);
    }
    for (const stagedColumn of [
      'sharepoint_item_id',
      'sharepoint_url',
      'archivo_estado',
      'archivo_error',
      'intentos_archivo',
    ]) {
      expect(sql).not.toContain(`OLD.${stagedColumn} IS DISTINCT FROM NEW.${stagedColumn}`);
    }
    for (const contextColumn of ['request_id', 'assignment_id', 'termination_id']) {
      expect(sql).toContain(
        `NEW.${contextColumn} IS NOT NULL AND NEW.${contextColumn} IS DISTINCT FROM OLD.${contextColumn}`
      );
    }
    expect(MIGRATION_SQL).toContain(
      'CREATE TRIGGER "documentos_emitidos_proteger_inmutabilidad"\nBEFORE UPDATE OR DELETE ON "documentos_emitidos"'
    );
  });

  test('materializa los bytes del PDF y el estado reclamado del aviso en el contrato fisico', () => {
    // Los bytes viven en la tabla, no se recalculan: es lo que permite que un
    // reintento de archivo suba el documento original en vez de re-renderizarlo
    // con el codigo del dia (hallazgo B3). NOT NULL porque un documento emitido
    // sin bytes no seria evidencia de nada.
    expect(MIGRATION_SQL).toContain('"contenido_pdf" BYTEA NOT NULL');

    // El estado `enviando` se reclama antes de llamar a Graph (hallazgo B2).
    expect(MIGRATION_SQL).toContain(
      'CREATE TYPE "EstadoNotificacion" AS ENUM (\'pendiente\', \'enviando\', \'enviada\', \'fallida\');'
    );

    // Trigger de STATEMENT aparte: los de fila no ven el TRUNCATE (hallazgo G6).
    expect(MIGRATION_SQL).toContain(
      'CREATE TRIGGER "documentos_emitidos_proteger_truncate"\nBEFORE TRUNCATE ON "documentos_emitidos"\nFOR EACH STATEMENT EXECUTE FUNCTION "proteger_documentos_emitidos"();'
    );
  });
});
