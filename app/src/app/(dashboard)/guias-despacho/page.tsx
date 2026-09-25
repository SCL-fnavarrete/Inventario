"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, FileText, Truck, AlertTriangle, CheckCircle, XCircle, PackageOpen } from "lucide-react";
import { GuiaDespachoTable } from "@/components/guias-despacho/GuiaDespachoTable";
import type { DispatchGuideListItem } from "@/types/guia-despacho";
import type { VistaGuia } from "@/lib/queries/guias";
import { Can } from "@/components/auth/Can";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, StatGrid } from "@/components/ui/StatCard";

type Resumen = {
  total: number;
  enTransito: number;
  conFaltantes: number;
  recibidas: number;
  anuladas: number;
  porRecibir: number | null;
  equiposEnTransito: number;
};

export default function GuiasDespachoPage() {
  const [guides, setGuides] = useState<DispatchGuideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // El input responde a cada tecla; lo que dispara la busqueda es esta
  // version debounced (ver useDebouncedValue).
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);
  // Tarjeta pulsada (SPEC 2.108): filtra la lista con la misma regla que
  // cuenta su numero. null = todas.
  const [vista, setVista] = useState<VistaGuia | null>(null);
  // Selector de sede del nav: filtra por las dos puntas de la guia,
  // origen y destino -- ver la nota en la API.
  const { sedeSeleccionada } = useSedeSeleccionada();
  const [totalPages, setTotalPages] = useState(1);

  // La pagina vuelve a 1 cuando cambia cualquier filtro (busqueda, tarjeta o
  // sede del menu): se guarda junto a los filtros con que se eligio. Antes,
  // buscar desde la pagina 3 pedia la pagina 3 de los resultados, vacia.
  const filtros = `${debouncedSearchTerm}|${vista}|${sedeSeleccionada}`;
  const [pagina, setPagina] = useState({ filtros, n: 1 });
  const page = pagina.filtros === filtros ? pagina.n : 1;
  const irAPagina = (n: number) => setPagina({ filtros, n });

  useEffect(() => {
    fetchGuides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filtros]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sedeSeleccionada) params.set("sedeId", sedeSeleccionada);
    fetch(`/api/guias-despacho/resumen?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setResumen)
      .catch(() => setResumen(null));
  }, [sedeSeleccionada]);

  async function fetchGuides() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: "10" });
      if (vista) params.append("vista", vista);
      if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);
      if (debouncedSearchTerm) params.append("busqueda", debouncedSearchTerm);

      const res = await fetch(`/api/guias-despacho?${params}`);
      const data = await res.json();

      setGuides(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Error fetching guides:", error);
    } finally {
      setLoading(false);
    }
  }

  // Pulsar la tarjeta activa (o "Total") vuelve a todas.
  const tarjeta = (v: VistaGuia | null) => ({
    onClick: () => setVista(vista === v ? null : v),
    activa: vista === v,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Guías de Despacho"
        description="Equipos que viajan entre sedes: pasan a la sede destino cuando esta confirma que llegaron"
        actions={
          <Can recurso="guias">
            <Link href="/guias-despacho/nueva" className={buttonClasses()}>
              <Plus size={20} />
              Nueva Guía
            </Link>
          </Can>
        }
      />

      {/* Cada tarjeta filtra la lista al pulsarla (SPEC 2.108). */}
      <StatGrid cols={resumen?.porRecibir != null ? 6 : 5}>
        <StatCard tilt label="Total" value={resumen?.total ?? 0} tone="neutral" icon={FileText} {...tarjeta(null)} />
        {resumen?.porRecibir != null && (
          <StatCard
            tilt
            label="Por recibir en mi sede"
            value={resumen.porRecibir}
            tone="primary"
            icon={PackageOpen}
            {...tarjeta("por_recibir")}
          />
        )}
        <StatCard
          tilt
          label="En tránsito"
          value={resumen?.enTransito ?? 0}
          hint={`${resumen?.equiposEnTransito ?? 0} equipo${resumen?.equiposEnTransito === 1 ? "" : "s"} viajando`}
          tone="primary"
          icon={Truck}
          {...tarjeta("en_transito")}
        />
        <StatCard
          tilt
          label="Con faltantes"
          value={resumen?.conFaltantes ?? 0}
          tone="warning"
          icon={AlertTriangle}
          {...tarjeta("recibida_parcial")}
        />
        <StatCard
          tilt
          label="Recibidas"
          value={resumen?.recibidas ?? 0}
          tone="success"
          icon={CheckCircle}
          {...tarjeta("recibida")}
        />
        <StatCard
          tilt
          label="Anuladas"
          value={resumen?.anuladas ?? 0}
          tone="neutral"
          icon={XCircle}
          {...tarjeta("anulada")}
        />
      </StatGrid>

      {/* Busqueda */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" size={20} />
          <input
            type="text"
            placeholder="Buscar por número, OT Chilexpress o receptor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="field-input pl-10 pr-4"
          />
        </div>
      </div>

      {/* Tabla */}
      <GuiaDespachoTable guides={guides} loading={loading} />

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => irAPagina(Math.max(1, page - 1))}
            disabled={page === 1}
            className={buttonClasses({ variant: "outline" })}
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-fg-muted">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => irAPagina(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className={buttonClasses({ variant: "outline" })}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
