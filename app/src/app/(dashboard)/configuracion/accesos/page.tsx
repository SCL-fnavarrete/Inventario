"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn, ShieldX, Lock, UserX, Search, Loader2 } from "lucide-react";
import type { ResultadoAcceso } from "@prisma/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, StatGrid } from "@/components/ui/StatCard";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatearFechaHora } from "@/lib/utils/fechas";
import {
  RESULTADO_ACCESO_BADGE,
  RESULTADO_ACCESO_LABEL,
  navegadorLegible,
} from "@/lib/constants/accesos";

type Registro = {
  id: string;
  email: string;
  resultado: ResultadoAcceso;
  ip: string | null;
  navegador: string | null;
  detalle: string | null;
  createdAt: string;
  usuario: { nombre: string } | null;
};

type Resumen = { ingresos_hoy: number; fallidos_hoy: number; bloqueos_hoy: number; desactivados_hoy: number };
type Vista = keyof Resumen | "";

const TARJETAS: { vista: keyof Resumen; label: string; hint: string; tone: "success" | "warning" | "danger" | "purple"; icon: typeof LogIn }[] = [
  { vista: "ingresos_hoy", label: "Ingresos de hoy", hint: "Inicios de sesión correctos", tone: "success", icon: LogIn },
  { vista: "fallidos_hoy", label: "Intentos fallidos de hoy", hint: "Contraseña o usuario incorrecto", tone: "warning", icon: ShieldX },
  { vista: "bloqueos_hoy", label: "Bloqueos de hoy", hint: "Por superar los intentos", tone: "danger", icon: Lock },
  { vista: "desactivados_hoy", label: "Cuentas desactivadas", hint: "Intentaron entrar hoy", tone: "purple", icon: UserX },
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

  // La pagina vuelve a 1 al cambiar cualquier filtro.
  const filtros = `${buscar}|${resultado}|${fechaDesde}|${fechaHasta}|${vista}`;
  const [pagina, setPagina] = useState({ filtros, n: 1 });
  const page = pagina.filtros === filtros ? pagina.n : 1;

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), limit: "25" });
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
  }, [page, buscar, resultado, fechaDesde, fechaHasta, vista]);

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
            placeholder="Correo o nombre..."
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-surface-muted">
              <tr>
                <th className="table-th px-4">Fecha y hora</th>
                <th className="table-th px-4">Usuario</th>
                <th className="table-th px-4">Resultado</th>
                <th className="table-th px-4 hidden md:table-cell">Dirección de red</th>
                <th className="table-th px-4 hidden md:table-cell">Navegador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cargando ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-fg-subtle">
                    <Loader2 className="inline h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : registros.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-fg-subtle">
                    No hay accesos para estos filtros
                  </td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-muted">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-fg-muted">
                      {formatearFechaHora(r.createdAt, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium text-fg">{r.usuario?.nombre ?? r.email}</p>
                      {r.usuario && <p className="text-xs text-fg-subtle">{r.email}</p>}
                      <p className="text-xs text-fg-subtle md:hidden">
                        {navegadorLegible(r.navegador)}
                        {r.ip ? ` • ${r.ip}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                          RESULTADO_ACCESO_BADGE[r.resultado]
                        )}
                      >
                        {RESULTADO_ACCESO_LABEL[r.resultado]}
                      </span>
                      {r.detalle && <p className="mt-1 text-xs text-fg-subtle">{r.detalle}</p>}
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-fg-muted md:table-cell">{r.ip ?? "-"}</td>
                    <td className="hidden px-4 py-3 text-sm text-fg-muted md:table-cell" title={r.navegador ?? undefined}>
                      {navegadorLegible(r.navegador)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          className="border-t border-line px-4 py-3"
          current={page}
          pages={paginacion.totalPages}
          total={paginacion.total}
          limit={paginacion.limit}
          itemLabel="accesos"
          onPageChange={(n) => setPagina({ filtros, n })}
        />
      </div>
    </div>
  );
}
