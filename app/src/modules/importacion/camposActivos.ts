import { ESTADOS_RECONOCIDOS } from '@/modules/importacion/reglasFila';

/**
 * Campos que entiende la importacion de equipos (SPEC 2.133). Es la unica lista:
 * la usan el paso "Columnas" (que select mostrar), el detector de columnas, la
 * guia "como debe ir el Excel" y la plantilla descargable, asi que lo que la guia
 * dice es exactamente lo que el importador reconoce.
 */

export type Ficha = 'computador' | 'celular' | 'monitor' | 'periferico' | 'generico';
export type GrupoCampo = 'equipo' | 'persona' | 'extra';

export interface CampoActivo {
  key: string;
  etiqueta: string;
  grupo: GrupoCampo;
  /** Fichas (campos que pide cada categoria) donde aplica; sin esto, todas. */
  fichas?: Ficha[];
  /** Fichas donde la columna es obligatoria. */
  obligatorioEn?: Ficha[];
  descripcion: string;
  /** Encabezado recomendado: la deteccion lo reconoce por su nombre exacto. */
  columna: string;
  ejemplo: string;
  /** Otros nombres de columna que tambien se reconocen. */
  alias: string[];
}

const TODAS: Ficha[] = ['computador', 'celular', 'monitor', 'periferico', 'generico'];
const CON_SERIE: Ficha[] = ['computador', 'monitor', 'periferico', 'generico'];

