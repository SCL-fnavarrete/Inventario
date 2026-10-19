"use client";

import { useEffect, useState, Fragment } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/shared/cn";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { CampoFormulario } from "@/shared/ui/CampoFormulario";
import { formatearFechaHora } from "@/shared/utilidades/fechas";

/**
 * Configuracion > Auditoria (SPEC 2.112.8): quien hizo que y cuando, en todos
 * los modulos. Una sola consulta con paginas exactas (antes traia 300 por
 * historial y avisaba "Hay mas eventos"); el detalle muestra solo lo que
 * cambio, con nombres en vez de codigos.
 */

type Cambio = { campo: string; antes: string | null; despues: string | null };

/** Cuenta del sistema para el filtro "Usuario" (todas, tambien las desactivadas). */
type CuentaUsuario = { id: string; usuario: string; nombre: string; activo: boolean };

type Evento = {
  id: string;
  modulo: string;
  moduloLabel: string;
  accion: string;
  descripcion: string;
  usuario: string | null;
  contexto: string | null;
  enlace: string | null;
  cambios: Cambio[];
  createdAt: string;
};

const COLOR_MODULO: Record<string, string> = {
  activo: "bg-primary-100 text-primary-900",
  solicitud: "bg-purple-100 text-purple-800",
  empleado: "bg-green-100 text-green-800",
  compra: "bg-teal-100 text-teal-800",
  usuario: "bg-red-100 text-red-800",
  mantencion: "bg-orange-100 text-orange-800",
  guia_despacho: "bg-cyan-100 text-cyan-800",
  desvinculacion: "bg-rose-100 text-rose-800",
  kit_item: "bg-lime-100 text-lime-800",
  sede: "bg-amber-100 text-amber-800",
  categoria: "bg-primary-100 text-primary-900",
  tipo_mantencion: "bg-sky-100 text-sky-800",
  configuracion: "bg-slate-100 text-slate-800",
  catalogo: "bg-blue-100 text-blue-800",
};

const FORMATO_FECHA: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function BadgeModulo({ ev }: { ev: Evento }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        COLOR_MODULO[ev.modulo] ?? "bg-gray-100 text-fg"
      )}
    >
      {ev.moduloLabel}
    </span>
  );
}

/** Que paso, con el registro afectado (enlace si tiene pantalla propia). */
function QuePaso({ ev }: { ev: Evento }) {
  return (
    <>
      <p className="text-fg">{ev.descripcion}</p>
      {ev.contexto &&
        (ev.enlace ? (
          <Link href={ev.enlace} className="block w-fit text-xs text-primary-700 hover:underline">
            {ev.contexto}
          </Link>
        ) : (
          <p className="text-xs text-fg-subtle">{ev.contexto}</p>
        ))}
      {!ev.contexto && ev.enlace && (
        <Link href={ev.enlace} className="block w-fit text-xs text-primary-700 hover:underline">
          Ver registro
        </Link>
      )}
    </>
  );
}

