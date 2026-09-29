import { prisma } from '@/shared/prisma';
import { exigirSinErroresCampos } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import {
  CAMPOS_SEGURIDAD,
  ETIQUETAS_PARAMETROS,
  SEGURIDAD_POR_DEFECTO,
  validarParametros,
  type CampoSeguridad,
} from '@/modules/configuracion/validacionesParametros';

/**
 * Configuracion > Seguridad (SPEC 2.112), guardada como fila unica. Leerla
 * siempre devuelve algo (los valores por defecto si aun no se guardo) y
 * guardarla hace upsert sobre ese mismo id.
 */
const SINGLETON_ID = 'singleton';

/** Solo los campos de seguridad de una fila (sin id ni fechas). */
const valoresDe = (fila: Record<CampoSeguridad, number>) =>
  Object.fromEntries(CAMPOS_SEGURIDAD.map((c) => [c, fila[c]])) as Record<CampoSeguridad, number>;

export async function leerParametros() {
  return (
    (await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } })) ?? {
      id: SINGLETON_ID,
      ...SEGURIDAD_POR_DEFECTO,
      updatedAt: null,
      updatedPor: null,
    }
  );
}

/** Cada valor dentro de sus limites (mismas reglas que la pantalla); siempre queda en Auditoria. */
export async function guardarParametros(body: Record<string, unknown>, usuario: string | null | undefined) {
  exigirSinErroresCampos(validarParametros(body), ETIQUETAS_PARAMETROS);
  const anterior = await prisma.systemConfig.findUnique({ where: { id: SINGLETON_ID } });
  const base = anterior ?? SEGURIDAD_POR_DEFECTO;
  const datos = {
    ...Object.fromEntries(CAMPOS_SEGURIDAD.map((c) => [c, body[c] ?? base[c]])),
    updatedPor: usuario,
  } as Record<CampoSeguridad, number> & { updatedPor?: string | null };

  const config = await prisma.systemConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...datos },
    update: datos,
  });
  await auditLogService.registrarActualizacion(
    'configuracion',
    SINGLETON_ID,
    'Seguridad del sistema actualizada',
    valoresDe(base),
    valoresDe(config),
    usuario
  );
  return config;
}
