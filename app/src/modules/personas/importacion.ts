import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { auditLogService } from '@/shared/auditoria';
import { buscarPersona, type ConsultaPersona, type PersonaIndexada } from '@/modules/personas/coincidencia';

/**
 * Personas que traen las importaciones (SPEC 2.133). Una sola regla para
 * Activos (notebooks, celulares y su historial) y Lineas: la fila trae a una
 * persona, se busca (por RUT o por nombre) y, si no existe, se crea. Una
 * importacion nunca cambia el estado de una persona que ya existe: activar y
 * desvincular sigue siendo por solicitud; solo se completan sus datos vacios.
 */

type Tx = Prisma.TransactionClient;

export type DatosPersonaImportada = ConsultaPersona & {
  correoEmpresa?: string | null;
  correoPersonal?: string | null;
  cargo?: string | null;
  jefatura?: string | null;
  supervisor?: string | null;
  ubicacion?: string | null;
  sedeId?: string | null;
  /** Estado con que se crea si no existe: una persona que ya se fue (sin nada asignado) entra desvinculada. */
  estado: 'activo' | 'desvinculado';
};

export type ResultadoPersona =
  | { tipo: 'existente'; persona: PersonaIndexada; por: 'rut' | 'nombre'; completados: string[] }
  | { tipo: 'creada'; persona: PersonaIndexada; avisos: string[] }
  | { tipo: 'ambigua'; candidatas: PersonaIndexada[] }
  | { tipo: 'duplicado'; persona: PersonaIndexada }
  /** No hay con que crearla: falta el nombre o el apellido paterno. */
  | { tipo: 'sin_datos' };

const CAMPOS_INDICE = {
  id: true,
  rut: true,
  nombres: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  estado: true,
  correoEmpresa: true,
  correoPersonal: true,
  cargo: true,
  jefatura: true,
  supervisor: true,
  ubicacion: true,
  sedeId: true,
} satisfies Prisma.EmployeeSelect;

/** Todas las personas, una vez por importacion o tanda: se busca en memoria (`buscarPersona`). */
export function cargarIndicePersonas(db: Pick<Tx, 'employee'> = prisma): Promise<PersonaIndexada[]> {
  return db.employee.findMany({ select: CAMPOS_INDICE });
}

/** Deja la persona en el indice (nueva, o con sus datos completados) para las filas que siguen. */
export function actualizarIndice(indice: PersonaIndexada[], persona: PersonaIndexada) {
  const i = indice.findIndex((p) => p.id === persona.id);
  if (i >= 0) indice[i] = persona;
  else indice.push(persona);
}

const limpio = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim() || null;

/** El correo si nadie mas lo usa (son unicos); si esta tomado, queda vacio en vez de fallar la fila. */
async function correoLibre(tx: Tx, campo: 'correoEmpresa' | 'correoPersonal', valor: string | null, salvo?: string) {
  if (!valor) return null;
  const otro = await tx.employee.findFirst({
    where: { [campo]: { equals: valor, mode: 'insensitive' }, ...(salvo ? { NOT: { id: salvo } } : {}) },
    select: { id: true },
  });
  return otro ? null : valor;
}

/**
 * Busca a la persona de la fila y, si no existe, la crea. Escribe dentro de `tx`
 * pero NO toca el indice: el que llama lo actualiza (`actualizarIndice`) cuando la
 * transaccion termina bien, para que una fila revertida no deje una persona fantasma.
 */
