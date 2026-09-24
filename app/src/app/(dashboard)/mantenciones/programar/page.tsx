"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, Wrench, User, Package, Loader2, ChevronDown, X } from "lucide-react";
import { motivoSinMantencion } from "@/lib/constants/estadosActivo";
import { cn } from "@/lib/utils";
import { hoyISO } from "@/lib/utils/fechas";
import { avisoFechaPasada } from "@/lib/utils/mantenciones";
import { parseApiError } from "@/lib/utils/apiErrors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  AvisoSeccion,
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseCampo,
} from "@/components/ui/CampoFormulario";

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: string;
  categoria: { id: string; nombre: string };
  empleadoActual: { id: string; nombres: string; apellidoPaterno: string } | null;
};

// Tipos del catalogo editable; solo se ofrecen los activos.
type TipoMantencion = { id: string; nombre: string };

const ETIQUETAS = {
  assetId: "Equipo",
  tipoId: "Tipo de mantención",
  fechaProgramada: "Fecha",
  horaProgramada: "Hora",
  descripcion: "Descripción",
};

// Cuantos equipos se muestran por busqueda: la lista es para elegir uno, no
// para recorrer el inventario.
const LIMITE_RESULTADOS = 20;

/**
 * Programar una mantencion en una sola pantalla (SPEC 2.98): se elige el
 * equipo y se llenan tipo, fecha, hora y descripcion. Programar no cambia el
 * estado del equipo: entra a mantencion al pulsar Iniciar (SPEC 2.96).
 */