export const CAMPOS_ACTIVO: CampoActivo[] = [
  // ---- Lo que identifica al equipo (SPEC 2.112.7: el IMEI en celulares, el N° de serie en los demas)
  { key: 'numeroSerie', etiqueta: 'N° Serie', grupo: 'equipo', obligatorioEn: CON_SERIE, columna: 'N° Serie', ejemplo: '5CD236CFJ1', alias: ['nº serie', 'serie', 'numero serie', 'n serie', 'no serie', 's/n'],
    descripcion: 'Número de serie único del equipo (etiqueta o grabado en el equipo). No se puede repetir. En celulares es opcional: los identifica el IMEI.' },
  { key: 'imei', etiqueta: 'IMEI', grupo: 'equipo', fichas: ['celular'], obligatorioEn: ['celular'], columna: 'IMEI', ejemplo: '356938035643809', alias: [],
    descripcion: 'IMEI del celular: 15 dígitos válidos (con su dígito verificador) y único. Es lo que identifica al celular.' },
  { key: 'marca', etiqueta: 'Marca', grupo: 'equipo', obligatorioEn: TODAS, columna: 'Marca', ejemplo: 'Dell', alias: [],
    descripcion: 'Fabricante del equipo. Tiene que estar en el catálogo (Activos › Catálogos › Marcas); una que no esté se rechaza o se agrega en la revisión.' },
  { key: 'modelo', etiqueta: 'Modelo', grupo: 'equipo', obligatorioEn: TODAS, columna: 'Modelo', ejemplo: 'Latitude 5420', alias: [],
    descripcion: 'Modelo específico del equipo (ej: Inspiron 15 3501).' },

  // ---- La persona que tiene el equipo: si no existe, se crea
  { key: 'rut', etiqueta: 'RUT', grupo: 'persona', columna: 'RUT', ejemplo: '12.345.678-9', alias: [],
    descripcion: 'RUT de la persona que tiene el equipo, con o sin puntos ni guion. Si no existe en el sistema se crea; si ya existe, se usa y no cambia de estado. Sin RUT se busca por nombre y apellidos.' },
  { key: 'nombre', etiqueta: 'Nombre', grupo: 'persona', columna: 'Nombre', ejemplo: 'Ana María', alias: ['nombres'],
    descripcion: 'Nombre(s) de la persona. Obligatorio para crearla si no existe.' },
  { key: 'apellidoP', etiqueta: 'Apellido P.', grupo: 'persona', columna: 'Apellido P.', ejemplo: 'Pérez', alias: ['apellido p', 'apellido paterno'],
    descripcion: 'Apellido paterno de la persona. Obligatorio para crearla si no existe.' },
  { key: 'apellidoM', etiqueta: 'Apellido M.', grupo: 'persona', columna: 'Apellido M.', ejemplo: 'Soto', alias: ['apellido m', 'apellido materno'],
    descripcion: 'Apellido materno (opcional).' },
  { key: 'correoEmpresa', etiqueta: 'Correo Empresa', grupo: 'persona', columna: 'Correo empresa', ejemplo: 'aperez@empresa.com', alias: ['correo de la empresa', 'correo corporativo', 'mail empresa'],
    descripcion: 'Correo corporativo. Si falta, queda vacío (no se inventa) y se completa después en Personal.' },
  { key: 'correoPersonal', etiqueta: 'Correo Personal', grupo: 'persona', columna: 'Correo personal', ejemplo: 'ana@correo.com', alias: ['mail personal', 'correo', 'email', 'mail'],
    descripcion: 'Correo personal (opcional). Si otra persona ya lo usa, queda vacío.' },
  { key: 'cargo', etiqueta: 'Cargo', grupo: 'persona', columna: 'Cargo', ejemplo: 'Analista de Soporte', alias: ['puesto'],
    descripcion: 'Cargo o puesto de la persona.' },
  { key: 'jefatura', etiqueta: 'Jefatura', grupo: 'persona', columna: 'Jefatura', ejemplo: 'Cristian Ormeño', alias: [],
    descripcion: 'Jefatura o gerencia a la que pertenece la persona.' },
  { key: 'supervisor', etiqueta: 'Supervisor', grupo: 'persona', columna: 'Supervisor', ejemplo: 'Benjamín Astudillo', alias: [],
    descripcion: 'Supervisor directo de la persona.' },
  { key: 'comuna', etiqueta: 'Comuna', grupo: 'persona', columna: 'Comuna', ejemplo: 'Ñuñoa', alias: ['ciudad'],
    descripcion: 'Comuna o lugar donde está el equipo y la persona (informativo; no define la sede).' },

  // ---- Datos del equipo comunes a todas las categorias
  { key: 'sede', etiqueta: 'Sede', grupo: 'extra', columna: 'Sede', ejemplo: 'Santiago', alias: [],
    descripcion: 'Sede del equipo: nombre o código de una sede existente (ej: Santiago, Concepción, Perú). Vacía: el equipo queda sin sede y se asigna después en Editar. Si eliges una sede en el paso 1, todas las filas quedan en ella.' },
  { key: 'estado', etiqueta: 'Estado', grupo: 'extra', columna: 'Estado', ejemplo: 'Asignado', alias: [],
    descripcion: `Estado del equipo: ${ESTADOS_RECONOCIDOS.map((e) => e.replace('ncion', 'nción')).join(', ')}. También se entienden Activo, En uso, Entregado, En bodega, Sin asignar y Dado de baja. Sin estado, queda Asignado si la fila trae persona y Disponible si no.` },
  { key: 'condicion', etiqueta: 'Condición (Nuevo/Usado)', grupo: 'extra', columna: 'Condición', ejemplo: 'Nuevo', alias: ['condicion'],
    descripcion: 'Condición física: Nuevo, Usado, Seminuevo o Dañado.' },
  { key: 'observaciones', etiqueta: 'Observaciones', grupo: 'extra', columna: 'Observaciones', ejemplo: 'Cargador original', alias: ['obs.', 'observacion', 'comentario', 'comentarios'],
    descripcion: 'Notas del equipo.' },
  { key: 'fechaEntrega', etiqueta: 'Fecha de entrega', grupo: 'extra', columna: 'Fecha de entrega', ejemplo: '15-02-2024', alias: ['fecha entrega'],
    descripcion: 'Fecha en que se entregó el equipo a la persona (dd-mm-aaaa o fecha de Excel). Sin ella, la entrega queda con fecha desconocida.' },
  { key: 'fechaCompra', etiqueta: 'Fecha de compra', grupo: 'extra', columna: 'Fecha de compra', ejemplo: '10-01-2024', alias: ['fecha compra', 'fecha factura'],
    descripcion: 'Fecha de compra o factura (dd-mm-aaaa).' },
  { key: 'valor', etiqueta: 'Valor (CLP)', grupo: 'extra', columna: 'Valor', ejemplo: '850000', alias: ['valor (clp)', 'precio', 'costo', 'valor clp'],
    descripcion: 'Valor del equipo en pesos chilenos, sin decimales (ej: 850000 o 850.000).' },

  // ---- Notebook
  { key: 'nombreEquipo', etiqueta: 'Nombre Equipo', grupo: 'extra', fichas: ['computador'], columna: 'Nombre Equipo', ejemplo: 'SCL-APEREZ', alias: [],
    descripcion: 'Nombre o identificador interno del equipo.' },
  { key: 'historialAsignaciones', etiqueta: 'Historial de asignaciones', grupo: 'extra', fichas: ['computador'], columna: 'Historial de asignaciones', ejemplo: '1+', alias: ['historial de asignaciónes', 'historial asignaciones'],
    descripcion: 'Cuántas veces se asignó antes (dato histórico, sin nombres: 1, 2, 1+). Queda como nota en el historial del equipo.' },
  { key: 'procesador', etiqueta: 'Procesador', grupo: 'extra', fichas: ['computador'], columna: 'Procesador', ejemplo: 'Intel Core i5-1235U', alias: ['cpu'],
    descripcion: 'Modelo del procesador.' },
  { key: 'discoDuro', etiqueta: 'Disco Duro', grupo: 'extra', fichas: ['computador'], columna: 'Disco Duro', ejemplo: '512 GB', alias: ['disco'],
    descripcion: 'Capacidad y tipo de disco.' },
  { key: 'ram', etiqueta: 'RAM', grupo: 'extra', fichas: ['computador'], columna: 'RAM', ejemplo: '16 GB', alias: ['memoria'],
    descripcion: 'Memoria RAM.' },
  { key: 'sistemaOperativo', etiqueta: 'O.S.', grupo: 'extra', fichas: ['computador'], columna: 'O.S.', ejemplo: 'Windows 11 Business', alias: ['os', 'sistema operativo'],
    descripcion: 'Sistema operativo (se agrega al catálogo si es nuevo).' },
  { key: 'microsoft365', etiqueta: 'Microsoft 365 Empresa', grupo: 'extra', fichas: ['computador'], columna: 'Microsoft 365 Empresa', ejemplo: 'Premium', alias: ['microsoft 365', 'microsoft365', 'office 365', 'o365'],
    descripcion: 'Licencia Microsoft 365 asignada (ej: Premium), si tiene.' },
  { key: 'mantencion', etiqueta: 'Mantención', grupo: 'extra', fichas: ['computador'], columna: 'Mantención', ejemplo: '30-03-2025', alias: ['mantencion', 'fecha mantencion', 'fecha mantención'],
    descripcion: 'Fecha de la última mantención. Si ya pasó queda como completada en Mantenciones; si es futura, como pendiente.' },
  { key: 'proximaMantencion', etiqueta: 'Próxima Mantención', grupo: 'extra', fichas: ['computador'], columna: 'Próxima Mantención', ejemplo: '30-03-2026', alias: ['proxima mantencion', 'proxima mantención', 'próxima mantencion'],
    descripcion: 'Fecha programada de la próxima mantención.' },
  { key: 'antivirus', etiqueta: 'Antivirus', grupo: 'extra', fichas: ['computador'], columna: 'Antivirus', ejemplo: 'Defender', alias: ['anti-virus', 'antivirus instalado'],
    descripcion: 'Antivirus instalado (se agrega al catálogo si es nuevo).' },

  // ---- Monitor
  { key: 'pulgadas', etiqueta: 'Pulgadas', grupo: 'extra', fichas: ['monitor'], columna: 'Pulgadas', ejemplo: '27', alias: ['tamaño'],
    descripcion: 'Tamaño de la pantalla, en pulgadas.' },

  // ---- Celular
  { key: 'numeroActivacion', etiqueta: 'Nro Activación', grupo: 'extra', fichas: ['celular'], columna: 'Nro Activación', ejemplo: '123456', alias: ['nro activacion', 'numero activacion', 'activacion'],
    descripcion: 'Número de activación del plan del celular.' },
  { key: 'cargador', etiqueta: 'Cargador', grupo: 'extra', fichas: ['celular'], columna: 'Cargador', ejemplo: 'Sí', alias: [],
    descripcion: 'Si se entregó cargador junto con el celular.' },
  { key: 'lugarEntrega', etiqueta: 'Lugar Entrega', grupo: 'extra', fichas: ['celular'], columna: 'Lugar Entrega', ejemplo: 'Oficina Santiago', alias: ['lugar entrega', 'lugar'],
    descripcion: 'Lugar donde se entregó el celular.' },
  { key: 'entrega', etiqueta: 'Entrega', grupo: 'extra', fichas: ['celular'], columna: 'Entrega', ejemplo: '', alias: [],
    descripcion: 'Fecha o estado de entrega del celular.' },
  { key: 'tipoEquipo', etiqueta: 'Tipo', grupo: 'extra', fichas: ['celular'], columna: 'Tipo', ejemplo: '', alias: [],
    descripcion: 'Tipo específico de celular.' },
];

