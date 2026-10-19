'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSedeSeleccionada } from '@/shared/ui/providers/SedeSeleccionadaProvider';
import Link from 'next/link';
import { Edit, Eye, ListChecks, Plus, PowerOff, Repeat, Trash2 } from 'lucide-react';
import { ActivosTabs } from '@/modules/activos/componentes';
import { PARAMS_FILTRO_LINEA, formatearNumero, tonoEstadoLinea } from '@/modules/lineas';
import { FiltrosLineas, useOpcionesFiltroLineas } from '@/modules/lineas/componentes/FiltrosLineas';
import { FormularioLinea } from '@/modules/lineas/componentes/FormularioLinea';
import { IndicadoresLineas } from '@/modules/lineas/componentes/IndicadoresLineas';
import {
  nombrePersona,
  personaDe,
  sedeDe,
  type LineaLista,
} from '@/modules/lineas/componentes/tipos';
import { parseApiError } from '@/shared/utilidades/apiErrors';
import { formatearFecha } from '@/shared/utilidades/fechas';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useEnvio } from '@/shared/hooks/useEnvio';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { buttonClasses } from '@/shared/ui/buttonStyles';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PageHeader } from '@/shared/ui/PageHeader';
import { TablaDatos } from '@/shared/ui/TablaDatos';
import { useToast } from '@/shared/ui/Toast';

/**
 * Activos > Lineas (SPEC 2.131): el panel de indicadores y la lista. Cada
 * linea se abre en su ficha (/activos/lineas/[id]), donde se reasigna y se ve
 * quien la ha tenido. Aqui se crea y se edita en un formulario sobre la lista.
 */

/** Quien tiene la linea: quien usa su celular o la persona guardada (telefono personal). */
function Tenedor({ l }: { l: LineaLista }) {
  const persona = personaDe(l);
  if (persona) {
    return (
      <>
        <Link href={`/empleados/${persona.id}`} className="text-brand hover:underline">
          {nombrePersona(persona)}
        </Link>
        {!l.activo && <span className="block text-xs text-fg-subtle">Teléfono personal</span>}
        {/* Se fue de la empresa y la linea sigue a su nombre: hay que recuperarla o darla de baja. */}
        {persona.estado === 'desvinculado' && (
          <span className="block text-xs text-red-700 dark:text-red-400">
            Persona desvinculada: revisar
          </span>
        )}
      </>
    );
  }
  return <span className="text-fg-subtle">Disponible</span>;
}

