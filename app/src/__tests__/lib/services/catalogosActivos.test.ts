/**
 * @jest-environment node
 */
// Catalogos de Activos (SPEC 2.112.7): categorias y opciones.
jest.mock('@/shared/prisma', () => {
  const tabla = () => ({
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });
  const prisma = {
    marca: tabla(),
    antivirus: tabla(),
    sistemaOperativo: tabla(),
    licenciaMicrosoft365: tabla(),
    assetCategory: tabla(),
    asset: { groupBy: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/shared/auditoria', () => ({
  auditLogService: { registrarCreacion: jest.fn(), registrarActualizacion: jest.fn(), registrarEliminacion: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/shared/prisma';
import { requirePermission } from '@/shared/auth/guard';
import { auditLogService } from '@/shared/auditoria';
import { crearOpcion, eliminarOpcion, idsDeCatalogos, listarOpciones, renombrarOpcion } from '@/modules/activos/catalogos';
import { categoriaSchema } from '@/modules/activos/validacionesCategoria';
import { DELETE as eliminarCategoria, PUT as editarCategoria } from '@/app/api/categorias/[id]/route';
import { reglasIdentificacion } from '@/modules/activos/servicio';
import { validarImei } from '@/modules/activos/imei';
import { procesarFila } from '@/modules/importacion/procesarFila';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const audit = auditLogService as unknown as Record<string, jest.Mock>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/x', { method, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  (requirePermission as jest.Mock).mockResolvedValue({ user: { id: 'yo', email: 'yo@x.cl', role: 'admin' } });
});

describe('opciones de catálogo (una sola lógica para los tres)', () => {
  test('cada catálogo usa su propia tabla y cuenta los equipos por su llave (SPEC 2.168)', async () => {
    db.licenciaMicrosoft365.findMany.mockResolvedValue([{ id: '1', nombre: 'E3', activo: true }]);
    db.asset.groupBy.mockResolvedValue([{ licenciaMicrosoft365Id: '1', _count: 4 }]);
    expect(await listarOpciones('licencias-m365', { conUso: true })).toEqual([
      { id: '1', nombre: 'E3', activo: true, enUso: 4, enSede: 4 },
    ]);
    expect(db.asset.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['licenciaMicrosoft365Id'], where: expect.objectContaining({ licenciaMicrosoft365Id: { in: ['1'] } }) })
    );
  });

  test('enUso cuenta todas las sedes; enSede, solo los vigentes de la sede del navbar', async () => {
    db.antivirus.findMany.mockResolvedValue([{ id: '1', nombre: 'Defender', activo: true }]);
    db.asset.groupBy
      .mockResolvedValueOnce([{ antivirusId: '1', _count: 9 }])
      .mockResolvedValueOnce([{ antivirusId: '1', _count: 2 }]);
    const [opcion] = await listarOpciones('antivirus', { conUso: true, whereSede: { sedeId: 's1' } });
    expect(opcion).toMatchObject({ enUso: 9, enSede: 2 });
    expect(db.asset.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: 's1', deletedAt: null }) })
    );
  });

  test('crear queda en la auditoría con quién fue (también un técnico)', async () => {
    db.antivirus.findFirst.mockResolvedValue(null);
    db.antivirus.create.mockResolvedValue({ id: 'a1', nombre: 'ESET', activo: true });
    const r = await crearOpcion('antivirus', 'ESET', 'tecnico@x.cl');
    expect(r.creada).toBe(true);
    expect(audit.registrarCreacion).toHaveBeenCalledWith(
      'catalogo', 'a1', 'Antivirus: opción creada "ESET"', expect.anything(), 'tecnico@x.cl'
    );
  });

  test('una opción que ya existe activa no se duplica ni se audita', async () => {
    db.antivirus.findFirst.mockResolvedValue({ id: 'a1', nombre: 'ESET', activo: true });
    const r = await crearOpcion('antivirus', 'eset', 'yo@x.cl');
    expect(r).toEqual({ opcion: expect.objectContaining({ id: 'a1' }), creada: false });
    expect(db.antivirus.create).not.toHaveBeenCalled();
    expect(audit.registrarCreacion).not.toHaveBeenCalled();
  });

  test('renombrar al nombre de otra opción -> 409 en el campo', async () => {
    db.sistemaOperativo.findUnique.mockResolvedValue({ id: 's1', nombre: 'Win 10' });
    db.sistemaOperativo.findFirst.mockResolvedValue({ id: 's2', nombre: 'Windows 11' });
    await expect(renombrarOpcion('sistemas-operativos', 's1', 'windows 11')).rejects.toMatchObject({
      status: 409,
      details: [{ field: 'nombre', message: expect.stringContaining('Windows 11') }],
    });
  });

  test('renombrar no toca los equipos (la referencian por su llave) y queda en la auditoría', async () => {
    db.sistemaOperativo.findUnique.mockResolvedValue({ id: 's1', nombre: 'Win 10' });
    db.sistemaOperativo.findFirst.mockResolvedValue(null);
    db.sistemaOperativo.update.mockResolvedValue({ id: 's1', nombre: 'Windows 10' });
    db.asset.count.mockResolvedValue(7);
    await renombrarOpcion('sistemas-operativos', 's1', 'Windows 10', 'yo@x.cl');
    expect(db.asset.updateMany).not.toHaveBeenCalled();
    expect(db.asset.count).toHaveBeenCalledWith({ where: { sistemaOperativoId: 's1' } });
    expect(audit.registrarActualizacion.mock.calls[0][2]).toBe(
      'Sistema operativo: opción renombrada "Win 10" → "Windows 10" (la usan 7 activo(s))'
    );
  });

  test('eliminar queda en la auditoría', async () => {
    db.antivirus.findUnique.mockResolvedValue({ id: 'a1', nombre: 'ESET' });
    db.asset.count.mockResolvedValue(0);
    await expect(eliminarOpcion('antivirus', 'a1', 'yo@x.cl')).resolves.toEqual({ desactivado: false });
    expect(db.antivirus.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(audit.registrarEliminacion).toHaveBeenCalledWith(
      'catalogo', 'a1', 'Antivirus: opción eliminada "ESET"', expect.anything(), 'yo@x.cl'
    );
  });

  test('una opción que usan activos no se borra: se desactiva (SPEC 2.136)', async () => {
    db.antivirus.findUnique.mockResolvedValue({ id: 'a2', nombre: 'Defender', activo: true });
    db.asset.count.mockResolvedValue(3);
    db.antivirus.delete.mockClear();
    await expect(eliminarOpcion('antivirus', 'a2', 'yo@x.cl')).resolves.toEqual({ desactivado: true });
    expect(db.asset.count).toHaveBeenCalledWith({ where: { antivirusId: 'a2' } });
    expect(db.antivirus.delete).not.toHaveBeenCalled();
    expect(db.antivirus.update).toHaveBeenCalledWith({ where: { id: 'a2' }, data: { activo: false } });
  });
});

