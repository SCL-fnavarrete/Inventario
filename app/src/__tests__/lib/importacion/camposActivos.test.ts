import { CAMPOS_ACTIVO, camposDeFicha, esObligatorio, mapeoSugerido } from '@/modules/importacion';

// SPEC 2.133: una sola lista de campos para el paso "Columnas", el detector y la guía del Excel.
describe('campos de la importación de equipos', () => {
  test('cada campo se reconoce por el encabezado que la guía recomienda', () => {
    for (const c of CAMPOS_ACTIVO) {
      expect(mapeoSugerido([c.columna])).toMatchObject({ [c.key]: c.columna });
    }
  });

  test('un encabezado recomendado distinto por campo: no hay dos campos con la misma columna', () => {
    const columnas = CAMPOS_ACTIVO.map((c) => c.columna.toLowerCase());
    expect(new Set(columnas).size).toBe(columnas.length);
    const claves = CAMPOS_ACTIVO.map((c) => c.key);
    expect(new Set(claves).size).toBe(claves.length);
  });

  test('los encabezados del inventario de notebooks se reconocen, y "Correo Empresa" no es también el correo personal', () => {
    const encabezados = [
      'Jefatura', 'Supervisor', 'RUT', 'Nombre', 'Apellido P.', 'Apellido M.', 'Estado', 'Correo Empresa', 'Cargo', 'Comuna', 'Equipo', 'Marca',
      'Modelo', 'N° Serie', 'Nombre Equipo', 'Procesador', 'Disco Duro', 'RAM', 'O.S.', 'Microsoft 365 Empresa', 'Condición', 'Fecha de entrega',
      'Historial de asignaciónes', 'Mantencion', 'Proxima Mantencion', 'Antivirus', 'Comentario', 'Com', 'Sede',
    ];
    const m = mapeoSugerido(encabezados);
    expect(m).toMatchObject({
      jefatura: 'Jefatura', supervisor: 'Supervisor', rut: 'RUT', nombre: 'Nombre', apellidoP: 'Apellido P.', apellidoM: 'Apellido M.', estado: 'Estado',
      correoEmpresa: 'Correo Empresa', cargo: 'Cargo', comuna: 'Comuna', marca: 'Marca', modelo: 'Modelo', numeroSerie: 'N° Serie', nombreEquipo: 'Nombre Equipo',
      procesador: 'Procesador', discoDuro: 'Disco Duro', ram: 'RAM', sistemaOperativo: 'O.S.', microsoft365: 'Microsoft 365 Empresa', condicion: 'Condición',
      fechaEntrega: 'Fecha de entrega', historialAsignaciones: 'Historial de asignaciónes', mantencion: 'Mantencion', proximaMantencion: 'Proxima Mantencion',
      antivirus: 'Antivirus', sede: 'Sede',
    });
    expect(m.correoPersonal).toBeUndefined();
  });

  test('el Excel normalizado de celulares: "Estado equipo" es el estado y "Nombres" el nombre, sin mezclar columnas', () => {
    const m = mapeoSugerido(['IMEI', 'Marca', 'Modelo', 'N° serie', 'Condición', 'Estado equipo', 'Motivo baja', 'RUT', 'Nombres', 'Apellido P.', 'Fecha entrega', 'N° teléfono', 'Sede', 'Correo empresa', 'Observaciones']);
    expect(m).toMatchObject({ imei: 'IMEI', numeroSerie: 'N° serie', estado: 'Estado equipo', nombre: 'Nombres', apellidoP: 'Apellido P.', fechaEntrega: 'Fecha entrega', correoEmpresa: 'Correo empresa', observaciones: 'Observaciones' });
    // Una columna no se usa para dos campos (la "Fecha entrega" no es también la "Entrega" del celular).
    const usadas = Object.values(m);
    expect(new Set(usadas).size).toBe(usadas.length);
  });

  test('"S/N" (impresoras) y los nombres genéricos de correo', () => {
    expect(mapeoSugerido(['Marca', 'Modelo', 'S/N', 'Ubicación'])).toMatchObject({ numeroSerie: 'S/N' });
    // "correo" solo, exacto, es el personal; "Correo electrónico de la empresa" no se toma por contener "correo".
    expect(mapeoSugerido(['correo']).correoPersonal).toBe('correo');
    expect(mapeoSugerido(['Correo electrónico']).correoPersonal).toBeUndefined();
  });

  test('qué aplica a cada categoría: el IMEI es del celular, la serie del resto, las pulgadas del monitor', () => {
    const clavesDe = (f: string) => camposDeFicha(f).map((c) => c.key);
    expect(clavesDe('celular')).toContain('imei');
    expect(clavesDe('computador')).not.toContain('imei');
    expect(clavesDe('monitor')).toContain('pulgadas');
    expect(clavesDe('periferico')).not.toContain('pulgadas');
    expect(clavesDe('generico')).toEqual(expect.arrayContaining(['numeroSerie', 'marca', 'modelo', 'rut', 'cargo', 'comuna']));
    const obligatorios = (f: string) => camposDeFicha(f).filter((c) => esObligatorio(c, f)).map((c) => c.key).sort();
    expect(obligatorios('celular')).toEqual(['imei', 'marca', 'modelo']);
    expect(obligatorios('monitor')).toEqual(['marca', 'modelo', 'numeroSerie']);
  });
});