export default function ProgramarMantencionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { sedeSeleccionada } = useSedeSeleccionada();
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);

  const [equipo, setEquipo] = useState<Asset | null>(null);
  const [cargandoEquipo, setCargandoEquipo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDiferida = useDebouncedValue(busqueda, 350);
  const [categoriaId, setCategoriaId] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [resultados, setResultados] = useState<Asset[]>([]);
  const [totalResultados, setTotalResultados] = useState(0);
  const [buscando, setBuscando] = useState(true);

  const [tipos, setTipos] = useState<TipoMantencion[]>([]);
  const [cargandoTipos, setCargandoTipos] = useState(true);
  const [form, setForm] = useState({
    tipoId: "",
    fechaProgramada: hoyISO(),
    horaProgramada: "",
    descripcion: "",
  });
  const [enviando, setEnviando] = useState(false);
  // Programar e iniciar de una vez (SPEC 2.101): para una reparacion que se
  // hace ahora. Viene marcada al arrastrar un equipo a "En Mantención" en
  // el tablero de Activos.
  const [iniciarAhora, setIniciarAhora] = useState(searchParams.get("iniciar") === "1");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/categorias")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategorias)
      .catch(() => setCategorias([]));
    fetch("/api/mantenciones/tipos?activo=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: TipoMantencion[]) => {
        setTipos(lista);
        // Preventiva por defecto: es la que mas se programa.
        const porDefecto = lista.find((t) => t.nombre === "Preventiva") ?? lista[0];
        if (porDefecto) setForm((prev) => (prev.tipoId ? prev : { ...prev, tipoId: porDefecto.id }));
      })
      .catch(() => setTipos([]))
      .finally(() => setCargandoTipos(false));
  }, []);

  // Busqueda en el servidor, con las mismas reglas que Activos (por
  // palabras, en marca, modelo, serie y persona asignada).
  useEffect(() => {
    if (equipo) return;
    const params = new URLSearchParams({ limit: String(LIMITE_RESULTADOS) });
    if (busquedaDiferida.trim()) params.set("search", busquedaDiferida.trim());
    if (categoriaId) params.set("categoriaId", categoriaId);
    if (sedeSeleccionada) params.set("sedeId", sedeSeleccionada);
    let vigente = true;
    setBuscando(true);
    fetch(`/api/activos?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], pagination: { total: 0 } }))
      .then((data) => {
        if (!vigente) return;
        setResultados(data.data || []);
        setTotalResultados(data.pagination?.total ?? 0);
      })
      .catch(() => vigente && setResultados([]))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
  }, [busquedaDiferida, categoriaId, sedeSeleccionada, equipo]);

  // Entrada desde otra pantalla (detalle del activo, Kanban): el equipo ya
  // viene elegido.
  useEffect(() => {
    const activoId = searchParams.get("activoId");
    if (!activoId) return;
    setCargandoEquipo(true);
    fetch(`/api/activos/${activoId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await parseApiError(r, "Activo no encontrado")).message);
        return r.json();
      })
      .then(elegirEquipo)
      .catch((err) =>
        setError(`${err instanceof Error ? err.message : "Activo no encontrado"}. Búscalo en la lista.`)
      )
      .finally(() => setCargandoEquipo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function elegirEquipo(asset: Asset) {
    setEquipo(asset);
    setError("");
    const bloqueo = motivoSinMantencion(asset.estado);
    if (bloqueo) reportar({ assetId: `No se puede programar: ${bloqueo}` });
    else limpiar("assetId");
  }

  function cambiar<K extends keyof typeof form>(campo: K, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  }

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!equipo) e.assetId = "Elige el equipo";
    else {
      const bloqueo = motivoSinMantencion(equipo.estado);
      if (bloqueo) e.assetId = `No se puede programar: ${bloqueo}`;
    }
    if (!form.tipoId) e.tipoId = "Elige el tipo de mantención";
    if (!form.fechaProgramada) e.fechaProgramada = "Elige la fecha";
    if (!form.descripcion.trim()) e.descripcion = "Describe qué se va a hacer";
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (reportar(validar()) || !equipo) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/mantenciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: equipo.id,
          tipoId: form.tipoId,
          descripcion: form.descripcion,
          fechaProgramada: form.fechaProgramada,
          horaProgramada: form.horaProgramada || null,
          realizadoPor: session?.user?.name || null,
        }),
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, "Error al programar mantención");
        if (Object.keys(fieldErrors).length > 0) reportar(fieldErrors);
        else setError(message);
        return;
      }
      const data = await res.json();
      // Si no se puede iniciar, la mantencion queda programada y el detalle
      // lo muestra (con su boton Iniciar y el motivo al pulsarlo).
      if (iniciarAhora) {
        await fetch(`/api/mantenciones/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: "en_proceso" }),
        });
      }
      router.push(`/mantenciones/${data.id}`);
    } catch {
      setError("Error al programar mantención");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        backHref="/mantenciones"
        title="Programar Mantención"
        description="Elige el equipo y cuándo se hará. El equipo pasa a En Mantención al iniciarla."
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <ResumenErrores mensaje={resumen || error} />

        {/* Equipo */}
        <section className="card p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-fg">Equipo</h2>

          {cargandoEquipo ? (
            <div className="flex items-center gap-3 py-6 text-fg-muted">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando equipo...
            </div>
          ) : equipo ? (
            <>
              <div className="flex items-center gap-3 p-4 bg-surface-muted rounded-lg">
                <span className="text-fg-subtle">
                  <CategoryIcon categoria={equipo.categoria.nombre} className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-fg truncate">
                    {equipo.marca} {equipo.modelo}
                  </p>
                  <p className="text-sm text-fg-subtle truncate">
                    {equipo.numeroSerie || "Sin número de serie"}
                    {equipo.empleadoActual &&
                      ` • ${equipo.empleadoActual.nombres} ${equipo.empleadoActual.apellidoPaterno}`}
                  </p>
                </div>
                <AssetStatusBadge status={equipo.estado} />
                <button
                  type="button"
                  onClick={() => {
                    setEquipo(null);
                    limpiar("assetId");
                  }}
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                >
                  <X size={14} /> Cambiar
                </button>
              </div>
              <AvisoSeccion mensaje={errores.assetId} />
            </>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar por marca, modelo, serie o persona asignada..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    aria-invalid={!!errores.assetId}
                    className={cn(claseCampo(errores.assetId), "pl-9")}
                  />
                </div>
                <div className="relative">
                  <select
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                    className="field-input appearance-none pr-9 cursor-pointer"
                  >
                    <option value="">Todas las categorías</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
                    size={16}
                  />
                </div>
              </div>
              {errores.assetId && <p className="text-xs text-red-600">{errores.assetId}</p>}

              {buscando ? (
                <div className="flex items-center justify-center py-10 text-fg-muted">
                  <Loader2 className="h-6 w-6 animate-spin mr-3" /> Buscando equipos...
                </div>
              ) : resultados.length === 0 ? (
                <div className="text-center py-10 text-fg-subtle">
                  <Package className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-fg-muted">No se encontraron equipos</p>
                  <p className="text-sm mt-1">Prueba con otras palabras o categoría.</p>
                </div>
              ) : (
                <>
                  <ul className="max-h-96 overflow-y-auto border border-line rounded-lg divide-y divide-line">
                    {resultados.map((asset) => {
                      const bloqueo = motivoSinMantencion(asset.estado);
                      return (
                        <li key={asset.id}>
                          <button
                            type="button"
                            disabled={!!bloqueo}
                            onClick={() => elegirEquipo(asset)}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 sm:p-4 text-left transition-colors",
                              bloqueo ? "opacity-60 cursor-not-allowed" : "hover:bg-primary-50"
                            )}
                          >
                            <span className="flex-shrink-0 text-fg-subtle">
                              <CategoryIcon categoria={asset.categoria.nombre} className="h-5 w-5" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-fg truncate">
                                {asset.marca} {asset.modelo}
                              </p>
                              <p className="text-sm text-fg-subtle truncate">
                                {asset.categoria.nombre} • {asset.numeroSerie || "Sin número de serie"}
                                {asset.empleadoActual && (
                                  <>
                                    {" • "}
                                    <User className="inline h-3.5 w-3.5 -mt-0.5 mr-0.5" />
                                    {asset.empleadoActual.nombres} {asset.empleadoActual.apellidoPaterno}
                                  </>
                                )}
                              </p>
                              {bloqueo && <p className="text-xs text-fg-muted mt-0.5">{bloqueo}</p>}
                            </div>
                            <AssetStatusBadge status={asset.estado} className="flex-shrink-0" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-sm text-fg-subtle text-center">
                    {totalResultados > resultados.length
                      ? `Mostrando ${resultados.length} de ${totalResultados}: escribe para acotar la búsqueda`
                      : `${resultados.length} equipo${resultados.length !== 1 ? "s" : ""}`}
                  </p>
                </>
              )}
            </>
          )}
        </section>

        {/* Detalles */}
        <section className="card p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-fg">Mantención</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CampoFormulario
              label="Tipo"
              obligatorio
              error={errores.tipoId}
              className="sm:col-span-3"
              ayuda={
                !cargandoTipos && tipos.length === 0
                  ? 'No hay tipos activos: crea uno en la pestaña "Tipos".'
                  : undefined
              }
            >
              <select
                value={form.tipoId}
                onChange={(e) => cambiar("tipoId", e.target.value)}
                aria-invalid={!!errores.tipoId}
                className={claseCampo(errores.tipoId)}
                disabled={cargandoTipos}
              >
                <option value="">{cargandoTipos ? "Cargando..." : "Elige un tipo"}</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </CampoFormulario>
            <CampoTexto
              label="Fecha"
              obligatorio
              type="date"
              value={form.fechaProgramada}
              onChange={(v) => cambiar("fechaProgramada", v)}
              error={errores.fechaProgramada}
              ayuda={iniciarAhora ? undefined : avisoFechaPasada(form.fechaProgramada)}
              className="sm:col-span-2"
            />
            <CampoTexto
              label="Hora (Chile)"
              type="time"
              value={form.horaProgramada}
              onChange={(v) => cambiar("horaProgramada", v)}
              error={errores.horaProgramada}
              ayuda="Opcional"
            />
            <CampoFormulario
              label="Descripción"
              obligatorio
              error={errores.descripcion}
              className="sm:col-span-3"
            >
              <textarea
                rows={3}
                placeholder="Qué se va a hacer: limpieza, cambio de batería, revisión..."
                value={form.descripcion}
                onChange={(e) => cambiar("descripcion", e.target.value)}
                aria-invalid={!!errores.descripcion}
                className={claseCampo(errores.descripcion)}
              />
            </CampoFormulario>
            <CampoTexto
              label="Técnico"
              value={session?.user?.name || ""}
              onChange={() => {}}
              readOnly
              disabled
              ayuda="Quien programa la mantención."
              className="sm:col-span-3"
            />
          </div>
        </section>

        <label className="card p-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={iniciarAhora}
            onChange={(e) => setIniciarAhora(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block font-medium text-fg">Iniciar ahora</span>
            <span className="block text-sm text-fg-subtle">
              Para una reparación que empieza hoy: el equipo pasa de inmediato a En Mantención.
              Si no la marcas, queda programada y el equipo sigue en uso hasta pulsar Iniciar.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/mantenciones")}
            className={buttonClasses({ variant: "outline" })}
          >
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className={buttonClasses({ className: "px-6" })}>
            {enviando ? <Loader2 className="animate-spin" size={18} /> : <Wrench size={18} />}
            {iniciarAhora ? "Programar e iniciar" : "Programar Mantención"}
          </button>
        </div>
      </form>
    </div>
  );
}
