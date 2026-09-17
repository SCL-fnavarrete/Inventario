#!/usr/bin/env node
/**
 * Pruebas de aislamiento por sede (18-sep-2026, SPEC 2.29.1 / 2.29.2).
 *
 * Verifica que un usuario tecnico NO pueda ver ni tocar datos de otra sede,
 * por ninguna via: listados, fichas por URL, API directa, exportaciones,
 * escrituras con el id en el cuerpo, y endpoints agregados.
 *
 * Por que un script y no clicks: que la interfaz no muestre un dato no prueba
 * nada -- puede estar filtrando en el navegador. Esto golpea la API con la
 * sesion real del tecnico, que es la unica prueba valida.
 *
 * USO (con el servidor de desarrollo corriendo):
 *
 *   set ADMIN_EMAIL=admin@...&& set ADMIN_PASS=...&& ^
 *   set TECNICO_EMAIL=tecnico.ccp@...&& set TECNICO_PASS=...&& ^
 *   node scripts/probar-aislamiento-sede.mjs
 *
 * En PowerShell:
 *   $env:ADMIN_EMAIL="..."; $env:ADMIN_PASS="..."; $env:TECNICO_EMAIL="...";
 *   $env:TECNICO_PASS="..."; node scripts/probar-aislamiento-sede.mjs
 *
 * El admin se usa solo para descubrir que registros existen en otras sedes
 * (el script arma su propia lista de objetivos, no hay que pegar UUIDs a mano).
 * Las contrasenas se leen del entorno y no se imprimen nunca.
 *
 * Por defecto NO escribe nada: solo intenta escrituras que DEBEN fallar. Con
 * --con-escrituras agrega la prueba de crear un activo mandando la sede de
 * otra sede a proposito, que si crea un registro (y avisa cual, para borrarlo).
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CON_ESCRITURAS = process.argv.includes('--con-escrituras');

const resultados = [];
function registrar(area, prueba, ok, detalle) {
  resultados.push({ area, prueba, ok, detalle });
  const marca = ok === true ? 'OK  ' : ok === false ? 'FALLA' : 'AVISO';
  console.log(`  ${marca}  ${prueba}${detalle ? ` -- ${detalle}` : ''}`);
}

// ---------------------------------------------------------------- sesiones
/** Cliente con su propio frasco de cookies, para sostener la sesion. */
function crearCliente() {
  const cookies = new Map();
  function guardarCookies(res) {
    const crudas = res.headers.getSetCookie?.() || [];
    for (const c of crudas) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }
  const cabecera = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

  return {
    async fetch(ruta, opciones = {}) {
      const res = await fetch(`${BASE}${ruta}`, {
        ...opciones,
        redirect: 'manual',
        headers: { ...(opciones.headers || {}), cookie: cabecera() },
      });
      guardarCookies(res);
      return res;
    },
    async json(ruta) {
      const res = await this.fetch(ruta);
      let cuerpo = null;
      try { cuerpo = await res.json(); } catch { /* no era json */ }
      return { status: res.status, cuerpo };
    },
    tieneSesion: () => [...cookies.keys()].some((k) => k.includes('session-token')),
  };
}

async function iniciarSesion(email, password, etiqueta) {
  const cliente = crearCliente();
  const { cuerpo: csrf } = await cliente.json('/api/auth/csrf');
  if (!csrf?.csrfToken) throw new Error(`${etiqueta}: no se pudo obtener el csrfToken`);

  await cliente.fetch('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/`,
      json: 'true',
    }).toString(),
  });

  const { cuerpo: sesion } = await cliente.json('/api/auth/session');
  if (!sesion?.user) throw new Error(`${etiqueta}: credenciales rechazadas`);
  cliente.usuario = sesion.user;
  return cliente;
}

// ------------------------------------------------------------------ ayudas
const esVacio = (d) => !d || (Array.isArray(d) ? d.length === 0 : (d.data || []).length === 0);
const filas = (d) => (Array.isArray(d) ? d : d?.data || []);

