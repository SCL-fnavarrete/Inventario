import { ACTIVOS_VIGENTES } from '@/modules/activos';

/**
 * Lo que tiene cada sede, para avisar antes de desactivarla (Configuracion >
 * Sedes): tecnicos activos (no podran entrar) y equipos vigentes.
 */
export const USO_SEDE = {
  _count: {
    select: {
      usuarios: { where: { activo: true } },
      assets: { where: ACTIVOS_VIGENTES },
    },
  },
} as const;
