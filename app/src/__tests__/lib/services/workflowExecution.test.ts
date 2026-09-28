import {
  executeAssignment,
  executeKitDelivery,
  executeKitReturn,
  executeReturn,
} from '@/lib/services/workflowExecutionService';
import { ConflictError, NotFoundError } from '@/lib/errors';

jest.mock('@/lib/services/auditLogService', () => ({
  auditLogService: { registrarCreacion: jest.fn(), registrarActualizacion: jest.fn() },
}));

/**
 * Nucleo que ejecuta entregas, devoluciones y Kit/EPP (auditoria 27-sep-2026,
 * 5.2-A). Antes tenia 0 % de cobertura. Se prueba con un `tx` falso: cada
 * test fija que devuelve cada consulta.
 */
type Fn = jest.Mock;
function txFalso() {
  return {
    asset: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    employee: { findUnique: jest.fn() },
    assignment: {
      create: jest.fn().mockResolvedValue({ id: 'asig-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'asig-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    assetHistory: { create: jest.fn() },
    welcomeKitItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kitAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'kit-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'kit-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    requestKitItem: { updateMany: jest.fn() },
  };
}
type Tx = ReturnType<typeof txFalso>;
const comoTx = (tx: Tx) => tx as never;

const equipo = (o: Record<string, unknown> = {}) => ({
  id: 'a1', estado: 'disponible', sedeId: 'stgo', tieneCargador: false, empleadoActualId: null, categoria: {}, ...o,
});
const empleado = (o: Record<string, unknown> = {}) => ({
  id: 'e1', estado: 'activo', nombres: 'Ana', apellidoPaterno: 'Pérez', rut: null, ...o,
});
const entrega = { assetId: 'a1', employeeId: 'e1', fechaEntrega: new Date(), tipoMovimiento: 'ingreso' as const, sedeId: 'stgo' };

describe('executeAssignment', () => {
  it('entrega un equipo disponible de la misma sede y deja historial', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeAssignment(comoTx(tx), entrega);
    expect(tx.asset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'a1', estado: 'disponible' }) })
    );
    expect(tx.assignment.create).toHaveBeenCalled();
    expect(tx.assetHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'asignacion' }) })
    );
  });

  it('rechaza un equipo de otra sede como si no existiera (A01-1)', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ sedeId: 'conce' }));
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await expect(executeAssignment(comoTx(tx), entrega)).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.assignment.create).not.toHaveBeenCalled();
  });

  it.each(['asignado', 'en_mantencion', 'baja', 'vendido', 'no_devuelto', 'en_transito', 'por_repartir'])(
    'no entrega un equipo en estado %s',
    async (estado) => {
      const tx = txFalso();
      (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ estado }));
      await expect(executeAssignment(comoTx(tx), entrega)).rejects.toBeInstanceOf(ConflictError);
    }
  );

  it('no entrega a un empleado desvinculado', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado({ estado: 'desvinculado' }));
    await expect(executeAssignment(comoTx(tx), entrega)).rejects.toThrow(/desvinculado/);
  });

  it('si otra entrega lo tomó en el intertanto, aborta sin crear la asignación (R2)', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo());
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    (tx.asset.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeAssignment(comoTx(tx), entrega)).rejects.toThrow(/ya fue entregado/);
    expect(tx.assignment.create).not.toHaveBeenCalled();
  });

  it('solo guarda la condición del cargador si el equipo tiene cargador', async () => {
    const tx = txFalso();
    (tx.asset.findUnique as Fn).mockResolvedValue(equipo({ tieneCargador: false }));
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeAssignment(comoTx(tx), { ...entrega, condicionCargadorEntrega: 'operativo' });
    expect((tx.assignment.create as Fn).mock.calls[0][0].data).not.toHaveProperty('condicionCargadorEntrega');
  });
});

