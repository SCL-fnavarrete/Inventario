import { SIN_DATO_LINEA, leerFiltrosLineas } from '@/modules/lineas';
import { whereFiltrosLineas } from '@/modules/lineas/consultas';

// Filtros de Activos > Lineas (SPEC 2.131).
describe('leerFiltrosLineas', () => {
  it('lee los filtros de la URL, sin vacíos ni valores desconocidos', () => {
    const f = leerFiltrosLineas(new URLSearchParams('estado=baja&plan=&asignacion=otra&revisar=1&tipoChip=t1&sede=sin_dato&q=  ana  &x=1'));
    expect(f).toEqual({ estado: 'baja', revisar: true, tipoChip: 't1', sede: 'sin_dato', q: 'ana' });
  });
});

describe('whereFiltrosLineas', () => {
  const partes = (w: ReturnType<typeof whereFiltrosLineas>) => w.AND as object[];

  it('sin filtros: todas; "vigentes" (de las tarjetas) agrupa las que no son de baja', () => {
    expect(partes(whereFiltrosLineas({}))).toEqual([]);
    expect(partes(whereFiltrosLineas({ estado: 'vigentes' }))).toEqual([{ estado: { deBaja: false } }]);
    expect(partes(whereFiltrosLineas({ estado: 'e1' }))).toEqual([{ estadoId: 'e1' }]);
  });

  it('"Sin ..." busca las que no tienen el dato; la sede del filtro se suma a la del navbar', () => {
    const w = partes(whereFiltrosLineas({ estado: 'todas', plan: SIN_DATO_LINEA, operador: 'op1', sede: SIN_DATO_LINEA, sedeId: 's1' }));
    expect(w).toEqual(expect.arrayContaining([{ sedeId: 's1' }, { planId: null }, { operadorId: 'op1' }, { sedeId: null }]));
    expect(w).not.toContainEqual({ estado: { deBaja: false } });
  });

  it('"para revisar" reemplaza el estado; las tarjetas cuentan sin estado, asignación ni revisar', () => {
    const revisar = partes(whereFiltrosLineas({ estado: 'baja', revisar: true }));
    expect(revisar).not.toContainEqual({ estado: { deBaja: true } });
    expect(JSON.stringify(revisar)).toContain('"baja","vendido"');
    expect(partes(whereFiltrosLineas({ estado: 'baja', asignacion: 'sin', revisar: true, plan: 'p1' }, { sinTarjeta: true }))).toEqual([{ planId: 'p1' }]);
  });
});
