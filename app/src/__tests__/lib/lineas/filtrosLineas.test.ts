import { SIN_DATO_LINEA, leerFiltrosLineas } from '@/modules/lineas';
import { deSede, whereFiltrosLineas } from '@/modules/lineas/consultas';

// Filtros de Activos > Lineas (SPEC 2.131).
describe('leerFiltrosLineas', () => {
  it('lee los filtros de la URL, sin vacíos ni valores desconocidos', () => {
    const f = leerFiltrosLineas(new URLSearchParams('estado=baja&plan=x&asignacion=otra&revisar=1&tipoChip=t1&sede=sin_dato&q=  ana  &x=1'));
    expect(f).toEqual({ estado: 'baja', tipoChip: 't1', q: 'ana' });
  });
});

describe('whereFiltrosLineas', () => {
  const partes = (w: ReturnType<typeof whereFiltrosLineas>) => w.AND as object[];

  it('sin filtros: todas; "vigentes" (de las tarjetas) agrupa las que no son de baja', () => {
    expect(partes(whereFiltrosLineas({}))).toEqual([]);
    expect(partes(whereFiltrosLineas({ estado: 'vigentes' }))).toEqual([{ estado: { deBaja: false } }]);
    expect(partes(whereFiltrosLineas({ estado: 'e1' }))).toEqual([{ estadoId: 'e1' }]);
  });

  it('"Sin ..." busca las que no tienen el dato; la sede del navbar es la del celular o, sin celular, la de la persona', () => {
    const w = partes(whereFiltrosLineas({ estado: 'todas', tipoChip: SIN_DATO_LINEA, operador: 'op1', sedeId: 's1' }));
    expect(w).toEqual(expect.arrayContaining([deSede('s1'), { tipoChipId: null }, { operadorId: 'op1' }]));
    expect(deSede('s1')).toEqual({ OR: [{ activo: { sedeId: 's1' } }, { activoId: null, empleado: { sedeId: 's1' } }] });
    expect(deSede(undefined)).toEqual({});
    expect(w).not.toContainEqual({ estado: { deBaja: false } });
  });

  it('el motivo de baja filtra por el elegido; "Baja sin motivo" son las de baja que no lo tienen', () => {
    expect(partes(whereFiltrosLineas({ motivoBaja: 'm1' }))).toEqual([{ motivoBajaId: 'm1' }]);
    expect(partes(whereFiltrosLineas({ motivoBaja: SIN_DATO_LINEA }))).toEqual([{ estado: { deBaja: true }, motivoBajaId: null }]);
    expect(leerFiltrosLineas(new URLSearchParams('motivoBaja=m1'))).toEqual({ motivoBaja: 'm1' });
  });

  it('las tarjetas cuentan sin estado ni asignación', () => {
    expect(partes(whereFiltrosLineas({ estado: 'baja', asignacion: 'sin', tipoChip: 't1' }, { sinTarjeta: true }))).toEqual([{ tipoChipId: 't1' }]);
  });
});