describe('executeKitDelivery', () => {
  const kit = { itemId: 'k1', cantidad: 2, employeeId: 'e1', requestId: 'r1', sedeId: 'stgo' };

  it('descuenta con condición de stock suficiente y marca el requerido como entregado', async () => {
    const tx = txFalso();
    (tx.welcomeKitItem.findUnique as Fn).mockResolvedValue({ id: 'k1', nombre: 'Casco', cantidad: 10, sedeId: 'stgo' });
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    await executeKitDelivery(comoTx(tx), kit);
    expect(tx.welcomeKitItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cantidad: { gte: 2 }, sedeId: 'stgo' }) })
    );
    expect(tx.requestKitItem.updateMany).toHaveBeenCalled();
  });

  it('rechaza un artículo de otra sede (A01-2)', async () => {
    const tx = txFalso();
    (tx.welcomeKitItem.findUnique as Fn).mockResolvedValue({ id: 'k1', nombre: 'Casco', cantidad: 50, sedeId: 'conce' });
    await expect(executeKitDelivery(comoTx(tx), kit)).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.welcomeKitItem.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza stock insuficiente sin crear la entrega (R3)', async () => {
    const tx = txFalso();
    (tx.welcomeKitItem.findUnique as Fn)
      .mockResolvedValueOnce({ id: 'k1', nombre: 'Casco', cantidad: 1, sedeId: 'stgo' })
      .mockResolvedValueOnce({ cantidad: 1 });
    (tx.employee.findUnique as Fn).mockResolvedValue(empleado());
    (tx.welcomeKitItem.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeKitDelivery(comoTx(tx), kit)).rejects.toThrow(/Stock insuficiente/);
    expect(tx.kitAssignment.create).not.toHaveBeenCalled();
  });
});

describe('executeReturn', () => {
  const asignacion = (o: Record<string, unknown> = {}) => ({
    id: 'asig-1', assetId: 'a1', employeeId: 'e1', activo: true,
    asset: { estado: 'asignado', empleadoActualId: 'e1', tieneCargador: false },
    employee: { nombres: 'Ana', apellidoPaterno: 'Pérez' },
    ...o,
  });
  const devolucion = { assignmentId: 'asig-1', fechaDevolucion: new Date(), estadoDevolucion: 'ok' as const };

  it('en buen estado cierra la asignación y deja el equipo disponible', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    await executeReturn(comoTx(tx), devolucion);
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'disponible', empleadoActualId: null }) })
    );
  });

  it('rechaza devolver el equipo de otro empleado', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ employeeId: 'otro' }));
    await expect(executeReturn(comoTx(tx), { ...devolucion, expectedEmployeeId: 'e1' })).rejects.toThrow(/no está asignado/);
  });

  it('una asignación ya cerrada no se devuelve de nuevo', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion({ activo: false }));
    await expect(executeReturn(comoTx(tx), devolucion)).rejects.toThrow(/ya fue devuelta/);
  });

  it('si otra devolución simultánea la cerró, se rechaza', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    (tx.assignment.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeReturn(comoTx(tx), devolucion)).rejects.toThrow(/ya fue devuelta/);
    expect(tx.asset.update).not.toHaveBeenCalled();
  });

  it('"no devuelto" deja la asignación activa y el equipo en no_devuelto', async () => {
    const tx = txFalso();
    (tx.assignment.findUnique as Fn).mockResolvedValue(asignacion());
    await executeReturn(comoTx(tx), { ...devolucion, estadoDevolucion: 'no_devuelto' });
    expect(tx.assignment.updateMany).not.toHaveBeenCalled();
    expect(tx.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'no_devuelto' } }));
  });
});

describe('executeKitReturn', () => {
  const kitEntregado = { id: 'kit-1', itemId: 'k1', employeeId: 'e1', cantidad: 3, estado: 'entregado', observaciones: null, item: { nombre: 'Casco' } };

  it('en buen estado repone el stock una sola vez', async () => {
    const tx = txFalso();
    (tx.kitAssignment.findUnique as Fn).mockResolvedValue(kitEntregado);
    await executeKitReturn(comoTx(tx), { kitAssignmentId: 'kit-1', estadoDevolucion: 'ok' });
    expect(tx.welcomeKitItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cantidad: { increment: 3 } } })
    );
  });

  it('si otra devolución simultánea ya lo cerró, no repone stock', async () => {
    const tx = txFalso();
    (tx.kitAssignment.findUnique as Fn).mockResolvedValue(kitEntregado);
    (tx.kitAssignment.updateMany as Fn).mockResolvedValue({ count: 0 });
    await expect(executeKitReturn(comoTx(tx), { kitAssignmentId: 'kit-1', estadoDevolucion: 'ok' })).rejects.toThrow(/ya fue devuelto/);
    expect(tx.welcomeKitItem.update).not.toHaveBeenCalled();
  });

  it('dañado o no devuelto no reponen stock', async () => {
    for (const estadoDevolucion of ['danado', 'no_devuelto'] as const) {
      const tx = txFalso();
      (tx.kitAssignment.findUnique as Fn).mockResolvedValue(kitEntregado);
      await executeKitReturn(comoTx(tx), { kitAssignmentId: 'kit-1', estadoDevolucion });
      expect(tx.welcomeKitItem.update).not.toHaveBeenCalled();
    }
  });
});
