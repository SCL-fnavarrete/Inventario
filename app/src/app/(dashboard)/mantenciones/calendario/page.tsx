"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
} from "lucide-react";
import { cn } from "@/shared/cn";
import {
  LEYENDA_ESTADOS_MANTENCION,
  MantencionesTabs,
  configEstadoMantencion,
} from "@/modules/mantenciones/componentes";
import { estaVencida } from "@/modules/mantenciones";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { CategoryIcon } from "@/modules/activos/componentes";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { aValorInputDate, hoyISO } from "@/shared/utilidades/fechas";
import { logger } from "@/shared/logger";

type Maintenance = {
  id: string;
  tipo: { id: string; nombre: string };
  descripcion: string;
  fechaProgramada: string | null;
  horaProgramada: string | null;
  estado: string;
  resultadoTipo: string | null;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    categoria: {
      nombre: string;
    };
  };
};

/**
 * Dia del calendario como "YYYY-MM-DD" (month parte en 0, como Date). Las
 * fechas programadas son fechas de calendario guardadas a medianoche UTC: se
 * comparan por este texto, no por la hora local, que en Chile las corria al
 * dia anterior.
 */
function claveDia(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Hoy en Chile como fecha local del navegador (para el mes que se muestra). */
function hoyLocal(): Date {
  const [y, m, d] = hoyISO().split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function CalendarioMantencionesPage() {
  const [currentDate, setCurrentDate] = useState(hoyLocal);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Scopes the maintenance list to the nav's selected sede.
  const { sedeSeleccionada } = useSedeSeleccionada();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchMaintenances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, sedeSeleccionada]);

  async function fetchMaintenances() {
    setLoading(true);
    try {
      const fechaDesde = claveDia(year, month, 1);
      const fechaHasta = claveDia(year, month, new Date(year, month + 1, 0).getDate());

      const params = new URLSearchParams({
        fechaDesde,
        fechaHasta,
        limit: "100",
      });
      if (sedeSeleccionada) params.set("sedeId", sedeSeleccionada);

      const res = await fetch(`/api/mantenciones?${params}`);
      const data = await res.json();

      setMaintenances(data.data || []);
    } catch (error) {
      logger.error("Error fetching maintenances", error);
    } finally {
      setLoading(false);
    }
  }

  function getDaysInMonth() {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        currentMonth: false,
        date: new Date(year, month - 1, daysInPrevMonth - i),
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        currentMonth: true,
        date: new Date(year, month, i),
      });
    }

    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        currentMonth: false,
        date: new Date(year, month + 1, i),
      });
    }

    return days;
  }

  function getMaintenancesForDate(date: Date) {
    const clave = claveDia(date.getFullYear(), date.getMonth(), date.getDate());
    // Dentro del dia, por hora; las sin hora al final.
    return maintenances
      .filter((m) => aValorInputDate(m.fechaProgramada) === clave)
      .sort((a, b) => (a.horaProgramada ?? "99").localeCompare(b.horaProgramada ?? "99"));
  }

  // En pantallas angostas el detalle queda bajo el calendario: al elegir un
  // dia se lleva la vista hasta el.
  const detalleDia = useRef<HTMLDivElement>(null);
  function elegirDia(dia: number) {
    setSelectedDay(dia);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detalleDia.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  }

  function goToToday() {
    const hoy = hoyLocal();
    setCurrentDate(hoy);
    setSelectedDay(hoy.getDate());
  }

  const days = getDaysInMonth();
  const today = hoyLocal();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  const selectedMaintenances = selectedDay
    ? getMaintenancesForDate(new Date(year, month, selectedDay))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref="/mantenciones"
        title="Calendario de Mantenciones"
        description="Vista mensual de mantenciones programadas"
        actions={
          <>
            <button
              onClick={goToToday}
              className={buttonClasses({ variant: "outline" })}
            >
              Hoy
            </button>
          </>
        }
      />

      <MantencionesTabs />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="card lg:col-span-3 p-6">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button aria-label="Mes anterior"
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <h2 className="text-xl font-semibold">
              {MONTHS[month]} {year}
            </h2>
            <button aria-label="Mes siguiente"
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
            </div>
          ) : (
            <>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-fg-subtle py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  const dayMaintenances = day.currentMonth
                    ? getMaintenancesForDate(day.date)
                    : [];
                  const isToday =
                    isCurrentMonth &&
                    day.currentMonth &&
                    day.day === today.getDate();
                  const isSelected = day.currentMonth && day.day === selectedDay;
                  const hasOverdue = dayMaintenances.some(estaVencida);

                  return (
                    <button
                      key={index}
                      onClick={() => day.currentMonth && elegirDia(day.day)}
                      className={cn(
                        "min-h-24 p-2 border rounded-lg transition-colors text-left",
                        day.currentMonth
                          ? "bg-surface hover:bg-surface-muted"
                          : "bg-surface-muted text-fg-subtle",
                        isToday && "border-primary-500 border-2",
                        isSelected && "bg-primary-50 border-primary-500",
                        hasOverdue && "bg-red-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isToday &&
                              "bg-brand text-white w-6 h-6 rounded-full flex items-center justify-center"
                          )}
                        >
                          {day.day}
                        </span>
                        {dayMaintenances.length > 0 && (
                          <span className="text-xs bg-gray-100 text-fg-muted px-1.5 py-0.5 rounded">
                            {dayMaintenances.length}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayMaintenances.slice(0, 2).map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded truncate",
                              configEstadoMantencion(m).bgColor,
                              configEstadoMantencion(m).color
                            )}
                          >
                            <span className="inline-flex items-center gap-1">
                              <CategoryIcon categoria={m.asset.categoria.nombre} className="h-3 w-3" />
                              {m.horaProgramada && <span className="font-semibold">{m.horaProgramada}</span>}
                              {m.tipo.nombre}
                            </span>
                          </div>
                        ))}
                        {dayMaintenances.length > 2 && (
                          <div className="text-xs text-fg-subtle px-1">
                            +{dayMaintenances.length - 2} más
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Sidebar - Selected Day Details */}
        <div ref={detalleDia} className="card p-6 scroll-mt-4">
          <h3 className="font-semibold mb-4">
            {selectedDay ? (
              <>
                {selectedDay} de {MONTHS[month]}
              </>
            ) : (
              "Selecciona un día"
            )}
          </h3>

          {selectedDay ? (
            selectedMaintenances.length > 0 ? (
              <div className="space-y-3">
                {selectedMaintenances.map((m) => (
                  <Link
                    key={m.id}
                    href={`/mantenciones/${m.id}`}
                    className={cn(
                      "block p-3 rounded-lg transition-colors hover:shadow",
                      configEstadoMantencion(m).bgColor,
                      configEstadoMantencion(m).color
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CategoryIcon categoria={m.asset.categoria.nombre} className="h-3 w-3" />
                      <span className="font-medium text-sm">
                        {m.horaProgramada && `${m.horaProgramada} · `}
                        {m.tipo.nombre}
                      </span>
                    </div>
                    <p className="text-sm">
                      {m.asset.marca} {m.asset.modelo}
                    </p>
                    <p className="text-xs text-fg-subtle mt-1 line-clamp-2">
                      {m.descripcion}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-fg-subtle">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay mantenciones programadas</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-fg-subtle">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Selecciona un día para ver detalles</p>
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs font-medium text-fg-subtle mb-2">Leyenda:</p>
            <div className="space-y-1">
              {LEYENDA_ESTADOS_MANTENCION.map((e) => (
                <div key={e.label} className="flex items-center gap-2 text-xs">
                  <e.icon className={cn("h-3.5 w-3.5 p-0.5 rounded", e.bgColor, e.color)} />
                  <span>{e.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3.5 h-3.5 rounded bg-red-50 border border-red-200"></div>
                <span>Día con mantenciones vencidas</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
