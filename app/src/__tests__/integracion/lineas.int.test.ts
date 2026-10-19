/** @jest-environment node */
/**
 * Lineas telefonicas contra Postgres real (SPEC 2.131): alta, edicion con
 * historial y vigencia, catalogos, eliminacion con auditoria
 * e importacion por pasos. Solo corre contra la base de pruebas (ver
 * concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '@/shared/prisma';
import { bajaLineaSchema, lineaSchema, reasignacionSchema } from '@/modules/lineas';
import { columnasDeHoja, hojasDelArchivo, importarTandaLineas, vistaPreviaLineas } from '@/modules/lineas/excel';
import { asignarEquipo, registrarDevolucion } from '@/modules/asignaciones/servidor';
import { crearEquipo } from '@/test-utils/catalogos';
import {
  darDeBajaLinea,
  crearLinea,
  crearOpcionLinea,
  editarLinea,
  editarOpcionLinea,
  eliminarLinea,
  eliminarOpcionLinea,
  fichaLinea,
  historialLinea,
  indicadoresLineas,
  listarLineas,
  listarOpcionesLinea,
  reasignarLinea,
  asociarLineaEnSolicitud,
  asociarEsimEnSolicitud,
  cambiarLineaEnSolicitud,
  convertirLineaAEsimEnSolicitud,
  liberarLineaEnSolicitud,
  lineasDePersona,
  lineasDeEquipos,
  lineasDeSolicitud,
  tenenciasDePersona,
  alCambiarTenedorDelTelefono,
  liberarEsimDePersona,
} from '@/modules/lineas/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

/** Numero de celular al azar, para no chocar con otras corridas. */
/** Letras al azar: los nombres de personas se comparan sin digitos. */
const letras = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const numeroAlAzar = () => `5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
// Tipos de chip de base (migraciones): fisico va en un celular, eSIM con una persona.
let fisico: string;
let esim: string;
/** Datos de una linea; si se asocia y no se indica el tipo de chip, el que corresponde (SPEC 2.131). */
const datos = (extra: Record<string, unknown>) =>
  lineaSchema.parse({ tipoChipId: extra.activoId ? fisico : extra.empleadoId ? esim : undefined, ...extra });

describir('lineas telefonicas en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  // Devuelve un celular (SPEC 2.138 pide dónde queda).
  const devolverCelular = (asignacionId: string) =>
    registrarDevolucion(asignacionId, { fechaDevolucion: new Date(), estadoDevolucion: 'ok' }, 'jsoto');
  // Apellidos unicos de las personas que crea la importacion (SPEC 2.133), para borrarlas al final.
  const u = letras(8);
  const rut = `${10 + Math.floor(Math.random() * 80)}.${s.replace(/\D/g, '0').slice(0, 3)}.${s.replace(/\D/g, '1').slice(3, 6)}-K`;
  const ids: {
    celular?: string;
    notebook?: string;
    empleado?: string;
    otraPersona?: string;
    desvinculada?: string;
    // Celular sin dueno (para entregarlo y devolverlo) y uno de baja.
    disponible?: string;
    // Celular de bodega donde se ponen las lineas de prueba.
    libre?: string;
    telefonoBaja?: string;
    // Dos sedes de prueba (se borran al final).
    sede?: string;
    otraSede?: string;
    categorias: string[];
    opciones: string[];
  } = {
    categorias: [],
    opciones: [],
  };
  const numeros: string[] = [];
  // Lineas que los tests eliminan: su historial queda, y se limpia al final.
  const eliminadas: string[] = [];
  const nuevo = () => {
    const n = numeroAlAzar();
    numeros.push(n);
    return n;
  };
  let activa: string;
  let baja: string;
  // Motivos de baja de la lista (SPEC 2.140).
  let motivoCancelacion: string;
  let motivoOtro: string;
  const bajaDe = (extra: object = {}) => bajaLineaSchema.parse({ motivoBajaId: motivoCancelacion, ...extra });

  beforeAll(async () => {
    const celular = await prisma.assetCategory.create({ data: { nombre: `Cel ${s}`, tipoFicha: 'celular' } });
    const notebook = await prisma.assetCategory.create({ data: { nombre: `Nb ${s}`, tipoFicha: 'computador' } });
    ids.categorias.push(celular.id, notebook.id);
    ids.notebook = (await crearEquipo({ categoriaId: notebook.id, marca: 'Dell', modelo: `Nb ${s}` })).id;
    ids.empleado = (
      await prisma.employee.create({ data: { nombres: 'Prueba', apellidoPaterno: `Lineas${s}`, rut, estado: 'activo' } })
    ).id;
    // El celular lo tiene la persona de prueba.
    ids.celular = (
      await crearEquipo({ categoriaId: celular.id, marca: 'Samsung', modelo: `A55 ${s}`, imei: `35${s.replace(/\D/g, '7').slice(0, 6)}1234567`.slice(0, 15), estado: 'asignado', empleadoActualId: ids.empleado })
    ).id;
    ids.otraPersona = (await prisma.employee.create({ data: { nombres: 'Otra', apellidoPaterno: `Lineas${s}b`, estado: 'activo' } })).id;
    ids.desvinculada = (await prisma.employee.create({ data: { nombres: 'Se fue', apellidoPaterno: `Lineas${s}c`, estado: 'desvinculado' } })).id;
    ids.disponible = (await crearEquipo({ categoriaId: celular.id, marca: 'Samsung', modelo: `Libre ${s}`, estado: 'disponible' })).id;
    ids.libre = (await crearEquipo({ categoriaId: celular.id, marca: 'Motorola', modelo: `Bodega ${s}`, estado: 'disponible' })).id;
    ids.telefonoBaja = (await crearEquipo({ categoriaId: celular.id, marca: 'Samsung', modelo: `Baja ${s}`, estado: 'baja' })).id;
    ids.sede = (await prisma.sede.create({ data: { codigo: `S${s}`, nombre: `Sede Uno ${s}` } })).id;
    ids.otraSede = (await prisma.sede.create({ data: { codigo: `T${s}`, nombre: `Sede Dos ${s}` } })).id;
    activa = (await prisma.estadoLinea.findUniqueOrThrow({ where: { clave: 'activa' } })).id;
    baja = (await prisma.estadoLinea.findUniqueOrThrow({ where: { clave: 'baja' } })).id;
    motivoCancelacion = (await prisma.motivoBajaLinea.findUniqueOrThrow({ where: { nombre: 'Se canceló el servicio' } })).id;
    motivoOtro = (await prisma.motivoBajaLinea.findUniqueOrThrow({ where: { clave: 'otro' } })).id;
    fisico = (await prisma.tipoChip.findUniqueOrThrow({ where: { nombre: 'Físico' } })).id;
    esim = (await prisma.tipoChip.findUniqueOrThrow({ where: { nombre: 'eSIM / MFF' } })).id;
  });

  // Un celular lleva una sola línea vigente (SPEC 2.164): cada test parte con los
  // celulares de bodega sin las líneas que dejó el anterior.
  beforeEach(async () => {
    await prisma.lineaTelefonica.updateMany({ where: { activoId: { in: [ids.libre!, ids.disponible!] } }, data: { activoId: null } });
  });

  afterAll(async () => {
    const lineas = await prisma.lineaTelefonica.findMany({ where: { numero: { in: numeros } }, select: { id: true } });
    const idsLineas = [...lineas.map((l) => l.id), ...eliminadas];
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: [...idsLineas, ...ids.opciones] } } });
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: { in: idsLineas } } });
    await prisma.lineaTelefonica.deleteMany({ where: { numero: { in: numeros } } });
    await prisma.motivoBajaLinea.deleteMany({ where: { nombre: { contains: s } } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.sede!, ids.otraSede!] } } });
    const creadas = await prisma.employee.findMany({ where: { apellidoPaterno: { in: [`Gomez${u}`, `Rojas${u}`] } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: creadas.map((e) => e.id) } } });
    await prisma.employee.deleteMany({ where: { id: { in: creadas.map((e) => e.id) } } });
    await prisma.assignment.deleteMany({ where: { assetId: ids.disponible } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: [ids.disponible!, ids.celular!, ids.libre!] } } });
    await prisma.motivoReasignacion.deleteMany({ where: { id: { in: ids.opciones } } });
    await prisma.operadorLinea.deleteMany({ where: { id: { in: ids.opciones } } });
    await prisma.tipoChip.deleteMany({ where: { id: { in: ids.opciones } } });
    await prisma.estadoLinea.deleteMany({ where: { id: { in: ids.opciones } } });
    await prisma.asset.deleteMany({ where: { id: { in: [ids.celular!, ids.notebook!, ids.disponible!, ids.telefonoBaja!, ids.libre!] } } });
    await prisma.assetCategory.deleteMany({ where: { id: { in: ids.categorias } } });
    await prisma.employee.deleteMany({ where: { id: { in: [ids.empleado!, ids.otraPersona!, ids.desvinculada!] } } });
    await prisma.$disconnect();
  });

  test('crea Activa por defecto; solo en un celular sin línea; queda en el historial y la auditoría', async () => {
    const n = nuevo();
    // Un celular que ya tiene una línea no (SPEC 2.164).
    const ocupado = await crearLinea(datos({ numero: nuevo(), activoId: ids.disponible }));
    await expect(crearLinea(datos({ numero: n, activoId: ids.disponible }))).rejects.toMatchObject({
      details: [{ field: 'activoId', message: expect.stringContaining('ya tiene una línea') }],
    });
    await reasignarLinea(ocupado.id, reasignacionSchema.parse({ destino: 'ninguno' }));
    const linea = await crearLinea(
      datos({ numero: `+56 9 ${n.slice(3, 7)} ${n.slice(7)}`, activoId: ids.libre, empleadoId: ids.empleado }),
      'jsoto'
    );
    expect(linea).toMatchObject({ numero: n, activoId: ids.libre, empleadoId: null, estado: { nombre: 'Activa' } });
    expect((await historialLinea(linea.id)).map((e) => e.tipo)).toEqual(['creacion']);
    expect(await prisma.auditLog.findFirst({ where: { entidadId: linea.id } })).toMatchObject({ accion: 'crear', usuarioSistema: 'jsoto' });
    const [encontrada] = await listarLineas({ estado: 'todas', q: n });
    expect(encontrada).toMatchObject({ id: linea.id, activo: { id: ids.libre, empleadoActual: null } });
  });

  test('sede de un chip disponible: opcional al crear, la ve el filtro de sede y al sacarlo de un celular queda la de ese celular (SPEC 2.165)', async () => {
    const conSede = await crearLinea(datos({ numero: nuevo(), sedeId: ids.sede }));
    const sinSede = await crearLinea(datos({ numero: nuevo() }));
    expect(conSede.sedeId).toBe(ids.sede);
    expect(sinSede.sedeId).toBeNull();
    const enLaSede = (await listarLineas({ estado: 'todas', sedeId: ids.sede })).map((l) => l.id);
    expect(enLaSede).toContain(conSede.id);
    expect(enLaSede).not.toContain(sinSede.id);

    await prisma.asset.update({ where: { id: ids.libre! }, data: { sedeId: ids.otraSede } });
    const enCelular = await crearLinea(datos({ numero: nuevo(), activoId: ids.libre }));
    const disponible = await reasignarLinea(enCelular.id, reasignacionSchema.parse({ destino: 'ninguno' }));
    expect(disponible).toMatchObject({ activoId: null, empleadoId: null, sedeId: ids.otraSede });
    await prisma.asset.update({ where: { id: ids.libre! }, data: { sedeId: null } });
  });

  test('sin celular (teléfono personal) la persona se guarda en la línea', async () => {
    const linea = await crearLinea(datos({ numero: nuevo(), empleadoId: ids.empleado }));
    expect(linea).toMatchObject({ activoId: null, empleadoId: ids.empleado });
  });

  test('rechaza un número repetido, un equipo que no es celular y una fecha futura', async () => {
    const n = nuevo();
    await crearLinea(datos({ numero: n }));
    await expect(crearLinea(datos({ numero: n.slice(2) }))).rejects.toMatchObject({ status: 409 });
    await expect(crearLinea(datos({ numero: nuevo(), activoId: ids.notebook }))).rejects.toMatchObject({
      details: [{ field: 'activoId', message: 'Elige un celular del inventario' }],
    });
    await expect(crearLinea(datos({ numero: nuevo(), vigenteDesde: '2999-01-01' }))).rejects.toMatchObject({
      details: [{ field: 'vigenteDesde', message: 'La fecha no puede ser futura' }],
    });
  });

  test('dar de baja pide el motivo, pone la fecha y queda en el historial; reactivarla los quita (SPEC 2.140)', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n, vigenteDesde: '2026-01-15' }), 'jsoto');
    // Sin motivo no se da de baja.
    expect(() => bajaLineaSchema.parse({})).toThrow();
    expect(() => bajaLineaSchema.parse({ motivoBajaId: 'cancelada' })).toThrow();
    const dada = await darDeBajaLinea(linea.id, bajaDe({ fechaBaja: '2026-05-10', observaciones: 'El cliente lo pidió' }), 'jsoto');
    expect(dada).toMatchObject({ motivoBajaId: motivoCancelacion, motivoBaja: 'Se canceló el servicio', estado: { nombre: 'Baja', deBaja: true } });
    expect(dada.fechaBaja?.toISOString().slice(0, 10)).toBe('2026-05-10');
    const eventos = await historialLinea(linea.id);
    expect(eventos.map((e) => `${e.vigenteDesde.toISOString().slice(0, 10)} ${e.tipo}`).sort()).toEqual(['2026-01-15 creacion', '2026-05-10 estado']);
    expect(eventos.find((e) => e.tipo === 'estado')?.descripcion).toContain('Motivo: Se canceló el servicio');
    expect(eventos.find((e) => e.tipo === 'estado')?.descripcion).toContain('El cliente lo pidió');
    // Ya de baja: no se repite.
    await expect(darDeBajaLinea(linea.id, bajaDe())).rejects.toMatchObject({ status: 409 });
    const reactivada = await editarLinea(linea.id, datos({ numero: n, estadoId: activa }));
    expect(reactivada.fechaBaja).toBeNull();
    expect(reactivada.motivoBaja).toBeNull();
    expect(reactivada.motivoBajaId).toBeNull();
  });

  test('el motivo "Otro" pide el detalle; un motivo que no existe o está desactivado se rechaza (SPEC 2.140)', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n }));
    await expect(darDeBajaLinea(linea.id, bajaDe({ motivoBajaId: motivoOtro }))).rejects.toMatchObject({
      details: [{ field: 'motivoDetalle' }],
    });
    await expect(darDeBajaLinea(linea.id, bajaDe({ motivoBajaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3309' }))).rejects.toMatchObject({
      details: [{ field: 'motivoBajaId' }],
    });
    const dada = await darDeBajaLinea(linea.id, bajaDe({ motivoBajaId: motivoOtro, motivoDetalle: 'Se la quedó el operador' }));
    expect(dada.motivoBaja).toBe('Otro: Se la quedó el operador');
  });

  test('los motivos de baja son un catálogo: se agregan y uno usado se desactiva; "Otro" no se elimina', async () => {
    const { opcion } = await crearOpcionLinea('motivos-baja', { nombre: `Motivo baja ${s}` }, 'jsoto');
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n }));
    await darDeBajaLinea(linea.id, bajaDe({ motivoBajaId: opcion.id }));
    expect(await eliminarOpcionLinea('motivos-baja', opcion.id, 'jsoto')).toEqual({ desactivado: true });
    expect(await listarOpcionesLinea('motivos-baja', { soloActivas: true })).not.toContainEqual(expect.objectContaining({ id: opcion.id }));
    await expect(eliminarOpcionLinea('motivos-baja', motivoOtro)).rejects.toMatchObject({ status: 409 });
  });

  test('editar o crear una línea no la da de baja: eso pide el motivo (SPEC 2.140)', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n }));
    await expect(editarLinea(linea.id, datos({ numero: n, estadoId: baja }))).rejects.toMatchObject({
      details: [{ field: 'estadoId', message: expect.stringContaining('Dar de baja') }],
    });
    await expect(crearLinea(datos({ numero: nuevo(), estadoId: baja }))).rejects.toMatchObject({
      details: [{ field: 'estadoId', message: expect.stringContaining('Dar de baja') }],
    });
    expect((await fichaLinea(linea.id)).linea.estado.clave).toBe('activa');
  });

  test('catálogos: una opción usada se desactiva y la línea la conserva', async () => {
    const { opcion } = await crearOpcionLinea('operadores', { nombre: `Operador prueba ${s}` }, 'jsoto');
    ids.opciones.push(opcion.id);
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n, operadorId: opcion.id }));
    expect(await eliminarOpcionLinea('operadores', opcion.id, 'jsoto')).toEqual({ desactivado: true });
    await expect(crearLinea(datos({ numero: nuevo(), operadorId: opcion.id }))).rejects.toMatchObject({
      details: [{ field: 'operadorId', message: 'Elige una opción de la lista' }],
    });
    expect(await editarLinea(linea.id, datos({ numero: n, operadorId: opcion.id, observaciones: 'x' }))).toMatchObject({ operadorId: opcion.id });
  });

  test('los estados son dos y fijos: Activa y Baja; no se agregan, renombran ni eliminan', async () => {
    const estados = await prisma.estadoLinea.findMany({ where: { clave: { not: null } }, orderBy: { nombre: 'asc' } });
    expect(estados.map((e) => [e.nombre, e.clave, e.deBaja])).toEqual([
      ['Activa', 'activa', false],
      ['Baja', 'baja', true],
    ]);
    await expect(crearOpcionLinea('estados', { nombre: `Otro ${s}` })).rejects.toMatchObject({ status: 409 });
    await expect(editarOpcionLinea('estados', baja, { nombre: 'Renombrada' })).rejects.toMatchObject({ status: 409 });
    await expect(eliminarOpcionLinea('estados', baja)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.estadoLinea.count({ where: { nombre: { in: [`Otro ${s}`, 'Renombrada'] } } })).toBe(0);
  });

  test('eliminar la borra, conserva su historial con un evento de cierre y deja sus datos en la auditoría', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n, observaciones: 'por error' }));
    eliminadas.push(linea.id);
    await eliminarLinea(linea.id, 'jsoto');
    expect(await prisma.lineaTelefonica.findUnique({ where: { id: linea.id } })).toBeNull();
    expect((await historialLinea(linea.id)).map((e) => e.tipo).sort()).toEqual(['creacion', 'eliminacion']);
    const audit = await prisma.auditLog.findFirst({ where: { entidadId: linea.id, accion: 'eliminar' } });
    expect(audit?.datosAnteriores).toMatchObject({ numero: n, observaciones: 'por error' });
  });

  test('solo se elimina una línea sin nada registrado: una que tuvo persona o cambios se rechaza (SPEC 2.136)', async () => {
    const conPersona = await crearLinea(datos({ numero: nuevo(), empleadoId: ids.empleado }));
    await expect(eliminarLinea(conPersona.id, 'jsoto')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('persona') });
    const n = nuevo();
    const conCambio = await crearLinea(datos({ numero: n }));
    await darDeBajaLinea(conCambio.id, bajaDe());
    await expect(eliminarLinea(conCambio.id, 'jsoto')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('cambios') });
    // Corregir sus datos no cuenta como uso.
    const m = nuevo();
    const corregida = await crearLinea(datos({ numero: m }));
    await editarLinea(corregida.id, datos({ numero: m, observaciones: 'corregida' }));
    eliminadas.push(corregida.id);
    await eliminarLinea(corregida.id, 'jsoto');
    expect(await prisma.lineaTelefonica.findUnique({ where: { id: corregida.id } })).toBeNull();
  });

  test('importación: vista previa sin guardar, luego tandas con persona por RUT, celular por IMEI y sin pisar lo existente', async () => {
    const [conPersona, conCelular, duplicada, existente] = [nuevo(), nuevo(), nuevo(), nuevo()];
    const lineaExistente = await crearLinea(datos({ numero: existente }));
    await darDeBajaLinea(lineaExistente.id, bajaDe());
    const imei = (await prisma.asset.findUniqueOrThrow({ where: { id: ids.celular } })).imei!;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidado');
    ws.addRow(['Conciliación']);
    ws.addRow([]);
    ws.addRow(['Línea normalizada', 'Estado', 'Documento(s)', 'IMEI', 'Observaciones']);
    ws.addRow([conPersona, 'Coincide', rut, null, null]);
    ws.addRow([conCelular, 'Coincide', null, imei, null]);
    ws.addRow([duplicada, 'Baja', '1-9 | 2-7', null, null]);
    ws.addRow([existente, 'Baja', null, null, 'Se completa']);
    ws.addRow(['123', 'No asignada', null, null, null]);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const mapeo = { numero: 'Línea normalizada', estado: 'Estado', rut: 'Documento(s)', imei: 'IMEI', observaciones: 'Observaciones' };

    const previa = await vistaPreviaLineas(buffer, 'Consolidado', mapeo);
    expect(previa.resumen).toMatchObject({ total: 5, nuevas: 3, existentes: 1, conError: 1, entregasAnteriores: 0 });
    expect(previa.valores.estado.map((v) => [v.valor, v.opcionId])).toEqual([
      ['Coincide', null],
      ['Baja', baja],
    ]);
    expect(await prisma.lineaTelefonica.count({ where: { numero: { in: [conPersona, conCelular, duplicada] } } })).toBe(0);

    // La pantalla asocia "Coincide" a Activa (vacio) y "Baja" a Baja.
    const filas = previa.filas
      .filter((f) => f.errores.length === 0)
      .map(({ existe: _x, estado, tipoChip: _t, operador: _o, errores: _e, avisos: _a, ...f }) => ({
        ...f,
        estadoId: estado === 'Baja' ? baja : null,
        tipoChipId: null,
        operadorId: null,
      }));
    const r = await importarTandaLineas(filas, '2026-07-31', 'jsoto');
    expect(r.map((x) => x.resultado)).toEqual(['nueva', 'nueva', 'nueva', 'completada']);

    const porNumero = new Map(
      (await prisma.lineaTelefonica.findMany({ where: { numero: { in: numeros } }, include: { estado: true } })).map((l) => [l.numero, l])
    );
    expect(porNumero.get(conPersona)).toMatchObject({ empleadoId: ids.empleado, estado: { nombre: 'Activa' } });
    expect(porNumero.get(conCelular)).toMatchObject({ activoId: ids.celular, empleadoId: null });
    expect(porNumero.get(duplicada)).toMatchObject({ empleadoId: null, estado: { clave: 'baja' } });
    expect(porNumero.get(duplicada)?.fechaBaja?.toISOString().slice(0, 10)).toBe('2026-07-31');
    // La que ya existia: el estado no cambia; solo completa lo que le faltaba.
    expect(porNumero.get(existente)).toMatchObject({ estadoId: baja, observaciones: 'Se completa' });
    // Cada linea importada abre su tramo de tenencia.
    expect((await fichaLinea(porNumero.get(conCelular)!.id)).tenencias).toMatchObject([
      { origen: 'importacion', activoId: ids.celular, empleadoId: ids.empleado },
    ]);
    expect((await fichaLinea(porNumero.get(existente)!.id)).tenencias).toMatchObject([{ origen: 'alta' }]);
    const [importada] = await historialLinea(porNumero.get(conPersona)!.id);
    expect(importada).toMatchObject({ tipo: 'importacion', usuario: 'jsoto' });
    expect(importada.vigenteDesde.toISOString().slice(0, 10)).toBe('2026-07-31');

    // Importar de nuevo no duplica ni cambia nada.
    expect((await importarTandaLineas(filas, '2026-07-31')).map((x) => x.resultado)).toEqual(['sin cambios', 'sin cambios', 'sin cambios', 'sin cambios']);
  });

  test('importación del inventario de celulares: un número repetido es una línea con su historial, el operador y el chip salen del archivo y la ubicación del equipo no se importa', async () => {
    const [numA, numB, numC] = [nuevo(), nuevo(), nuevo()];
    const imei = (await prisma.asset.findUniqueOrThrow({ where: { id: ids.celular } })).imei!;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('NORMALIZADO');
    ws.addRow(['RUT', 'Nombre', 'Apellido P.', 'Apellido M.', 'Marca', 'Modelo', 'N° serie', 'IMEI ', 'Estado', 'N° Telefono', 'Operador', 'Fecha entrega', 'Incidencia', 'Observación']);
    // numA: primero alguien que no está en el sistema, después la persona de prueba con su celular.
    ws.addRow(['9.999.999-9', 'Luis', `Gomez${u}`, 'Perez', 'Samsung', 'A04', 'S1', '111111111111111', 'Nuevo', numA, 'Entel', new Date('2024-02-10'), null, null]);
    ws.addRow([rut, 'Prueba', `Lineas${s}`, null, 'Samsung', 'A55', 'S2', imei, 'Usado', Number(numA), 'Entel', new Date('2025-03-01'), 'Falla', 'Rancagua']);
    // numB: una eSIM, sin persona, en la bodega de una sede; el operador no se sabe.
    ws.addRow([null, null, null, null, null, null, null, null, 'eSim', numB, 'n/a', null, null, 'Bodega Santiago']);
    // numC sin RUT pero con nombre; y una fila sin número.
    ws.addRow([null, 'Rosa', `Rojas${u}`, null, 'Motorola', 'G54', 'S3', null, 'Nuevo', Number(numC.slice(2)), 'Movistar', new Date('2024-05-01'), null, null]);
    ws.addRow(['25.684.772-8', 'Daniela', 'Alejandra', null, null, null, null, null, 'eSim', null, null, null, null, null]);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    // Propone la hoja y las columnas del inventario: "Estado" es del equipo, no de la línea.
    expect((await hojasDelArchivo(buffer)).sugerida).toBe('NORMALIZADO');
    const { mapeo } = await columnasDeHoja(buffer, 'NORMALIZADO');
    expect(mapeo).toMatchObject({
      numero: 'N° Telefono', rut: 'RUT', imei: 'IMEI', tipoChip: 'Estado', operador: 'Operador', fechaEntrega: 'Fecha entrega',
      observaciones: 'Incidencia', nombre: 'Nombre', apellidoPaterno: 'Apellido P.',
    });
    expect(mapeo.estado).toBeUndefined();
    expect(mapeo).not.toHaveProperty('responsable');

    const previa = await vistaPreviaLineas(buffer, 'NORMALIZADO', mapeo);
    expect(previa.resumen).toMatchObject({ total: 4, nuevas: 3, conError: 1, entregasAnteriores: 1 });
    const falta = previa.filas.find((f) => f.errores.length);
    expect(falta?.errores).toEqual(['Falta el número']);
    const linea = previa.filas.find((f) => f.numero === numA)!;
    expect(linea).toMatchObject({ rut, operador: 'Entel', fechaEntrega: '2025-03-01', observaciones: 'Falla', entregas: [{ nombre: `Luis Gomez${u} Perez`, desde: '2024-02-10' }] });
    // Las dos personas que no estan en el sistema se crearian (la otra no trae RUT).
    expect(previa.resumen.personasNuevas).toBe(2);
    expect(linea.avisos).toEqual([]);
    // "eSim" y "SIM" son del tipo de chip; "Nuevo" y "Usado" son del equipo y no calzan con ninguno; "n/a" no es un operador.
    const eSim = (await prisma.tipoChip.findUniqueOrThrow({ where: { nombre: 'eSIM / MFF' } })).id;
    const entel = (await prisma.operadorLinea.findUniqueOrThrow({ where: { nombre: 'Entel' } })).id;
    expect(previa.valores.tipoChip.find((v) => v.valor === 'eSim')?.opcionId).toBe(eSim);
    expect(previa.valores.tipoChip.find((v) => v.valor === 'Usado')?.opcionId).toBeNull();
    expect(previa.valores.operador.map((v) => v.valor).sort()).toEqual(['Entel', 'Movistar']);
    expect(previa.valores.operador.find((v) => v.valor === 'Entel')?.opcionId).toBe(entel);

    const filas = previa.filas
      .filter((f) => f.errores.length === 0)
      .map(({ existe: _x, estado: _s, tipoChip, operador, errores: _e, avisos: _a, ...f }) => ({
        ...f,
        estadoId: null,
        tipoChipId: tipoChip === 'eSim' ? eSim : null,
        operadorId: operador === 'Entel' ? entel : null,
      }));
    expect((await importarTandaLineas(filas, '2026-07-31', 'jsoto')).map((x) => x.resultado)).toEqual(['nueva', 'nueva', 'nueva']);

    const porNumero = new Map((await prisma.lineaTelefonica.findMany({ where: { numero: { in: [numA, numB, numC] } } })).map((l) => [l.numero, l]));
    // numA: queda en el celular de la persona de hoy, con operador y la incidencia.
    expect(porNumero.get(numA)).toMatchObject({ activoId: ids.celular, empleadoId: null, operadorId: entel, observaciones: 'Falla' });
    const tramos = (await fichaLinea(porNumero.get(numA)!.id)).tenencias;
    expect(tramos).toMatchObject([
      { activoId: ids.celular, empleadoId: ids.empleado, hasta: null, origen: 'importacion' },
      { activoId: null, empleadoId: expect.any(String), origen: 'importacion', detalle: 'Entrega anterior registrada en el archivo' },
    ]);
    // Quien tuvo la linea antes no estaba en el sistema: se creo desvinculado (su RUT tenia el digito verificador malo, queda sin RUT).
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: tramos[1].empleadoId! } })).toMatchObject({ nombres: 'Luis', apellidoPaterno: `Gomez${u}`, estado: 'desvinculado', rut: null });
    expect(tramos[1].desde.toISOString().slice(0, 10)).toBe('2024-02-10');
    expect(tramos[1].hasta?.toISOString().slice(0, 10)).toBe('2025-03-01');
    expect(tramos[0].desde.toISOString().slice(0, 10)).toBe('2025-03-01');
    expect((await fichaLinea(porNumero.get(numA)!.id)).reasignaciones).toBe(1);
    // numB: eSIM sin persona, sin operador.
    expect(porNumero.get(numB)).toMatchObject({ tipoChipId: eSim, operadorId: null, activoId: null, empleadoId: null });
    // numC: sin RUT se busca por nombre y, como no esta, se crea activa sin RUT para completarlo despues.
    expect(porNumero.get(numC)).toMatchObject({ empleadoId: expect.any(String) });
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: porNumero.get(numC)!.empleadoId! } })).toMatchObject({ nombres: 'Rosa', apellidoPaterno: `Rojas${u}`, estado: 'activo', rut: null });
    // La persona de hoy ve la línea en su historial.
    expect((await tenenciasDePersona(ids.empleado!)).some((t) => t.lineaId === porNumero.get(numA)!.id)).toBe(true);
  });

  test('indicadores: asignada solo con persona (celular o teléfono personal); sin persona está disponible', async () => {
    const antes = await indicadoresLineas();
    const [personal, delCelular] = await Promise.all([
      prisma.employee.create({ data: { nombres: 'Prueba', apellidoPaterno: `Ind${s}a`, estado: 'activo' } }),
      prisma.employee.create({ data: { nombres: 'Prueba', apellidoPaterno: `Ind${s}b`, estado: 'activo' } }),
    ]);
    const celular = await crearEquipo({ categoriaId: ids.categorias[0], marca: 'Samsung', modelo: `Ind ${s}`, estado: 'disponible' });
    try {
      await crearLinea(datos({ numero: nuevo() })); // sin persona: disponible
      await crearLinea(datos({ numero: nuevo(), empleadoId: personal.id })); // teléfono personal
      await crearLinea(datos({ numero: nuevo(), activoId: celular.id })); // celular de la empresa, de bodega...
      await prisma.$transaction((tx) => alCambiarTenedorDelTelefono(tx, { activoId: celular.id, de: null, a: delCelular.id }));
      await prisma.asset.update({ where: { id: celular.id }, data: { estado: 'asignado', empleadoActualId: delCelular.id } }); // ...y se entrega
      const d = await indicadoresLineas();
      expect(d.tarjetas.activas.lineas - antes.tarjetas.activas.lineas).toBe(3);
      expect(d.tarjetas.disponibles - antes.tarjetas.disponibles).toBe(1);
      // Las dos personas nuevas tienen línea, una en su teléfono personal y otra en su celular.
      expect(d.personas.activas - antes.personas.activas).toBe(2);
      expect(d.personas.conLinea - antes.personas.conLinea).toBe(2);
    } finally {
      const enCelular = await prisma.lineaTelefonica.findMany({ where: { activoId: celular.id }, select: { id: true } });
      await prisma.lineaTenencia.deleteMany({ where: { lineaId: { in: enCelular.map((l) => l.id) } } });
      await prisma.lineaTelefonica.deleteMany({ where: { activoId: celular.id } });
      await prisma.asset.delete({ where: { id: celular.id } });
      await prisma.employee.deleteMany({ where: { id: { in: [personal.id, delCelular.id] } } });
    }
  });

  test('tenencia: el primer tramo es el alta; asignar cierra uno y abre otro, con motivo, y se cuenta', async () => {
    const linea = await crearLinea(datos({ numero: nuevo(), activoId: ids.libre }), 'jsoto');
    let ficha = await fichaLinea(linea.id);
    expect(ficha.reasignaciones).toBe(0);
    expect(ficha.tenencias).toMatchObject([{ origen: 'alta', hasta: null, activoId: ids.libre, empleadoId: null }]);

    // Sacada del celular (chip físico): queda sin asignar y sin persona.
    const motivo = await prisma.motivoReasignacion.findFirstOrThrow({ where: { nombre: 'Cambio de equipo' } });
    const reasignada = await reasignarLinea(
      linea.id,
      reasignacionSchema.parse({ destino: 'ninguno', motivoId: motivo.id, detalle: 'chip retirado del equipo' }),
      'jsoto'
    );
    expect(reasignada).toMatchObject({ activoId: null, empleadoId: null });
    ficha = await fichaLinea(linea.id);
    expect(ficha.reasignaciones).toBe(1);
    expect(ficha.tenencias).toMatchObject([
      { origen: 'reasignacion', empleadoId: null, activoId: null, hasta: null, usuario: 'jsoto', detalle: 'chip retirado del equipo', motivo: { nombre: 'Cambio de equipo' } },
      { origen: 'alta', empleadoId: null, activoId: ids.libre },
    ]);
    // El tramo anterior termina justo cuando empieza el nuevo.
    expect(ficha.tenencias[1].hasta?.getTime()).toBe(ficha.tenencias[0].desde.getTime());
    // Y queda en la auditoría.
    expect(await prisma.auditLog.findFirst({ where: { entidadId: linea.id, descripcion: { contains: 'reasignada' } } })).toBeTruthy();

    // De vuelta a un celular de bodega.
    const devuelta = await reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'telefono', activoId: ids.libre }));
    expect(devuelta).toMatchObject({ activoId: ids.libre, empleadoId: null });
    expect((await fichaLinea(linea.id)).tenencias[0]).toMatchObject({ empleadoId: null, activoId: ids.libre });
    expect((await fichaLinea(linea.id)).reasignaciones).toBe(2);
  });

  test('reasignar rechaza lo que no cambia, una persona desvinculada, un celular de baja, un tipo de chip malo y una línea de baja', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n, activoId: ids.libre }));
    const reasignar = (extra: Record<string, unknown>) => reasignarLinea(linea.id, reasignacionSchema.parse(extra));
    await expect(reasignar({ destino: 'telefono', activoId: ids.libre })).rejects.toMatchObject({ status: 409 });
    // Un celular que ya tiene otra línea no (SPEC 2.164).
    const otra = await crearLinea(datos({ numero: nuevo(), activoId: ids.disponible }));
    await expect(reasignar({ destino: 'telefono', activoId: ids.disponible })).rejects.toMatchObject({
      details: [{ field: 'activoId', message: expect.stringContaining('ya tiene una línea') }],
    });
    await reasignarLinea(otra.id, reasignacionSchema.parse({ destino: 'ninguno' }));
    // Chip físico: no va directo a una persona (SPEC 2.131).
    await expect(reasignar({ destino: 'persona', empleadoId: ids.otraPersona })).rejects.toMatchObject({
      details: [{ field: 'destino', message: expect.stringContaining('chip físico') }],
    });
    // Una eSIM disponible sí va a una persona, pero no a una desvinculada.
    const deEsim = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim }));
    await expect(
      reasignarLinea(deEsim.id, reasignacionSchema.parse({ destino: 'persona', empleadoId: ids.desvinculada }))
    ).rejects.toMatchObject({ details: [{ field: 'empleadoId', message: 'La persona está desvinculada' }] });
    await expect(reasignar({ destino: 'telefono', activoId: ids.notebook })).rejects.toMatchObject({
      details: [{ field: 'activoId', message: 'Elige un celular del inventario' }],
    });
    await expect(reasignar({ destino: 'telefono', activoId: ids.telefonoBaja })).rejects.toMatchObject({
      details: [{ field: 'activoId', message: 'Ese celular está de baja' }],
    });
    // Un tipo de chip que no existe no se acepta (SPEC 2.167).
    await expect(reasignar({ destino: 'ninguno', tipoChipId: randomUUID() })).rejects.toMatchObject({
      details: [{ field: 'tipoChipId', message: 'Elige un tipo de chip de la lista' }],
    });
    // Elegir "persona" o "teléfono" sin elegir cuál ni siquiera pasa la validación.
    expect(() => reasignacionSchema.parse({ destino: 'persona' })).toThrow();
    expect(() => reasignacionSchema.parse({ destino: 'telefono' })).toThrow();
    // Nada de lo rechazado dejó rastro.
    expect((await fichaLinea(linea.id)).tenencias).toHaveLength(1);
    // Una línea dada de baja no se reasigna.
    await darDeBajaLinea(linea.id, bajaDe());
    await expect(reasignar({ destino: 'ninguno' })).rejects.toMatchObject({ status: 409 });
  });

  test('editar una línea no cambia su teléfono ni su persona: eso es Asignar', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n, activoId: ids.libre }));
    const editada = await editarLinea(
      linea.id,
      datos({ numero: n, tipoChipId: fisico, observaciones: 'corregida', activoId: '', empleadoId: ids.otraPersona })
    );
    expect(editada).toMatchObject({ activoId: ids.libre, empleadoId: null, observaciones: 'corregida' });
    expect((await fichaLinea(linea.id)).tenencias).toHaveLength(1);
    // El tipo de chip no se quita, y no cambia a uno que no calza con dónde está la línea.
    await expect(editarLinea(linea.id, datos({ numero: n, tipoChipId: '' }))).rejects.toMatchObject({
      details: [{ field: 'tipoChipId', message: 'Elige el tipo de chip' }],
    });
    await expect(editarLinea(linea.id, datos({ numero: n, tipoChipId: esim }))).rejects.toMatchObject({
      details: [{ field: 'tipoChipId', message: expect.stringContaining('acciones de su ficha') }],
    });
    // Sin asignar, sí puede pasar a eSIM.
    await reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'ninguno' }));
    expect(await editarLinea(linea.id, datos({ numero: n, tipoChipId: esim }))).toMatchObject({ tipoChipId: esim });
  });

  test('dos líneas al mismo celular a la vez: el celular queda bloqueado y solo una entra (SPEC 2.164)', async () => {
    const { categoriaId } = await prisma.asset.findUniqueOrThrow({ where: { id: ids.libre! }, select: { categoriaId: true } });
    const celular = await crearEquipo({ categoriaId, marca: 'Xiaomi', modelo: `Carrera ${nuevo()}`, estado: 'disponible' });
    const [a, b] = await Promise.all([crearLinea(datos({ numero: nuevo(), tipoChipId: fisico })), crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }))]);
    const resultados = await Promise.allSettled(
      [a, b].map((l) => reasignarLinea(l.id, reasignacionSchema.parse({ destino: 'telefono', activoId: celular.id })))
    );
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.find((r) => r.status === 'rejected')).toMatchObject({ reason: { details: [{ message: expect.stringContaining('ya tiene una línea') }] } });
    expect(await prisma.lineaTelefonica.count({ where: { activoId: celular.id } })).toBe(1);
    // Este celular no esta en la limpieza general: sus lineas salen de ahi antes de borrarlo.
    await prisma.lineaTenencia.deleteMany({ where: { activoId: celular.id } });
    await prisma.lineaTelefonica.updateMany({ where: { activoId: celular.id }, data: { activoId: null } });
    await prisma.asset.delete({ where: { id: celular.id } });
  });

  test('cambiar el tipo con el mismo número (SPEC 2.167): de un teléfono a eSIM con una persona, y de vuelta a chip físico', async () => {
    const linea = await crearLinea(datos({ numero: nuevo(), activoId: ids.libre }));
    // Chip físico en un teléfono sin persona -> eSIM con una persona, en un paso.
    const aEsim = await reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'persona', empleadoId: ids.otraPersona, tipoChipId: esim }));
    expect(aEsim).toMatchObject({ tipoChipId: esim, activoId: null, empleadoId: ids.otraPersona });
    let ficha = await fichaLinea(linea.id);
    expect(ficha.tenencias[0]).toMatchObject({ origen: 'reasignacion', empleadoId: ids.otraPersona, hasta: null });
    expect(ficha.historial.some((e) => e.tipo === 'datos' && e.descripcion.includes('tipo de chip'))).toBe(true);
    // Ahora la usa una persona: no se toca desde Líneas.
    await expect(reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'ninguno', tipoChipId: fisico }))).rejects.toMatchObject({ status: 409 });

    // Una eSIM disponible pasa a chip físico y queda disponible, sin tramo nuevo.
    const disponible = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim }));
    const tramos = (await fichaLinea(disponible.id)).tenencias.length;
    const aFisico = await reasignarLinea(disponible.id, reasignacionSchema.parse({ destino: 'ninguno', tipoChipId: fisico }));
    expect(aFisico).toMatchObject({ tipoChipId: fisico, activoId: null, empleadoId: null });
    ficha = await fichaLinea(disponible.id);
    expect(ficha.tenencias).toHaveLength(tramos);
    expect(await prisma.auditLog.findFirst({ where: { entidadId: disponible.id, descripcion: { contains: 'pasó a Físico' } } })).toBeTruthy();
    // El tipo debe calzar con el destino: un chip físico no va a una persona.
    await expect(
      reasignarLinea(disponible.id, reasignacionSchema.parse({ destino: 'persona', empleadoId: ids.otraPersona }))
    ).rejects.toMatchObject({ details: [{ field: 'destino' }] });
    // Sin cambio de tipo ni de lugar, se rechaza.
    await expect(reasignarLinea(disponible.id, reasignacionSchema.parse({ destino: 'ninguno', tipoChipId: fisico }))).rejects.toMatchObject({ status: 409 });
  });

  test('cambios simultáneos de una línea van uno tras otro: un solo tramo abierto y editar no deshace una asignación', async () => {
    const n = nuevo();
    // Sin asignar y con chip físico: se le asigna un celular mientras se edita.
    const linea = await crearLinea(datos({ numero: n, tipoChipId: fisico }));
    const resultados = await Promise.allSettled([
      reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'telefono', activoId: ids.libre })),
      editarLinea(linea.id, datos({ numero: n, tipoChipId: fisico, observaciones: 'simultánea' })),
    ]);
    // Ninguno falla: cada uno espera al anterior y parte de lo que este dejo.
    expect(resultados.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const { linea: final, tenencias } = await fichaLinea(linea.id);
    expect(tenencias.filter((t) => t.hasta === null)).toHaveLength(1);
    expect(tenencias).toHaveLength(2);
    // La linea queda en el celular asignado (la edicion no lo deshizo) y con la observacion.
    expect(final).toMatchObject({ activoId: ids.libre, observaciones: 'simultánea' });
    expect(tenencias[0]).toMatchObject({ activoId: ids.libre, hasta: null });
  });

  test('cuando el teléfono cambia de manos, la línea anota su tenencia: entrega y devolución, con el historial de la persona', async () => {
    const linea = await crearLinea(datos({ numero: nuevo(), activoId: ids.disponible }));
    expect((await fichaLinea(linea.id)).tenencias[0]).toMatchObject({ origen: 'alta', empleadoId: null, activoId: ids.disponible });

    // Se entrega el teléfono (por Asignaciones, como en un onboarding): la línea pasa a la persona.
    const asignacion = await asignarEquipo(
      { assetId: ids.disponible!, employeeId: ids.otraPersona!, fechaEntrega: new Date(), tipoMovimiento: 'ingreso' },
      'jsoto'
    );
    let ficha = await fichaLinea(linea.id);
    expect(ficha.tenencias[0]).toMatchObject({ origen: 'entrega_telefono', empleadoId: ids.otraPersona, hasta: null });
    expect(ficha.tenencias[0].detalle).toBeTruthy();

    // Se devuelve (como en un offboarding): queda sin persona, dentro del mismo teléfono.
    await devolverCelular(asignacion.id);
    ficha = await fichaLinea(linea.id);
    expect(ficha.reasignaciones).toBe(2);
    expect(ficha.tenencias).toMatchObject([
      { origen: 'devolucion_telefono', empleadoId: null, activoId: ids.disponible, hasta: null },
      { origen: 'entrega_telefono', empleadoId: ids.otraPersona },
      { origen: 'alta', empleadoId: null },
    ]);
    expect(ficha.tenencias[1].hasta).not.toBeNull();

    // La línea no pasó por el celular que no tiene: su persona sigue saliendo del teléfono.
    expect((await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: linea.id } })).empleadoId).toBeNull();

    // Historial de la persona: la línea que tuvo, con cómo terminó.
    const delHistorial = (await tenenciasDePersona(ids.otraPersona!)).filter((t) => t.lineaId === linea.id);
    expect(delHistorial).toMatchObject([{ cierre: 'devolucion_telefono', linea: { id: linea.id } }]);

    // Asignar el mismo día de un cambio automático funciona (queda a continuación).
    await reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'ninguno' }));
    expect((await fichaLinea(linea.id)).tenencias[0]).toMatchObject({ origen: 'reasignacion', activoId: null });
  });

  test('sede: en un celular o con una persona, el navbar usa la sede de ellos, no la de la línea', async () => {
    const celular = await crearEquipo({ categoriaId: ids.categorias[0], marca: 'Samsung', modelo: `Sede ${s}`, estado: 'disponible', sedeId: ids.sede });
    const persona = await prisma.employee.create({ data: { nombres: 'Prueba', apellidoPaterno: `Sede${s}`, estado: 'activo', sedeId: ids.otraSede } });
    try {
      const enCelular = await crearLinea(datos({ numero: nuevo(), activoId: celular.id }));
      const conPersona = await crearLinea(datos({ numero: nuevo(), empleadoId: persona.id }));
      const deSede = async (sedeId: string) => (await listarLineas({ sedeId })).map((l) => l.id);
      expect(await deSede(ids.sede!)).toContain(enCelular.id);
      expect(await deSede(ids.sede!)).not.toContain(conPersona.id);
      expect(await deSede(ids.otraSede!)).toContain(conPersona.id);
      expect(await deSede(ids.otraSede!)).not.toContain(enCelular.id);
      // Sin sede elegida, la linea no guarda una; sus tramos nunca (la sede propia es solo de un chip disponible, SPEC 2.165).
      expect(enCelular.sedeId).toBeNull();
      expect((await fichaLinea(enCelular.id)).tenencias[0]).not.toHaveProperty('sedeId');
    } finally {
      const propias = await prisma.lineaTelefonica.findMany({ where: { OR: [{ activoId: celular.id }, { empleadoId: persona.id }] }, select: { id: true } });
      await prisma.lineaTenencia.deleteMany({ where: { lineaId: { in: propias.map((l) => l.id) } } });
      await prisma.lineaTelefonica.deleteMany({ where: { id: { in: propias.map((l) => l.id) } } });
      await prisma.asset.delete({ where: { id: celular.id } });
      await prisma.employee.delete({ where: { id: persona.id } });
    }
  });

  test('eSIM: un tipo de chip "sin celular" no admite celular al crear ni al reasignar; las líneas que ya lo tenían se pueden seguir editando', async () => {
    const { opcion: esim } = await crearOpcionLinea('tipos-chip', { nombre: `eSIM ${s}`, sinCelular: true });
    ids.opciones.push(esim.id);
    expect(esim).toMatchObject({ sinCelular: true });
    // Al crear: con celular se rechaza; con persona o sin nada, no.
    await expect(crearLinea(datos({ numero: nuevo(), tipoChipId: esim.id, activoId: ids.celular }))).rejects.toMatchObject({
      details: [{ field: 'activoId', message: expect.stringContaining('eSIM') }],
    });
    const conPersona = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim.id, empleadoId: ids.otraPersona }));
    expect(conPersona).toMatchObject({ activoId: null, empleadoId: ids.otraPersona });
    // Ya asignada: no se asigna a otra persona desde Líneas (SPEC 2.131).
    await expect(reasignarLinea(conPersona.id, reasignacionSchema.parse({ destino: 'persona', empleadoId: ids.empleado }))).rejects.toMatchObject({ status: 409 });
    // Disponible: a un celular se rechaza; a una persona, no.
    const libre = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim.id }));
    await expect(reasignarLinea(libre.id, reasignacionSchema.parse({ destino: 'telefono', activoId: ids.libre }))).rejects.toMatchObject({
      details: [{ field: 'destino', message: expect.stringContaining('eSIM') }],
    });
    await reasignarLinea(libre.id, reasignacionSchema.parse({ destino: 'persona', empleadoId: ids.empleado }));

    // Una línea antigua que quedó en un celular con eSIM (de antes de la regla) se sigue editando si no cambia el chip.
    const antigua = await prisma.lineaTelefonica.create({
      data: { numero: nuevo(), estadoId: (await prisma.estadoLinea.findUniqueOrThrow({ where: { clave: 'activa' } })).id, tipoChipId: esim.id, activoId: ids.celular },
    });
    const editada = await editarLinea(antigua.id, datos({ numero: antigua.numero, tipoChipId: esim.id, observaciones: 'antigua' }));
    expect(editada).toMatchObject({ activoId: ids.celular, tipoChipId: esim.id, observaciones: 'antigua' });
    // El tipo se marca o se desmarca desde el catálogo.
    expect(await editarOpcionLinea('tipos-chip', esim.id, { nombre: esim.nombre, sinCelular: false })).toMatchObject({ sinCelular: false });
  });

  test('solo se asigna una línea disponible: una en un celular que tiene alguien cambia con las solicitudes', async () => {
    const linea = await crearLinea(datos({ numero: nuevo(), activoId: ids.disponible }));
    const asignacion = await asignarEquipo(
      { assetId: ids.disponible!, employeeId: ids.otraPersona!, fechaEntrega: new Date(), tipoMovimiento: 'ingreso' },
      'jsoto'
    );
    try {
      await expect(reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'ninguno' }))).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('con una solicitud'),
      });
    } finally {
      await devolverCelular(asignacion.id);
    }
    // Devuelto el celular, la línea queda disponible y se puede asignar.
    await reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'ninguno' }));
  });

  test('devolución por término: las eSIM de la persona quedan disponibles; las de un celular no se tocan', async () => {
    const esimDe = await crearLinea(datos({ numero: nuevo(), empleadoId: ids.otraPersona }));
    const enCelular = await crearLinea(datos({ numero: nuevo(), activoId: ids.libre }));
    const liberadas = await prisma.$transaction((tx) => liberarEsimDePersona(tx, ids.otraPersona!, { usuario: 'jsoto', detalle: 'Devolución por término' }));
    expect(liberadas).toContain(esimDe.id);
    expect(liberadas).not.toContain(enCelular.id);
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: esimDe.id } })).toMatchObject({ empleadoId: null, activoId: null });
    expect((await fichaLinea(esimDe.id)).tenencias[0]).toMatchObject({ origen: 'termino', empleadoId: null, usuario: 'jsoto', hasta: null });
    expect((await fichaLinea(enCelular.id)).tenencias).toHaveLength(1);
    // La persona queda registrada en la línea: su tramo se cierra, no se borra.
    const ficha = await fichaLinea(esimDe.id);
    expect(ficha.tenencias[1]).toMatchObject({ empleadoId: ids.otraPersona });
    expect(ficha.tenencias[1].hasta).not.toBeNull();
    expect(ficha.personas).toBe(1);
    // El celular devuelto sigue mostrando su línea (el detalle de la desvinculación la lista).
    expect((await lineasDeEquipos([ids.libre!])).map((l) => l.id)).toContain(enCelular.id);
    // Cada cambio de lugar queda en el historial de eventos.
    expect(ficha.historial.map((e) => e.descripcion)).toEqual(expect.arrayContaining([expect.stringContaining('Queda disponible')]));
    // Ya disponible, se puede asignar a otra persona.
    await reasignarLinea(esimDe.id, reasignacionSchema.parse({ destino: 'persona', empleadoId: ids.empleado }));
    expect((await fichaLinea(esimDe.id)).historial[0].descripcion).toMatch(/^Asignada a .*Prueba/);
  });

  test('al entregar un celular en una solicitud se le asocia una línea disponible: el chip físico al celular, la eSIM a la persona (SPEC 2.143)', async () => {
    const fisica = await crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }));
    const virtual = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim }));
    await prisma.$transaction(async (tx) => {
      await asociarLineaEnSolicitud(tx, fisica.id, { activoId: ids.libre!, empleadoId: ids.empleado!, detalle: 'Onboarding - T1', usuario: 'jsoto' });
      await asociarLineaEnSolicitud(tx, virtual.id, { activoId: ids.libre!, empleadoId: ids.empleado!, detalle: 'Onboarding - T1', usuario: 'jsoto' });
    });
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: fisica.id } })).toMatchObject({ activoId: ids.libre, empleadoId: null });
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: virtual.id } })).toMatchObject({ activoId: null, empleadoId: ids.empleado });
    expect((await fichaLinea(fisica.id)).tenencias[0]).toMatchObject({ origen: 'reasignacion', activoId: ids.libre, usuario: 'jsoto' });

    // Una que ya está asignada no se toma, y si la solicitud falla no queda nada a medias.
    await expect(
      prisma.$transaction(async (tx) => {
        await asociarLineaEnSolicitud(tx, virtual.id, { activoId: ids.libre!, empleadoId: ids.empleado!, detalle: 'x', usuario: 'jsoto' });
      })
    ).rejects.toMatchObject({ status: 409 });
    const otra = await crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }));
    await expect(
      prisma.$transaction(async (tx) => {
        await asociarLineaEnSolicitud(tx, otra.id, { activoId: ids.disponible!, empleadoId: ids.empleado!, detalle: 'x', usuario: 'jsoto' });
        throw new Error('falla después');
      })
    ).rejects.toThrow('falla después');
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: otra.id } })).toMatchObject({ activoId: null, empleadoId: null });
  });

  test('la línea de un celular en bodega se mueve al celular que se entrega; la de un celular con persona no (SPEC 2.163)', async () => {
    const { categoriaId } = await prisma.asset.findUniqueOrThrow({ where: { id: ids.libre! }, select: { categoriaId: true } });
    const celular = (modelo: string) => crearEquipo({ categoriaId, marca: 'Xiaomi', modelo, estado: 'disponible' });
    const enBodega = await celular(`Bodega mover ${nuevo()}`);
    const nuevoCelular = await celular(`Nuevo mover ${nuevo()}`);
    const chip = await prisma.lineaTelefonica.create({ data: { numero: nuevo(), estadoId: activa, tipoChipId: fisico, activoId: enBodega.id } });

    await prisma.$transaction((tx) =>
      asociarLineaEnSolicitud(tx, chip.id, { activoId: nuevoCelular.id, empleadoId: ids.empleado!, detalle: 'Onboarding - T9', usuario: 'jsoto' })
    );
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: chip.id } })).toMatchObject({ activoId: nuevoCelular.id });
    expect((await fichaLinea(chip.id)).tenencias[0]).toMatchObject({ origen: 'reasignacion', activoId: nuevoCelular.id });

    // La línea del celular que usa una persona no se toma: sigue con ella.
    const enUso = await prisma.lineaTelefonica.create({ data: { numero: nuevo(), estadoId: activa, tipoChipId: fisico, activoId: ids.celular } });
    await expect(
      prisma.$transaction((tx) =>
        asociarLineaEnSolicitud(tx, enUso.id, { activoId: enBodega.id, empleadoId: ids.empleado!, detalle: 'x', usuario: 'jsoto' })
      )
    ).rejects.toMatchObject({ status: 409 });

    // Los celulares de este test no estan en la limpieza general.
    const lineasTest = [chip.id, enUso.id];
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: lineasTest } } });
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: { in: lineasTest } } });
    await prisma.lineaTelefonica.deleteMany({ where: { id: { in: lineasTest } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: [enBodega.id, nuevoCelular.id] } } });
    await prisma.asset.deleteMany({ where: { id: { in: [enBodega.id, nuevoCelular.id] } } });
  });

  test('asignar una línea a un celular que ya tiene persona y no tiene línea: la persona la usa (SPEC 2.164)', async () => {
    const { categoriaId } = await prisma.asset.findUniqueOrThrow({ where: { id: ids.libre! }, select: { categoriaId: true } });
    const entregado = await crearEquipo({ categoriaId, marca: 'Xiaomi', modelo: `Entregado ${nuevo()}`, estado: 'asignado', empleadoActualId: ids.otraPersona });
    const chip = await crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }));
    const asignada = await reasignarLinea(chip.id, reasignacionSchema.parse({ destino: 'telefono', activoId: entregado.id }));
    expect(asignada).toMatchObject({ activoId: entregado.id, empleadoId: null });
    expect((await fichaLinea(chip.id)).tenencias[0]).toMatchObject({ activoId: entregado.id, empleadoId: ids.otraPersona });

    // Ya con línea, ese celular no recibe otra.
    const segunda = await crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }));
    await expect(reasignarLinea(segunda.id, reasignacionSchema.parse({ destino: 'telefono', activoId: entregado.id }))).rejects.toMatchObject({
      details: [{ field: 'activoId', message: expect.stringContaining('ya tiene una línea') }],
    });

    const lineasTest = [chip.id, segunda.id];
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: lineasTest } } });
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: { in: lineasTest } } });
    await prisma.lineaTelefonica.deleteMany({ where: { id: { in: lineasTest } } });
    await prisma.asset.delete({ where: { id: entregado.id } });
  });

  test('cambio de equipo a eSIM con su misma línea: el chip del celular devuelto pasa a eSIM y queda con la persona (SPEC 2.166)', async () => {
    const { categoriaId } = await prisma.asset.findUniqueOrThrow({ where: { id: ids.libre! }, select: { categoriaId: true } });
    const devuelto = await crearEquipo({ categoriaId, marca: 'Xiaomi', modelo: `Devuelto ${nuevo()}`, estado: 'disponible' });
    const chip = await prisma.lineaTelefonica.create({ data: { numero: nuevo(), estadoId: activa, tipoChipId: fisico, activoId: devuelto.id } });
    await prisma.lineaTenencia.create({ data: { lineaId: chip.id, activoId: devuelto.id, desde: new Date(Date.now() - 60_000), origen: 'alta' } });

    await prisma.$transaction((tx) =>
      convertirLineaAEsimEnSolicitud(tx, { activoId: devuelto.id, empleadoId: ids.empleado!, detalle: 'Cambio de equipo - T8', usuario: 'jsoto' })
    );
    const linea = await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: chip.id }, include: { tipoChip: true } });
    expect(linea).toMatchObject({ numero: chip.numero, activoId: null, empleadoId: ids.empleado, tipoChip: { sinCelular: true } });
    const ficha = await fichaLinea(chip.id);
    expect(ficha.tenencias[0]).toMatchObject({ origen: 'reasignacion', empleadoId: ids.empleado, detalle: 'Cambio de equipo - T8' });
    expect(ficha.historial.map((e) => e.descripcion)).toEqual(expect.arrayContaining([expect.stringContaining('tipo de chip')]));

    // Un celular sin línea no tiene qué convertir.
    await expect(
      prisma.$transaction((tx) => convertirLineaAEsimEnSolicitud(tx, { activoId: devuelto.id, empleadoId: ids.empleado!, detalle: 'x' }))
    ).rejects.toMatchObject({ details: [{ field: 'convertirLineaEsim', message: expect.stringContaining('no tiene línea') }] });

    await prisma.auditLog.deleteMany({ where: { entidadId: chip.id } });
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: chip.id } });
    await prisma.lineaTelefonica.delete({ where: { id: chip.id } });
    await prisma.asset.delete({ where: { id: devuelto.id } });
  });

  test('onboarding con eSIM: la eSIM queda con la persona y un chip físico se rechaza (SPEC 2.143)', async () => {
    const virtual = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim }));
    const fisica = await crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }));
    await prisma.$transaction((tx) => asociarEsimEnSolicitud(tx, virtual.id, { empleadoId: ids.empleado!, detalle: 'Onboarding - T2', usuario: 'jsoto' }));
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: virtual.id } })).toMatchObject({ activoId: null, empleadoId: ids.empleado });
    // El detalle de la solicitud muestra la línea entregada.
    expect((await lineasDeSolicitud('T2', [])).map((l) => l.id)).toEqual([virtual.id]);
    await expect(
      prisma.$transaction((tx) => asociarEsimEnSolicitud(tx, fisica.id, { empleadoId: ids.empleado!, detalle: 'x', usuario: 'jsoto' }))
    ).rejects.toMatchObject({ status: 409 });
  });

  test('cambio de equipo: una línea se cambia por otra disponible (chip en el mismo celular o eSIM) y la anterior queda libre (SPEC 2.143)', async () => {
    // La línea ya estaba en el celular de la persona (crearla ahí no se permite: se usa la base).
    const chip = await prisma.lineaTelefonica.create({ data: { numero: nuevo(), estadoId: activa, tipoChipId: fisico, activoId: ids.celular } });
    const otroChip = await crearLinea(datos({ numero: nuevo(), tipoChipId: fisico }));
    const virtual = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim }));
    const cambiar = (lineaId: string, nuevaLineaId: string, empleadoId = ids.empleado!) =>
      prisma.$transaction((tx) => cambiarLineaEnSolicitud(tx, { lineaId, nuevaLineaId, empleadoId, detalle: 'Cambio de equipo - T3', usuario: 'jsoto' }));

    // Chip -> chip: el nuevo queda en el mismo celular (que ya tiene persona) y el anterior, libre.
    await cambiar(chip.id, otroChip.id);
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: chip.id } })).toMatchObject({ activoId: null, empleadoId: null });
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: otroChip.id } })).toMatchObject({ activoId: ids.celular, empleadoId: null });
    expect((await fichaLinea(otroChip.id)).tenencias[0]).toMatchObject({ origen: 'reasignacion', empleadoId: ids.empleado, activoId: ids.celular });
    expect((await lineasDePersona(ids.empleado!)).map((l) => l.id)).toEqual(expect.arrayContaining([otroChip.id]));
    expect((await lineasDePersona(ids.empleado!)).map((l) => l.id)).not.toContain(chip.id);
    // El detalle de la solicitud muestra la nueva y no la que se devolvió.
    expect((await lineasDeSolicitud('T3', [])).map((l) => l.id)).toEqual([otroChip.id]);

    // Chip -> eSIM no va por aquí: es devolver el celular con su línea (cambio del celular).
    await expect(cambiar(otroChip.id, virtual.id)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: otroChip.id } })).toMatchObject({ activoId: ids.celular });
    // Para lo que sigue, la persona tiene una eSIM y el celular, su chip.
    await prisma.$transaction((tx) => asociarEsimEnSolicitud(tx, virtual.id, { empleadoId: ids.empleado!, detalle: 'x', usuario: 'jsoto' }));

    // eSIM -> chip físico no va por aquí: se le entrega un celular (lo arma la solicitud).
    await expect(cambiar(virtual.id, chip.id)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: virtual.id } })).toMatchObject({ empleadoId: ids.empleado });

    // eSIM -> eSIM: la anterior queda libre y la nueva, con la persona.
    const otraEsim = await crearLinea(datos({ numero: nuevo(), tipoChipId: esim }));
    await cambiar(virtual.id, otraEsim.id);
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: virtual.id } })).toMatchObject({ activoId: null, empleadoId: null });
    expect(await prisma.lineaTelefonica.findUniqueOrThrow({ where: { id: otraEsim.id } })).toMatchObject({ activoId: null, empleadoId: ids.empleado });

    // Liberar para entregar un celular: solo una eSIM.
    await expect(
      prisma.$transaction((tx) => liberarLineaEnSolicitud(tx, { lineaId: otroChip.id, empleadoId: ids.empleado!, detalle: 'x', soloEsim: true }))
    ).rejects.toMatchObject({ status: 409 });

    // Una línea que no es de la persona, o una nueva ya asignada, no se cambian.
    await expect(cambiar(otraEsim.id, virtual.id, ids.otraPersona!)).rejects.toMatchObject({ status: 409 });
    await expect(cambiar(otraEsim.id, otraEsim.id)).rejects.toMatchObject({ status: 409 });
  });

  test('motivos de reasignación: vienen de base, se pueden agregar y uno usado se desactiva y deja de ofrecerse', async () => {
    const base = (await prisma.motivoReasignacion.findMany({ where: { nombre: { in: ['Cambio de equipo', 'Cambio de persona', 'Persona desvinculada', 'Línea nueva', 'Otro'] } } })).length;
    expect(base).toBe(5);
    const { opcion } = await crearOpcionLinea('motivos', { nombre: `Motivo prueba ${s}` }, 'jsoto');
    ids.opciones.push(opcion.id);
    const linea = await crearLinea(datos({ numero: nuevo(), activoId: ids.libre }));
    await reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'ninguno', motivoId: opcion.id }));
    expect(await eliminarOpcionLinea('motivos', opcion.id, 'jsoto')).toEqual({ desactivado: true });
    await expect(reasignarLinea(linea.id, reasignacionSchema.parse({ destino: 'telefono', activoId: ids.libre, motivoId: opcion.id }))).rejects.toMatchObject({
      details: [{ field: 'motivoId', message: 'Elige un motivo de la lista' }],
    });
    // El tramo que lo usó lo conserva.
    expect((await fichaLinea(linea.id)).tenencias[0]).toMatchObject({ motivo: { nombre: `Motivo prueba ${s}` } });
  });
});