/** Busca en un JSON cualquier rastro de una cadena (serie, RUT, nombre). */
function contiene(objeto, aguja) {
  return JSON.stringify(objeto ?? '').toLowerCase().includes(String(aguja).toLowerCase());
}

// ------------------------------------------------------------------- main
async function main() {
  const faltan = ['ADMIN_EMAIL', 'ADMIN_PASS', 'TECNICO_EMAIL', 'TECNICO_PASS']
    .filter((v) => !process.env[v]);
  if (faltan.length) {
    console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
    process.exit(2);
  }

  console.log(`\nServidor: ${BASE}`);
  const admin = await iniciarSesion(process.env.ADMIN_EMAIL, process.env.ADMIN_PASS, 'admin');
  const tec = await iniciarSesion(process.env.TECNICO_EMAIL, process.env.TECNICO_PASS, 'tecnico');
  console.log(`Admin:   ${admin.usuario.email} (rol ${admin.usuario.role})`);
  console.log(`Tecnico: ${tec.usuario.email} (rol ${tec.usuario.role}, sede ${tec.usuario.sedeId || 'SIN SEDE'})\n`);

  if (admin.usuario.role !== 'admin') throw new Error('El usuario "admin" no tiene rol admin');
  if (tec.usuario.role === 'admin') throw new Error('El usuario "tecnico" es admin: la prueba no tiene sentido');
  if (!tec.usuario.sedeId) {
    console.error('El tecnico no tiene sede asignada. Asignale una en Configuracion > Usuarios.');
    process.exit(2);
  }
  const sedeTecnico = tec.usuario.sedeId;

  // --- reconocimiento con el admin: que hay en OTRAS sedes
  console.log('Reconocimiento (como admin)');
  const { cuerpo: sedes } = await admin.json('/api/sedes');
  const otrasSedes = filas(sedes).filter((s) => s.id !== sedeTecnico);
  registrar('prep', `sedes ajenas detectadas: ${otrasSedes.map((s) => s.nombre).join(', ') || 'ninguna'}`,
    otrasSedes.length > 0 ? true : null,
    otrasSedes.length ? '' : 'sin datos de otras sedes no se puede probar nada');
  if (!otrasSedes.length) process.exit(2);

  const ajena = otrasSedes[0];
  const objetivos = {};
  const buscarAjeno = async (ruta, campoSede = 'sedeId') => {
    const { cuerpo } = await admin.json(ruta);
    return filas(cuerpo).find((r) => r[campoSede] && r[campoSede] !== sedeTecnico) || null;
  };

  objetivos.activo = await buscarAjeno('/api/activos?limit=200');
  objetivos.empleado = await buscarAjeno('/api/empleados?limit=200');
  objetivos.compra = await buscarAjeno('/api/compras?limit=100');
  objetivos.solicitud = await buscarAjeno('/api/solicitudes?limit=100');
  const { cuerpo: mants } = await admin.json('/api/mantenciones?limit=100');
  objetivos.mantencion = filas(mants).find((m) => m.asset?.sedeId && m.asset.sedeId !== sedeTecnico) || null;

  for (const [k, v] of Object.entries(objetivos)) {
    registrar('prep', `objetivo ${k}`, v ? true : null,
      v ? `id ${v.id}` : 'no hay ninguno en otra sede; crea datos de prueba');
  }

  // ------------------------------------------------ A. listados y filtros
  console.log('\nA. Listados (como tecnico): solo su sede');
  const listados = [
    ['activos', '/api/activos?limit=500', (r) => r.sedeId],
    ['empleados', '/api/empleados?limit=500', (r) => r.sedeId],
    ['compras', '/api/compras?limit=200', (r) => r.sede?.id ?? r.sedeId],
    ['solicitudes', '/api/solicitudes?limit=200', (r) => r.sedeId],
    ['kit-items', '/api/kit-items', (r) => r.sedeId],
    ['mantenciones', '/api/mantenciones?limit=200', (r) => r.asset?.sedeId],
    ['asignaciones', '/api/asignaciones?limit=200', (r) => r.asset?.sedeId],
  ];
  for (const [nombre, ruta, sacarSede] of listados) {
    const { status, cuerpo } = await tec.json(ruta);
    const intrusas = filas(cuerpo).filter((r) => {
      const s = sacarSede(r);
      return s && s !== sedeTecnico;
    });
    registrar('A', `${nombre}`, status === 200 && intrusas.length === 0,
      intrusas.length ? `${intrusas.length} registro(s) de otra sede` : `status ${status}, ${filas(cuerpo).length} filas`);
  }

  // guias: caso especial, se ven las de origen Y las de destino
  {
    const { cuerpo } = await tec.json('/api/guias-despacho?limit=200');
    const intrusas = filas(cuerpo).filter(
      (g) => g.sede?.id !== sedeTecnico && g.sedeDestino?.id !== sedeTecnico
    );
    registrar('A', 'guias-despacho (origen o destino)', intrusas.length === 0,
      intrusas.length ? `${intrusas.length} guia(s) sin relacion con su sede` : 'correcto');
  }

  // intento de forzar la sede por query param
  console.log('\nA2. Intento de forzar ?sedeId= de otra sede');
  for (const ruta of ['/api/activos', '/api/empleados', '/api/kit-items', '/api/compras']) {
    const { cuerpo } = await tec.json(`${ruta}?sedeId=${ajena.id}&limit=200`);
    const intrusas = filas(cuerpo).filter((r) => {
      const s = r.sedeId ?? r.sede?.id;
      return s && s !== sedeTecnico;
    });
    registrar('A2', `${ruta}?sedeId=${ajena.nombre}`, intrusas.length === 0,
      intrusas.length ? `devolvio ${intrusas.length} de otra sede` : 'parametro ignorado, correcto');
  }

  // ------------------------------------------- B/C. fichas y API directa
  console.log('\nB/C. Fichas de otra sede por URL y por API (se espera 404)');
  const detalles = [
    ['activo (API)', objetivos.activo && `/api/activos/${objetivos.activo.id}`],
    ['activo (pagina)', objetivos.activo && `/activos/${objetivos.activo.id}`],
    ['empleado ficha por UUID', objetivos.empleado && `/api/empleados/${objetivos.empleado.id}/ficha`],
    ['empleado ficha por RUT', objetivos.empleado?.rut && `/api/empleados/${encodeURIComponent(objetivos.empleado.rut)}/ficha`],
    ['empleado (API)', objetivos.empleado && `/api/empleados/${objetivos.empleado.id}`],
    ['compra (API)', objetivos.compra && `/api/compras/${objetivos.compra.id}`],
    ['solicitud (API)', objetivos.solicitud && `/api/solicitudes/${objetivos.solicitud.id}`],
    ['mantencion (API)', objetivos.mantencion && `/api/mantenciones/${objetivos.mantencion.id}`],
  ];
  for (const [nombre, ruta] of detalles) {
    if (!ruta) { registrar('B/C', nombre, null, 'sin objetivo'); continue; }
    const res = await tec.fetch(ruta);
    const texto = await res.text();
    const bloqueado = res.status === 404 || res.status === 403;
    // Una pagina puede responder 200 con el HTML de "no encontrado".
    const pareceNoEncontrado = /no encontrad|not found/i.test(texto);
    registrar('B/C', nombre, bloqueado || pareceNoEncontrado, `status ${res.status}`);
  }

  // ------------------------------------------------ D. reportes y Excel
  console.log('\nD. Reportes y exportaciones (se busca dentro el dato ajeno)');
  const aguja = objetivos.activo?.numeroSerie || objetivos.activo?.modelo;
  const exportaciones = [
    '/api/reportes/inventario/excel',
    '/api/reportes/empleados/excel',
    '/api/reportes/obsoletos/excel',
    '/api/reportes/stock/excel',
    '/api/reportes/rrhh/excel',
    '/api/activos/exportar',
    '/api/reportes/trazabilidad',
  ];
  for (const ruta of exportaciones) {
    const res = await tec.fetch(ruta);
    const buf = Buffer.from(await res.arrayBuffer());
    // Un .xlsx es un zip: el texto plano no siempre revela la serie, pero
    // suele aparecer en sharedStrings sin comprimir bien. Se avisa si no
    // se puede afirmar nada.
    const texto = buf.toString('latin1');
    const fuga = aguja && texto.includes(aguja);
    registrar('D', ruta, fuga ? false : (res.status === 200 ? true : null),
      fuga ? `contiene "${aguja}" (dato de ${ajena.nombre})` : `status ${res.status}, ${buf.length} bytes`);
  }

  // ------------------------------- E. escrituras con id ajeno en el cuerpo
  console.log('\nE. Escrituras referenciando recursos de otra sede (deben fallar)');
  if (objetivos.activo) {
    const { cuerpo: tipos } = await tec.json('/api/mantenciones/tipos?activo=true');
    const tipoId = filas(tipos)[0]?.id;
    if (tipoId) {
      const res = await tec.fetch('/api/mantenciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: objetivos.activo.id, tipoId, descripcion: 'PRUEBA AISLAMIENTO',
          fechaProgramada: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }),
      });
      registrar('E', 'mantencion sobre activo ajeno', res.status >= 400, `status ${res.status}`);
    }

    const res2 = await tec.fetch('/api/compras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numeroFactura: `PRUEBA-${Date.now()}`, fechaFactura: new Date().toISOString().slice(0, 10),
        sedeId: ajena.id, assets: [{ assetId: objetivos.activo.id }] }),
    });
    registrar('E', 'compra vinculando activo ajeno', res2.status >= 400, `status ${res2.status}`);
  }

  if (CON_ESCRITURAS) {
    const { cuerpo: cats } = await tec.json('/api/categorias');
    const categoriaId = filas(cats)[0]?.id;
    const serie = `PRUEBA-AISL-${Date.now()}`;
    const res = await tec.fetch('/api/activos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoriaId, marca: 'PRUEBA', modelo: 'AISLAMIENTO', numeroSerie: serie,
        estado: 'disponible', condicion: 'nuevo', sedeId: ajena.id }),
    });
    const creado = res.status < 400 ? await res.json() : null;
    registrar('E', 'crear activo mandando sede ajena',
      creado ? creado.sedeId === sedeTecnico : null,
      creado ? `quedo en ${creado.sedeId === sedeTecnico ? 'SU sede (correcto)' : 'la sede ajena (FUGA)'} -- borra el activo ${serie}` : `status ${res.status}`);
  }

  // ------------------------------------------- F. agregados y estadisticas
  console.log('\nF. Endpoints agregados (los que nadie consume pero responden)');
  const agregados = [
    ['/api/dashboard/stats', 'sin filtro de sede en el codigo'],
    ['/api/dashboard/alertas', 'sin filtro de sede en el codigo'],
    ['/api/reportes/compras', 'sin filtro de sede en el codigo'],
    ['/api/activos/stats', ''],
    ['/api/solicitudes/stats', ''],
    ['/api/mantenciones/pendientes', ''],
  ];
  for (const [ruta, nota] of agregados) {
    const { status, cuerpo } = await tec.json(ruta);
    const fuga = aguja ? contiene(cuerpo, aguja) : null;
    registrar('F', ruta, status === 403 ? true : (fuga === true ? false : null),
      `status ${status}${fuga === true ? ` -- menciona "${aguja}"` : ''}${nota ? ` (${nota})` : ''}`
      + (fuga === null ? ' -- revisar totales a mano' : ''));
  }

  // -------------------------------------------------------- G. resumen
  const fallas = resultados.filter((r) => r.ok === false);
  const avisos = resultados.filter((r) => r.ok === null);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Pruebas: ${resultados.length} | OK: ${resultados.filter((r) => r.ok === true).length} | FALLAS: ${fallas.length} | por revisar: ${avisos.length}`);
  if (fallas.length) {
    console.log('\nFALLAS (fuga de datos entre sedes):');
    for (const f of fallas) console.log(`  - [${f.area}] ${f.prueba}: ${f.detalle}`);
  }
  console.log(`${'='.repeat(70)}\n`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nError: ${e.message}\n`);
  process.exit(2);
});