// El unico paso por el que un equipo toma una opcion de catalogo (SPEC 2.168).
describe('idsDeCatalogos: del nombre a la llave', () => {
  test('busca sin importar mayúsculas; vacío deja sin valor y lo que no viene no se toca', async () => {
    db.marca.findFirst.mockResolvedValue({ id: 'm1', nombre: 'Dell', activo: true });
    db.antivirus.findFirst.mockResolvedValue({ id: 'a1', nombre: 'Defender', activo: true });
    expect(await idsDeCatalogos(prisma as never, { marca: 'dell', antivirus: 'DEFENDER', sistemaOperativo: '' })).toEqual({
      marcaId: 'm1',
      antivirusId: 'a1',
      sistemaOperativoId: null,
    });
    expect(db.marca.findFirst).toHaveBeenCalledWith({ where: { nombre: { equals: 'dell', mode: 'insensitive' } } });
    expect(db.licenciaMicrosoft365.findFirst).not.toHaveBeenCalled();
  });

  test('una opción que no está en el catálogo es un error en su campo', async () => {
    db.marca.findFirst.mockResolvedValue(null);
    await expect(idsDeCatalogos(prisma as never, { marca: 'Patito' })).rejects.toMatchObject({
      status: 409,
      details: [{ field: 'marca', message: expect.stringContaining('no está en su catálogo') }],
    });
  });

  test('una desactivada solo la conserva el equipo que ya la tiene', async () => {
    db.antivirus.findFirst.mockResolvedValue({ id: 'a9', nombre: 'Viejo', activo: false });
    await expect(idsDeCatalogos(prisma as never, { antivirus: 'Viejo' })).rejects.toMatchObject({
      details: [{ field: 'antivirus', message: expect.stringContaining('desactivada') }],
    });
    expect(await idsDeCatalogos(prisma as never, { antivirus: 'Viejo' }, { actual: { antivirusId: 'a9' } })).toEqual({ antivirusId: 'a9' });
    // La importacion trae datos historicos: la acepta igual.
    expect(await idsDeCatalogos(prisma as never, { antivirus: 'Viejo' }, { aceptarDesactivadas: true })).toEqual({ antivirusId: 'a9' });
  });
});

