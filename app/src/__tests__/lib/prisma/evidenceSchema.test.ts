import { Prisma } from '@prisma/client';

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type DmmfField = DmmfModel['fields'][number];

const MODELS = Prisma.dmmf.datamodel.models;
const ENUMS = Prisma.dmmf.datamodel.enums;

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
    expect(enumValues('EstadoNotificacion')).toEqual(['pendiente', 'enviada', 'fallida']);
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
      dbName: 'emitido_en',
    });
    expect(field('DocumentoEmitido', 'employee')).toMatchObject({
      kind: 'object',
      type: 'Employee',
      isRequired: true,
      relationOnDelete: 'Restrict',
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
