"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn, ShieldX, Lock, UserX, Search } from "lucide-react";
import type { ResultadoAcceso } from "@prisma/client";
import { cn } from "@/shared/cn";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { formatearFechaHora } from "@/shared/utilidades/fechas";
import {
  RESULTADO_ACCESO_BADGE,
  RESULTADO_ACCESO_LABEL,
  ipLegible,
  navegadorLegible,
} from "@/modules/configuracion";

type Registro = {
  id: string;
  /** Usuario escrito al intentar entrar (en registros antiguos, el correo). */
  usuarioIngresado: string;
  resultado: ResultadoAcceso;
  ip: string | null;
  navegador: string | null;
  detalle: string | null;
  createdAt: string;
  usuario: { nombre: string } | null;
};

const FORMATO_FECHA: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

type Resumen = { ingresos_hoy: number; fallidos_hoy: number; bloqueos_hoy: number; desactivados_hoy: number };
type Vista = keyof Resumen | "";

const TARJETAS: { vista: keyof Resumen; label: string; hint: string; tone: "success" | "warning" | "danger" | "purple"; icon: typeof LogIn }[] = [
  { vista: "ingresos_hoy", label: "Ingresos de hoy", hint: "Inicios de sesión correctos", tone: "success", icon: LogIn },
  { vista: "fallidos_hoy", label: "Intentos fallidos de hoy", hint: "Contraseña o usuario incorrecto", tone: "warning", icon: ShieldX },
  { vista: "bloqueos_hoy", label: "Bloqueos de hoy", hint: "Por superar los intentos", tone: "danger", icon: Lock },
  { vista: "desactivados_hoy", label: "Cuentas desactivadas", hint: "Cuenta o sede desactivada, hoy", tone: "purple", icon: UserX },
];

/**
 * Configuracion > Registro de accesos (SPEC 2.112): quien intento entrar,
 * cuando, desde donde y con que resultado. Cada tarjeta filtra la lista.
 */
export default function AccesosPage() {
  return (
    <Suspense>
      <Accesos />
    </Suspense>
  );
}

function Accesos() {
  const params = useSearchParams();
  const [usuario, setUsuario] = useState(params.get("usuario") ?? "");
  const buscar = useDebouncedValue(usuario, 350);
  const [resultado, setResultado] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [vista, setVista] = useState<Vista>("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [paginacion, setPaginacion] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  // Cuantos accesos se ven por pagina ("Mostrar: N").
  const [limite, setLimite] = useState(25);

  // La pagina vuelve a 1 al cambiar cualquier filtro.
  const filtros = `${buscar}|${resultado}|${fechaDesde}|${fechaHasta}|${vista}|${limite}`;
  const [pagina, setPagina] = useState({ filtros, n: 1 });
  const page = pagina.filtros === filtros ? pagina.n : 1;

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(limite) });
    if (buscar) q.set("usuario", buscar);
    if (resultado) q.set("resultado", resultado);
    if (fechaDesde) q.set("fechaDesde", fechaDesde);
    if (fechaHasta) q.set("fechaHasta", fechaHasta);
    if (vista) q.set("vista", vista);
    let vigente = true;
    fetch(`/api/accesos?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!vigente || !data) return;
        setRegistros(data.data);
        setPaginacion(data.pagination);
        setResumen(data.resumen);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [page, limite, buscar, resultado, fechaDesde, fechaHasta, vista]);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Registro de accesos"
        description="Quién intentó entrar al sistema, cuándo, desde dónde y con qué resultado"
      />

      <StatGrid cols={4}>
        {TARJETAS.map((t) => (
          <StatCard
            key={t.vista}
            label={t.label}
            hint={t.hint}
            value={resumen?.[t.vista] ?? 0}
            tone={t.tone}
            icon={t.icon}
            activa={vista === t.vista}
            onClick={() => setVista(vista === t.vista ? "" : t.vista)}
          />
        ))}
      </StatGrid>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            aria-label="Usuario"
            placeholder="Usuario o nombre..."
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="field-input pl-9"
          />
        </div>
        <select
          aria-label="Resultado"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          className="field-input"
        >
          <option value="">Todos los resultados</option>
          {Object.entries(RESULTADO_ACCESO_LABEL).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Desde
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="field-input" />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Hasta
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="field-input" />
        </label>
      </div>

      <TablaDatos
        items={registros}
        clave={(r) => r.id}
        cargando={cargando}
        compacta
        vacio="No hay accesos para estos filtros"
        paginacion={{
          current: page,
          pages: paginacion.totalPages,
          total: paginacion.total,
          limit: paginacion.limit,
          itemLabel: "accesos",
          onPageChange: (n) => setPagina({ filtros, n }),
          onLimitChange: setLimite,
        }}
        columnas={[
          {
            titulo: "Fecha y hora",
            sinSalto: true,
            className: "hidden px-4 text-fg-muted sm:table-cell",
            celda: (r) => formatearFechaHora(r.createdAt, FORMATO_FECHA),
          },
          {
            titulo: "Usuario",
            className: "px-4",
            celda: (r) => (
              <>
                {/* En celular, fila compacta: la fecha va aqui arriba. */}
                <p className="text-xs text-fg-muted sm:hidden">{formatearFechaHora(r.createdAt, FORMATO_FECHA)}</p>
                <p className="break-all font-medium text-fg">{r.usuario?.nombre ?? r.usuarioIngresado}</p>
                {r.usuario && <p className="break-all text-xs text-fg-subtle">{r.usuarioIngresado}</p>}
                <p className="text-xs text-fg-subtle md:hidden">
                  {navegadorLegible(r.navegador)}
                  {r.ip ? ` • ${ipLegible(r.ip)}` : ""}
                </p>
              </>
            ),
          },
          {
            titulo: "Resultado",
            className: "px-4",
            celda: (r) => (
              <>
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                    RESULTADO_ACCESO_BADGE[r.resultado]
                  )}
                >
                  {RESULTADO_ACCESO_LABEL[r.resultado]}
                </span>
                {r.detalle && <p className="mt-1 text-xs text-fg-subtle">{r.detalle}</p>}
              </>
            ),
          },
          {
            titulo: "Dirección de red",
            className: "hidden px-4 font-mono text-xs text-fg-muted md:table-cell",
            celda: (r) => ipLegible(r.ip),
          },
          {
            titulo: "Navegador",
            className: "hidden px-4 text-fg-muted md:table-cell",
            celda: (r) => <span title={r.navegador ?? undefined}>{navegadorLegible(r.navegador)}</span>,
          },
        ]}
      />
    </div>
  );
}