export function LineasView() {
  const toast = useToast();
  const permisos = usePermissions();
  const { ejecutar } = useEnvio();
  const { sedeSeleccionada } = useSedeSeleccionada();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const opciones = useOpcionesFiltroLineas();
  const [lineas, setLineas] = useState<LineaLista[]>([]);
  const [cargando, setCargando] = useState(true);
  // Los filtros viven en la URL: se mantienen al recargar y se pueden compartir.
  const valores = Object.fromEntries(
    PARAMS_FILTRO_LINEA.flatMap((p) => (searchParams.get(p) ? [[p, searchParams.get(p)!]] : []))
  );
  const [busqueda, setBusqueda] = useState(valores.q ?? '');
  const q = useDebouncedValue(busqueda);
  const filtros = new URLSearchParams({
    ...valores,
    ...(sedeSeleccionada ? { sedeId: sedeSeleccionada } : {}),
  }).toString();

  const filtrar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if ('q' in cambios) setBusqueda(cambios.q ?? '');
    router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false });
  };

  // La busqueda escrita pasa a la URL al dejar de teclear.
  useEffect(() => {
    if (q !== (valores.q ?? '')) filtrar({ q: q || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // null = cerrado, "nueva" = creando, o la linea que se edita.
  const [abierto, setAbierto] = useState<LineaLista | 'nueva' | null>(null);
  const [aEliminar, setAEliminar] = useState<LineaLista | null>(null);
  // Cambia al guardar o eliminar, para que el panel se recalcule.
  const [version, setVersion] = useState(0);

  const cargar = async () => {
    try {
      const res = await fetch(`/api/lineas?${filtros}`);
      if (res.ok) setLineas(await res.json());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const cerrarFormulario = (guardada: boolean) => {
    setAbierto(null);
    if (guardada) {
      void cargar();
      setVersion((v) => v + 1);
    }
  };

  const eliminar = async (l: LineaLista) => {
    setAEliminar(null);
    const res = await fetch(`/api/lineas/${l.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      toast.error(
        res
          ? (await parseApiError(res, 'Error al eliminar la línea')).message
          : 'Error al eliminar la línea'
      );
      return;
    }
    await cargar();
    setVersion((v) => v + 1);
    toast.success('Línea eliminada');
  };

  const enEdicion = abierto && abierto !== 'nueva' ? abierto.id : null;

  return (
    <div className="space-y-6">
      <ActivosTabs />
      <PageHeader
        title="Líneas telefónicas"
        description="Líneas con su operador y tipo de chip. Cada una se asocia al celular donde está el chip, y la usa quien tiene ese celular. Una eSIM no va en un celular: se asigna a una persona. Se filtra por la sede de la barra (la de su celular o su persona)."
        actions={
          !abierto && (
            <>
              <Link
                href="/activos/lineas/catalogos"
                className={buttonClasses({ variant: 'outline' })}
              >
                <ListChecks size={18} />
                <span>Catálogos</span>
              </Link>
              <Button leftIcon={<Plus size={18} />} onClick={() => setAbierto('nueva')}>
                Nueva línea
              </Button>
            </>
          )
        }
      />

      {abierto && (
        <FormularioLinea
          key={abierto === 'nueva' ? 'nueva' : abierto.id}
          linea={abierto === 'nueva' ? null : abierto}
          onCerrar={cerrarFormulario}
        />
      )}

      <IndicadoresLineas
        filtros={filtros}
        actual={{ estado: valores.estado ?? null, asignacion: valores.asignacion ?? null }}
        version={version}
        onFiltrar={filtrar}
      />

      <FiltrosLineas valores={valores} opciones={opciones} onCambio={filtrar} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número, persona o celular"
          className="field-input w-full sm:max-w-sm"
          aria-label="Buscar"
        />
        {!cargando && (
          <p className="text-sm text-fg-muted">
            {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
          </p>
        )}
      </div>

      <TablaDatos
        items={lineas}
        clave={(l) => l.id}
        cargando={cargando}
        vacio="No hay líneas con este filtro"
        resaltada={(l) => l.estado.deBaja || enEdicion === l.id}
        columnas={[
          {
            titulo: 'Número',
            celda: (l) => (
              <Link
                href={`/activos/lineas/${l.id}`}
                className="font-mono text-brand hover:underline"
              >
                {formatearNumero(l.numero)}
              </Link>
            ),
          },
          {
            titulo: 'Operador',
            celda: (l) =>
              [l.operador?.nombre, l.tipoChip?.nombre].filter(Boolean).join(' · ') || '—',
          },
          { titulo: 'Persona', celda: (l) => <Tenedor l={l} /> },
          {
            titulo: 'Celular',
            celda: (l) =>
              l.activo ? (
                <Link href={`/activos/${l.activo.id}`} className="text-brand hover:underline">
                  {l.activo.marca.nombre} {l.activo.modelo}
                </Link>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          },
          { titulo: 'Sede', celda: (l) => sedeDe(l) ?? <span className="text-fg-subtle">—</span> },
          {
            titulo: 'Estado',
            className: 'text-center',
            celda: (l) => (
              <>
                <Badge variant={tonoEstadoLinea(l.estado)}>{l.estado.nombre}</Badge>
                {l.fechaBaja && (
                  <span className="block text-xs text-fg-subtle">
                    {formatearFecha(l.fechaBaja)}
                  </span>
                )}
              </>
            ),
          },
        ]}
        tarjeta={(l) => (
          <>
            <Link
              href={`/activos/lineas/${l.id}`}
              className="font-mono font-medium text-brand hover:underline"
            >
              {formatearNumero(l.numero)}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <Badge variant={tonoEstadoLinea(l.estado)}>{l.estado.nombre}</Badge>
              <Tenedor l={l} />
              {l.operador && <span>· {l.operador.nombre}</span>}
            </div>
          </>
        )}
        acciones={(l) => (
          <>
            <Link
              href={`/activos/lineas/${l.id}`}
              className="rounded p-1 text-fg-muted hover:bg-surface-muted"
              title="Ver detalle"
              aria-label={`Ver detalle de ${l.numero}`}
            >
              <Eye size={18} />
            </Link>
            {/* Solo se asigna o mueve una linea disponible: vigente y sin persona (SPEC 2.131, 2.167). */}
            {!l.estado.deBaja && !personaDe(l) && (
              <Link
                href={`/activos/lineas/${l.id}?reasignar=1`}
                className="rounded p-1 text-fg-muted hover:bg-surface-muted"
                title="Asignar, mover o cambiar tipo"
                aria-label={`Asignar, mover o cambiar tipo de ${l.numero}`}
              >
                <Repeat size={18} />
              </Link>
            )}
            <button
              onClick={() => setAbierto(l)}
              className="rounded p-1 text-primary-700 hover:bg-primary-50"
              title="Editar"
              aria-label={`Editar ${l.numero}`}
            >
              <Edit size={18} />
            </button>
            {/* Dar de baja lleva a su pantalla, con el motivo (SPEC 2.140). */}
            {!l.estado.deBaja && (
              <Link
                href={`/activos/lineas/${l.id}/baja`}
                className="rounded p-1 text-fg-muted hover:bg-surface-muted"
                title="Dar de baja"
                aria-label={`Dar de baja ${l.numero}`}
              >
                <PowerOff size={18} />
              </Link>
            )}
            {permisos.can('lineas', 'delete') && (
              <button
                onClick={() => setAEliminar(l)}
                className="rounded p-1 text-red-600 hover:bg-red-50"
                title="Eliminar"
                aria-label={`Eliminar ${l.numero}`}
              >
                <Trash2 size={18} />
              </button>
            )}
          </>
        )}
      />

      <ConfirmDialog
        isOpen={!!aEliminar}
        onClose={() => setAEliminar(null)}
        onConfirm={async () => {
          if (aEliminar) await ejecutar(() => eliminar(aEliminar));
        }}
        variant="danger"
        title="Eliminar línea"
        message={
          aEliminar
            ? `La línea ${formatearNumero(aEliminar.numero)} se eliminará. Úsalo solo si se ingresó por error; si ya no se usa, pásala a Baja. En la auditoría quedará quién la eliminó.`
            : ''
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}