export async function encontrarOCrearPersona(
  tx: Tx,
  indice: PersonaIndexada[],
  datos: DatosPersonaImportada,
  usuario?: string | null
): Promise<ResultadoPersona> {
  const busqueda = buscarPersona(indice, datos);
  if (busqueda.tipo === 'ambigua') return busqueda;
  if (busqueda.tipo === 'duplicado') return busqueda;
  if (busqueda.tipo === 'encontrada') return completarVacios(tx, busqueda.persona, busqueda.por, datos, usuario);

  const nombres = limpio(datos.nombres);
  const apellidoPaterno = limpio(datos.apellidoPaterno);
  if (!nombres || !apellidoPaterno) return { tipo: 'sin_datos' };

  const avisos: string[] = [];
  const correoEmpresa = await correoLibre(tx, 'correoEmpresa', limpio(datos.correoEmpresa));
  const correoPersonal = await correoLibre(tx, 'correoPersonal', limpio(datos.correoPersonal));
  if (limpio(datos.correoEmpresa) && !correoEmpresa) avisos.push('El correo de empresa ya lo usa otra persona: quedó vacío');
  if (limpio(datos.correoPersonal) && !correoPersonal) avisos.push('El correo personal ya lo usa otra persona: quedó vacío');
  if (!limpio(datos.rut)) avisos.push('Sin RUT: completarlo en Personal');

  const creada = await tx.employee.create({
    data: {
      rut: limpio(datos.rut),
      nombres,
      apellidoPaterno,
      apellidoMaterno: limpio(datos.apellidoMaterno),
      // Sin correo queda vacio: no se inventa uno (SPEC 2.133).
      correoEmpresa,
      correoPersonal,
      cargo: limpio(datos.cargo),
      jefatura: limpio(datos.jefatura),
      supervisor: limpio(datos.supervisor),
      ubicacion: limpio(datos.ubicacion),
      // El Excel no dice si es contrato u honorarios: se elige al editar la persona.
      tipoContrato: null,
      estado: datos.estado,
      sedeId: datos.sedeId ?? null,
    },
    select: CAMPOS_INDICE,
  });
  await auditLogService.registrarCreacion(
    'empleado',
    creada.id,
    `Persona creada desde una importación (${datos.estado === 'activo' ? 'activa' : 'desvinculada'})`,
    { rut: creada.rut, nombres, apellidoPaterno, estado: datos.estado },
    usuario,
    tx
  );
  return { tipo: 'creada', persona: creada, avisos };
}

/** Datos que la persona no tiene y la fila si: se completan; lo que ya hay no se reemplaza. */
async function completarVacios(
  tx: Tx,
  persona: PersonaIndexada,
  por: 'rut' | 'nombre',
  datos: DatosPersonaImportada,
  usuario?: string | null
): Promise<ResultadoPersona> {
  const nuevos: Record<string, string> = {};
  const completados: string[] = [];
  /** Completa un campo vacio de la persona con el de la fila. */
  const completar = (campo: keyof PersonaIndexada, valor: string | null | undefined, etiqueta: string) => {
    const v = limpio(valor);
    if (!v || persona[campo]) return;
    nuevos[campo] = v;
    completados.push(etiqueta);
  };

  completar('rut', datos.rut, 'RUT');
  completar('cargo', datos.cargo, 'cargo');
  completar('jefatura', datos.jefatura, 'jefatura');
  completar('supervisor', datos.supervisor, 'supervisor');
  completar('ubicacion', datos.ubicacion, 'comuna');
  // Los correos son unicos: si otra persona ya lo usa, no se completa.
  for (const [campo, etiqueta] of [
    ['correoEmpresa', 'correo de empresa'],
    ['correoPersonal', 'correo personal'],
  ] as const) {
    const v = persona[campo] ? null : await correoLibre(tx, campo, limpio(datos[campo]), persona.id);
    if (v) {
      nuevos[campo] = v;
      completados.push(etiqueta);
    }
  }
  if (completados.length === 0) return { tipo: 'existente', persona, por, completados };

  const actualizada = await tx.employee.update({ where: { id: persona.id }, data: nuevos, select: CAMPOS_INDICE });
  await auditLogService.registrarActualizacion(
    'empleado',
    persona.id,
    `Datos completados desde una importación: ${completados.join(', ')}`,
    {},
    nuevos,
    usuario,
    tx
  );
  return { tipo: 'existente', persona: actualizada, por, completados };
}