describe('categorías', () => {
  test('stock mínimo vacío o negativo se rechaza (antes se guardaba 0 o -5)', () => {
    expect(categoriaSchema.safeParse({ nombre: 'A', stockMinimo: '' }).success).toBe(false);
    expect(categoriaSchema.safeParse({ nombre: 'A', stockMinimo: -5 }).success).toBe(false);
    expect(categoriaSchema.parse({ nombre: ' A ', stockMinimo: '4' })).toMatchObject({ nombre: 'A', stockMinimo: 4 });
  });

  test('"Qué campos pide" solo acepta los tipos conocidos', () => {
    expect(categoriaSchema.safeParse({ nombre: 'A', tipoFicha: 'computador' }).success).toBe(true);
    expect(categoriaSchema.safeParse({ nombre: 'A', tipoFicha: 'tostadora' }).success).toBe(false);
  });

  test('cambiar "Qué campos pide" queda en la auditoría', async () => {
    const antes = { id: 'c1', nombre: 'Tablet', descripcion: null, stockMinimo: 3, tipoFicha: 'generico' };
    db.assetCategory.findUnique.mockResolvedValue(antes);
    db.assetCategory.findFirst.mockResolvedValue(null);
    db.assetCategory.update.mockResolvedValue({ ...antes, tipoFicha: 'celular' });
    const res = await editarCategoria(pedir('PUT', { nombre: 'Tablet', tipoFicha: 'celular' }), ctx('c1'));
    expect(res.status).toBe(200);
    const [, , , anteriores, nuevos] = audit.registrarActualizacion.mock.calls[0];
    expect(anteriores).toMatchObject({ tipoFicha: 'generico' });
    expect(nuevos).toMatchObject({ tipoFicha: 'celular' });
  });

  test('celular: IMEI obligatorio y el N° de serie opcional; los demás, N° de serie al crear', async () => {
    const tx = { assetCategory: { findUnique: jest.fn() }, asset: { findFirst: jest.fn().mockResolvedValue(null) } };
    const reglas = (d: object, crear = true) => reglasIdentificacion(tx as never, { categoriaId: 'c', ...d }, { crear });
    tx.assetCategory.findUnique.mockResolvedValue({ tipoFicha: 'celular' });
    await expect(reglas({ imei: null })).rejects.toMatchObject({
      status: 400,
      details: [{ field: 'imei', message: 'Escribe el IMEI del celular' }],
    });
    await expect(reglas({ imei: '356938035643809', numeroSerie: null })).resolves.toBeUndefined();
    tx.assetCategory.findUnique.mockResolvedValue({ tipoFicha: 'computador' });
    await expect(reglas({ numeroSerie: '' })).rejects.toMatchObject({ details: [{ field: 'numeroSerie' }] });
    await expect(reglas({ numeroSerie: '' }, false)).resolves.toBeUndefined();
  });

  test('el IMEI no se repite', async () => {
    const tx = {
      assetCategory: { findUnique: jest.fn().mockResolvedValue({ tipoFicha: 'celular' }) },
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'otro' }) },
    };
    await expect(
      reglasIdentificacion(tx as never, { categoriaId: 'c', imei: '356938035643809' }, { crear: true })
    ).rejects.toMatchObject({ status: 409, details: [{ field: 'imei', message: 'Ya existe un activo con el IMEI 356938035643809' }] });
    // Al editar no choca consigo mismo.
    await reglasIdentificacion(tx as never, { categoriaId: 'c', imei: '356938035643809' }, { crear: false, exceptoId: 'a1' }).catch(() => {});
    expect(tx.asset.findFirst).toHaveBeenLastCalledWith({
      where: { imei: '356938035643809', NOT: { id: 'a1' } },
      select: { id: true },
    });
  });

  test('formato del IMEI: 15 números con dígito verificador', () => {
    expect(validarImei('35-693803-564380-9')).toBeNull();
    expect(validarImei('356938035643808')).toMatch(/no es válido/);
    expect(validarImei('12345')).toMatch(/15 números/);
  });

  test('celular: en la importación, una fila sin IMEI es un error marcado en su campo', async () => {
    const ctxFila = { exigeImei: true, mapaMarcas: { samsung: 'Samsung' }, existingImeiSet: new Set(['356938035643809']) } as unknown as Parameters<typeof procesarFila>[1];
    const sinImei = await procesarFila({ marca: 'Samsung', modelo: 'A15' }, ctxFila, {} as never, true);
    expect(sinImei).toMatchObject({ status: 'error', campo: 'imei', mensaje: 'Campos faltantes: IMEI' });
    const malo = await procesarFila({ marca: 'Samsung', modelo: 'A15', imei: '356938035643808' }, ctxFila, {} as never, true);
    expect(malo).toMatchObject({ status: 'error', tipo: 'invalid_format', campo: 'imei' });
    const enBase = { asset: { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) } };
    const repetido = await procesarFila({ marca: 'Samsung', modelo: 'A15', imei: '356938035643809' }, ctxFila, enBase as never, true);
    expect(repetido).toMatchObject({ status: 'error', tipo: 'duplicate_in_database', campo: 'imei' });
  });

  test('una categoría con activos no se elimina (409)', async () => {
    db.assetCategory.findUnique.mockResolvedValue({ id: 'c1', nombre: 'Notebook', _count: { assets: 251 } });
    const res = await eliminarCategoria(pedir('DELETE'), ctx('c1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/251 activo/);
    expect(db.assetCategory.delete).not.toHaveBeenCalled();
  });
});
