"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Maintenance = {
  id: string;
  tipo: string;
  descripcion: string;
  fechaProgramada: string | null;
  estado: string;
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

const tipoLabels: Record<string, string> = {
  preventiva: "Preventiva",
  correctiva: "Correctiva",
  actualizacion_so: "Act. SO",
  limpieza: "Limpieza",
  reparacion: "Reparación",
};

const estadoColors: Record<string, string> = {
  pendiente: "bg-orange-100 border-orange-300 text-orange-800",
  en_proceso: "bg-blue-100 border-blue-300 text-blue-800",
  completada: "bg-green-100 border-green-300 text-green-800",
  cancelada: "bg-gray-100 border-gray-300 text-gray-500",
};

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-3 w-3" />;
    case "celular":
      return <Smartphone className="h-3 w-3" />;
    case "monitor":
      return <Monitor className="h-3 w-3" />;
    default:
      return <Package className="h-3 w-3" />;
  }
}

export default function CalendarioMantencionesPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchMaintenances();
  }, [year, month]);

  async function fetchMaintenances() {
    setLoading(true);
    try {
      const fechaDesde = new Date(year, month, 1).toISOString().split("T")[0];
      const fechaHasta = new Date(year, month + 1, 0).toISOString().split("T")[0];

      const params = new URLSearchParams({
        fechaDesde,
        fechaHasta,
        limit: "100",
      });

      const res = await fetch(`/api/mantenciones?${params}`);
      const data = await res.json();

      setMaintenances(data.data || []);
    } catch (error) {
      console.error("Error fetching maintenances:", error);
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
    return maintenances.filter((m) => {
      if (!m.fechaProgramada) return false;
      const mDate = new Date(m.fechaProgramada);
      return (
        mDate.getDate() === date.getDate() &&
        mDate.getMonth() === date.getMonth() &&
        mDate.getFullYear() === date.getFullYear()
      );
    });
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
    setCurrentDate(new Date());
    setSelectedDay(new Date().getDate());
  }

  const days = getDaysInMonth();
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  const selectedMaintenances = selectedDay
    ? getMaintenancesForDate(new Date(year, month, selectedDay))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/mantenciones"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendario de Mantenciones</h1>
            <p className="text-gray-600">Vista mensual de mantenciones programadas</p>
          </div>
        </div>
        <button
          onClick={goToToday}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Hoy
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-6">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <h2 className="text-xl font-semibold">
              {MONTHS[month]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-gray-500 py-2"
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
                  const hasOverdue = dayMaintenances.some(
                    (m) =>
                      m.estado !== "completada" &&
                      m.estado !== "cancelada" &&
                      new Date(m.fechaProgramada!) < today
                  );

                  return (
                    <button
                      key={index}
                      onClick={() => day.currentMonth && setSelectedDay(day.day)}
                      className={cn(
                        "min-h-24 p-2 border rounded-lg transition-colors text-left",
                        day.currentMonth
                          ? "bg-white hover:bg-gray-50"
                          : "bg-gray-50 text-gray-400",
                        isToday && "border-blue-500 border-2",
                        isSelected && "bg-blue-50 border-blue-500",
                        hasOverdue && "bg-red-50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isToday &&
                              "bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center"
                          )}
                        >
                          {day.day}
                        </span>
                        {dayMaintenances.length > 0 && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {dayMaintenances.length}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayMaintenances.slice(0, 2).map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded border truncate",
                              estadoColors[m.estado]
                            )}
                          >
                            <span className="inline-flex items-center gap-1">
                              {getCategoryIcon(m.asset.categoria.nombre)}
                              {tipoLabels[m.tipo]}
                            </span>
                          </div>
                        ))}
                        {dayMaintenances.length > 2 && (
                          <div className="text-xs text-gray-500 px-1">
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
        <div className="bg-white rounded-lg shadow p-6">
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
                      "block p-3 rounded-lg border transition-colors hover:shadow",
                      estadoColors[m.estado]
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {getCategoryIcon(m.asset.categoria.nombre)}
                      <span className="font-medium text-sm">
                        {tipoLabels[m.tipo]}
                      </span>
                    </div>
                    <p className="text-sm">
                      {m.asset.marca} {m.asset.modelo}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {m.descripcion}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay mantenciones programadas</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Selecciona un día para ver detalles</p>
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs font-medium text-gray-500 mb-2">Leyenda:</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded bg-orange-100 border border-orange-300"></div>
                <span>Pendiente</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div>
                <span>En Proceso</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
                <span>Completada</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded bg-gray-100 border border-gray-300"></div>
                <span>Cancelada</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