/** Campo · Antes · Despues (solo lo que cambio; al crear o eliminar, los datos). */
function Detalle({ cambios }: { cambios: Cambio[] }) {
  const conAntes = cambios.some((c) => c.antes !== null);
  const conDespues = cambios.some((c) => c.despues !== null);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs text-fg-subtle">
          <tr>
            <th className="px-3 py-2 font-medium">Campo</th>
            {conAntes && <th className="px-3 py-2 font-medium">{conDespues ? "Antes" : "Datos"}</th>}
            {conDespues && <th className="px-3 py-2 font-medium">{conAntes ? "Después" : "Datos"}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cambios.map((c) => (
            <tr key={c.campo}>
              <td className="px-3 py-2 font-medium text-fg-muted">{c.campo}</td>
              {conAntes && <td className="px-3 py-2 text-fg-subtle">{c.antes ?? "—"}</td>}
              {conDespues && <td className="px-3 py-2 text-fg">{c.despues ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditoriaPage() {
  // Ultima respuesta y la consulta a la que corresponde: si no coincide con
  // la pedida, esta cargando.
  const [respuesta, setRespuesta] = useState<{
    consulta: string;
    eventos: Evento[];
    paginacion: { page: number; limit: number; total: number; totalPages: number };
  } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  // Visor de eventos (SPEC 2.170): solo usuario (de la lista) y fechas.
  const [usuario, setUsuario] = useState("");
  const [usuarios, setUsuarios] = useState<CuentaUsuario[]>([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  // Cuantos eventos se ven por pagina ("Mostrar: N").
  const [limite, setLimite] = useState(20);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: CuentaUsuario[]) => setUsuarios([...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))));
  }, []);

  // La pagina vuelve a 1 al cambiar cualquier filtro.
  const filtros = `${usuario}|${fechaDesde}|${fechaHasta}|${limite}`;
  const [pagina, setPagina] = useState({ filtros, n: 1 });
  const page = pagina.filtros === filtros ? pagina.n : 1;

  const q = new URLSearchParams({ page: String(page), limit: String(limite) });
  if (usuario) q.set("usuario", usuario);
  if (fechaDesde) q.set("fechaDesde", fechaDesde);
  if (fechaHasta) q.set("fechaHasta", fechaHasta);
  const consulta = q.toString();

  useEffect(() => {
    let vigente = true;
    fetch(`/api/auditoria?${consulta}`)
      .then((r) => (r.ok ? r.json() : { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }))
      .then((data) => {
        if (vigente) setRespuesta({ consulta, eventos: data.data, paginacion: data.pagination });
      });
    return () => {
      vigente = false;
    };
  }, [consulta]);

  const cargando = respuesta?.consulta !== consulta;
  const eventos = respuesta?.eventos ?? [];
  const paginacion = respuesta?.paginacion ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  const alternar = (id: string) => setExpandido((actual) => (actual === id ? null : id));

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Auditoría"
        description="Visor de eventos: quién hizo qué y cuándo, en todos los módulos"
      />

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <CampoFormulario label="Usuario">
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className="field-input">
            <option value="">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.usuario}>
                {u.nombre} ({u.usuario}){u.activo ? "" : " · desactivado"}
              </option>
            ))}
          </select>
        </CampoFormulario>
        <CampoFormulario label="Desde">
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="field-input" />
        </CampoFormulario>
        <CampoFormulario label="Hasta">
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="field-input" />
        </CampoFormulario>
      </div>

      <TablaDatos
        items={eventos}
        clave={(ev) => ev.id}
        cargando={cargando}
        compacta
        vacio="No hay eventos para estos filtros"
        paginacion={{
          current: page,
          pages: paginacion.totalPages,
          total: paginacion.total,
          limit: paginacion.limit,
          itemLabel: "eventos",
          onPageChange: (n) => setPagina({ filtros, n }),
          onLimitChange: setLimite,
        }}
        expandible={{
          botonPropio: true,
          abierta: (ev) => expandido === ev.id,
          alternar: (ev) => alternar(ev.id),
          contenido: (ev) => <Detalle cambios={ev.cambios} />,
        }}
        columnas={[
          { titulo: "Fecha", sinSalto: true, className: "px-4 text-fg-subtle", celda: (ev) => formatearFechaHora(ev.createdAt, FORMATO_FECHA) },
          { titulo: "Módulo", className: "px-4", celda: (ev) => <BadgeModulo ev={ev} /> },
          { titulo: "Acción", sinSalto: true, className: "px-4 text-fg-muted", celda: (ev) => ev.accion },
          { titulo: "Qué pasó", className: "px-4", celda: (ev) => <QuePaso ev={ev} /> },
          { titulo: "Usuario", className: "px-4 text-fg-subtle", celda: (ev) => ev.usuario ?? "—" },
          {
            titulo: "Detalle",
            sinSalto: true,
            className: "px-4 text-right",
            celda: (ev) => {
              const abierto = expandido === ev.id;
              return (
                ev.cambios.length > 0 && (
                  <button
                    onClick={() => alternar(ev.id)}
                    className="rounded-lg p-2 text-fg-subtle hover:bg-primary-50 hover:text-primary-700"
                    title={abierto ? "Ocultar detalle" : "Ver qué cambió"}
                    aria-label={abierto ? "Ocultar detalle" : "Ver qué cambió"}
                    aria-expanded={abierto}
                  >
                    {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                )
              );
            },
          },
        ]}
        tarjeta={(ev) => {
          const abierto = expandido === ev.id;
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <BadgeModulo ev={ev} />
                <span className="text-xs text-fg-subtle">{formatearFechaHora(ev.createdAt, FORMATO_FECHA)}</span>
              </div>
              <p className="text-xs font-medium text-fg-muted">
                {ev.accion}
                {ev.usuario ? ` · ${ev.usuario}` : ""}
              </p>
              <QuePaso ev={ev} />
              {ev.cambios.length > 0 && (
                <button
                  onClick={() => alternar(ev.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-700"
                  aria-expanded={abierto}
                >
                  {abierto ? "Ocultar detalle" : "Ver qué cambió"}
                  {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
              {abierto && <Detalle cambios={ev.cambios} />}
            </div>
          );
        }}
      />
    </div>
  );
}
