import { prisma } from '@/lib/prisma';

/**
 * Asignaciones de un ticket (WorkflowRequest.assignmentIds), en el mismo
 * orden, con el activo y su categoria. Es la fuente de lo que se entrego,
 * devolvio o cambio EN ese ticket; employee.assignments, en cambio, es lo que
 * la persona tiene hoy. La usan el detalle de la solicitud y los documentos.
 */
export async function asignacionesDelTicket(assignmentIds: string[]) {
  if (assignmentIds.length === 0) return [];
  const filas = await prisma.assignment.findMany({
    where: { id: { in: assignmentIds } },
    include: { asset: { include: { categoria: true } } },
  });
  const porId = new Map(filas.map((a) => [a.id, a]));
  return assignmentIds.flatMap((id) => porId.get(id) ?? []);
}

/**
 * Pares de un cambio de equipo: assignmentIds guarda [viejo1, nuevo1, viejo2,
 * nuevo2, ...] (SPEC 2.84); un ticket de un solo par es [viejo, nuevo]. Se
 * arman por posicion y no por estadoDevolucion: el equipo nuevo tambien puede
 * devolverse despues y sigue siendo el "nuevo" de ese cambio.
 */
export function paresDeCambio<T extends { id: string }>(assignmentIds: string[], asignaciones: T[]) {
  const porId = new Map(asignaciones.map((a) => [a.id, a]));
  const pares: { anterior: T | null; nuevo: T | null }[] = [];
  for (let i = 0; i < assignmentIds.length; i += 2) {
    pares.push({
      anterior: porId.get(assignmentIds[i]) ?? null,
      nuevo: porId.get(assignmentIds[i + 1]) ?? null,
    });
  }
  return pares;
}

/**
 * Asignaciones de un ticket que se devolvieron en un ticket POSTERIOR: un
 * equipo "No devuelto" que la persona entrego despues (recuperacion, SPEC
 * 2.87). La asignacion guarda solo su ultimo estado, asi que sin esto el
 * ticket original lo mostraria como devuelto en buen estado, y su acta lo
 * listaria. Devuelve, por asignacion, el primer ticket posterior que la
 * incluye.
 */
export async function devueltasDespues(ticket: {
  id: string;
  createdAt: Date;
  assignmentIds: string[];
}) {
  const mapa = new Map<string, { id: string; numero: string }>();
  if (ticket.assignmentIds.length === 0) return mapa;
  const posteriores = await prisma.workflowRequest.findMany({
    where: {
      id: { not: ticket.id },
      createdAt: { gt: ticket.createdAt },
      assignmentIds: { hasSome: ticket.assignmentIds },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, numero: true, assignmentIds: true },
  });
  for (const p of posteriores) {
    for (const id of p.assignmentIds) {
      if (ticket.assignmentIds.includes(id) && !mapa.has(id)) {
        mapa.set(id, { id: p.id, numero: p.numero });
      }
    }
  }
  return mapa;
}

/**
 * Si la asignacion se devolvio EN este ticket: calificada (buen estado o
 * danada, no "No devuelto") y no recuperada despues en otro. Es lo que va en
 * el Acta de Devolucion (SPEC 2.87).
 */
export function devueltaEnTicket(
  a: { id: string; estadoDevolucion: string | null },
  recuperadas: Map<string, unknown>
): boolean {
  return !!a.estadoDevolucion && a.estadoDevolucion !== 'no_devuelto' && !recuperadas.has(a.id);
}

/**
 * Desvinculaciones de la lista que tienen Acta de Devolucion (algo devuelto
 * en el ticket). Una consulta para las asignaciones de todas y una por ticket
 * para las recuperaciones posteriores; la lista pagina de a pocos.
 */
export async function desvinculacionesConActa(
  tickets: { id: string; tipo: string; createdAt: Date; assignmentIds: string[] }[]
): Promise<Set<string>> {
  const desvinculaciones = tickets.filter((t) => t.tipo === 'offboarding');
  const ids = [...new Set(desvinculaciones.flatMap((t) => t.assignmentIds))];
  const porId = new Map(
    (
      await prisma.assignment.findMany({
        where: { id: { in: ids } },
        select: { id: true, estadoDevolucion: true },
      })
    ).map((a) => [a.id, a])
  );
  const conActa = new Set<string>();
  for (const t of desvinculaciones) {
    // Ticket antiguo sin assignmentIds: el acta usa su criterio anterior.
    if (t.assignmentIds.length === 0) {
      conActa.add(t.id);
      continue;
    }
    const recuperadas = await devueltasDespues(t);
    if (t.assignmentIds.some((id) => { const a = porId.get(id); return !!a && devueltaEnTicket(a, recuperadas); })) {
      conActa.add(t.id);
    }
  }
  return conActa;
}