/** Nombres de columna que se reconocen aunque no tengan un select propio (campos de respaldo). */
const ALIAS_OCULTOS: Record<string, string[]> = { almacenamiento: ['almacenamiento', 'ssd', 'hdd'] };

/** Los campos que aplican a una ficha (sin ficha elegida, todos). */
export function camposDeFicha(ficha: string | null | undefined): CampoActivo[] {
  if (!ficha) return CAMPOS_ACTIVO;
  return CAMPOS_ACTIVO.filter((c) => !c.fichas || c.fichas.includes(ficha as Ficha));
}

/** ¿Es obligatoria esta columna para esa ficha? */
export const esObligatorio = (campo: CampoActivo, ficha: string | null | undefined) =>
  !!campo.obligatorioEn && (!ficha || campo.obligatorioEn.includes(ficha as Ficha));

const normalizar = (t: string) => t.toLowerCase().trim();
/** "correo", "email" y "mail" solos valen cuando la columna se llama exactamente asi. */
const GENERICOS = new Set(['correo', 'email', 'mail']);

/**
 * Propone a que columna del Excel corresponde cada campo. Primero busca la que
 * se llama igual y despues la que contiene el nombre, sin repetir columnas ni
 * tomar un nombre generico por contener "correo": asi "Correo Empresa" no se
 * toma tambien como correo personal.
 */
export function mapeoSugerido(encabezados: string[], campos: CampoActivo[] = CAMPOS_ACTIVO): Record<string, string> {
  const nombres = encabezados.map(normalizar);
  const usadas = new Set<number>();
  const mapeo: Record<string, string> = {};
  const alias = [
    ...campos.map((c) => [c.key, [normalizar(c.columna), normalizar(c.etiqueta), ...c.alias.map(normalizar)]] as const),
    ...Object.entries(ALIAS_OCULTOS),
  ];
  for (const [campo, nombresDelCampo] of alias) {
    const i = nombres.findIndex((h, k) => !usadas.has(k) && nombresDelCampo.includes(h));
    if (i !== -1) {
      mapeo[campo] = encabezados[i];
      usadas.add(i);
    }
  }
  for (const [campo, nombresDelCampo] of alias) {
    if (mapeo[campo]) continue;
    const i = nombres.findIndex((h, k) => !usadas.has(k) && nombresDelCampo.some((a) => !GENERICOS.has(a) && h.includes(a)));
    if (i !== -1) {
      mapeo[campo] = encabezados[i];
      usadas.add(i);
    }
  }
  return mapeo;
}
