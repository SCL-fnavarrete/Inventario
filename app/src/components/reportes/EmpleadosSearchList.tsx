'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Laptop, Smartphone, Monitor } from 'lucide-react';

type Assignment = {
  id: string;
  fechaEntrega: Date;
  activo: boolean;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    numeroTelefono?: string | null;
    imei?: string | null;
    categoria: {
      id: string;
      nombre: string;
    } | null;
  };
};

type Empleado = {
  id: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  rut: string;
  cargo: string | null;
  ubicacion: string | null;
  estado: string;
  assignments: Assignment[];
};

interface EmpleadosSearchListProps {
  empleados: Empleado[];
}

export default function EmpleadosSearchList({ empleados }: EmpleadosSearchListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Función de búsqueda que filtra por múltiples campos
  const filteredEmpleados = useMemo(() => {
    if (!searchTerm.trim()) {
      return empleados;
    }

    const searchLower = searchTerm.toLowerCase().trim();

    return empleados.filter((empleado) => {
      // Buscar en nombre completo del empleado
      const nombreCompleto = `${empleado.nombres} ${empleado.apellidoPaterno} ${empleado.apellidoMaterno}`.toLowerCase();
      if (nombreCompleto.includes(searchLower)) return true;

      // Buscar en RUT del empleado
      if (empleado.rut.toLowerCase().includes(searchLower)) return true;

      // Buscar en los activos asignados
      return empleado.assignments.some((assignment) => {
        const asset = assignment.asset;

        // Buscar en número de serie del equipo
        if (asset.numeroSerie?.toLowerCase().includes(searchLower)) return true;

        // Buscar en número telefónico del celular
        if (asset.numeroTelefono?.toLowerCase().includes(searchLower)) return true;

        // Buscar en número de serie del monitor (todos los activos tienen numeroSerie)
        // pero específicamente para monitores
        if (asset.categoria?.nombre === 'Monitor' &&
            asset.numeroSerie?.toLowerCase().includes(searchLower)) return true;

        return false;
      });
    });
  }, [empleados, searchTerm]);

  const empleadosConEquipos = filteredEmpleados.filter((e) => e.assignments.length > 0);
  const empleadosSinEquipos = filteredEmpleados.filter((e) => e.assignments.length === 0);

  return (
    <div className="space-y-6">
      {/* Barra de búsqueda */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
            placeholder="Buscar por nombre, RUT, número de serie, número telefónico o monitor..."
            aria-label="Buscar empleados y equipos"
          />
          {searchTerm && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <button
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                aria-label="Limpiar búsqueda"
              >
                <svg className="h-5 w-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          )}
        </div>
        {searchTerm && (
          <p className="mt-2 text-sm text-gray-600">
            Mostrando {filteredEmpleados.length} de {empleados.length} empleados
          </p>
        )}
      </div>

      {/* Resumen actualizado */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="h-8 w-8 text-blue-600 mx-auto mb-2">
            <svg fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
          </div>
          <p className="text-2xl font-bold text-gray-900">{filteredEmpleados.length}</p>
          <p className="text-sm text-gray-500">Empleados {searchTerm ? 'Encontrados' : 'Activos'}</p>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 text-center">
          <Laptop className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-green-700">
            {empleadosConEquipos.length}
          </p>
          <p className="text-sm text-green-600">Con Equipos</p>
        </div>
        <div className="bg-yellow-50 rounded-lg shadow p-4 text-center">
          <div className="h-8 w-8 text-yellow-600 mx-auto mb-2">
            <svg fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
          </div>
          <p className="text-2xl font-bold text-yellow-700">
            {empleadosSinEquipos.length}
          </p>
          <p className="text-sm text-yellow-600">Sin Equipos</p>
        </div>
      </div>

      {/* Mensaje cuando no hay resultados */}
      {searchTerm && filteredEmpleados.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron resultados</h3>
          <p className="text-gray-500">
            No se encontraron empleados que coincidan con "{searchTerm}"
          </p>
          <button
            onClick={() => setSearchTerm('')}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Limpiar búsqueda
          </button>
        </div>
      )}

      {/* Lista de Empleados con Equipos */}
      {empleadosConEquipos.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              Empleados con Equipos Asignados
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {empleadosConEquipos.map((empleado) => {
              const notebook = empleado.assignments.find(
                (a) => a.asset.categoria?.nombre === "Notebook"
              );
              const celular = empleado.assignments.find(
                (a) => a.asset.categoria?.nombre === "Celular"
              );
              const monitor = empleado.assignments.find(
                (a) => a.asset.categoria?.nombre === "Monitor"
              );
              const otros = empleado.assignments.filter(
                (a) =>
                  !["Notebook", "Celular", "Monitor"].includes(
                    a.asset.categoria?.nombre || ""
                  )
              );

              return (
                <div key={empleado.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <Link
                        href={`/empleados/${empleado.id}`}
                        className="text-lg font-medium text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                      >
                        {empleado.nombres} {empleado.apellidoPaterno}{" "}
                        {empleado.apellidoMaterno}
                      </Link>
                      <p className="text-sm text-gray-500">
                        {empleado.rut} | {empleado.cargo} | {empleado.ubicacion}
                      </p>
                    </div>
                    <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {empleado.assignments.length} equipo(s)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Notebook */}
                    <div
                      className={`p-3 rounded-lg ${
                        notebook ? "bg-blue-50" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Laptop
                          className={`h-4 w-4 ${
                            notebook ? "text-blue-600" : "text-gray-400"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Notebook
                        </span>
                      </div>
                      {notebook ? (
                        <div className="text-sm">
                          <p className="font-medium">
                            {notebook.asset.marca} {notebook.asset.modelo}
                          </p>
                          <p className="text-gray-500 font-mono text-xs">
                            {notebook.asset.numeroSerie}
                          </p>
                          <p className="text-gray-400 text-xs">
                            Desde:{" "}
                            {new Date(notebook.fechaEntrega).toLocaleDateString("es-CL")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">No asignado</p>
                      )}
                    </div>

                    {/* Celular */}
                    <div
                      className={`p-3 rounded-lg ${
                        celular ? "bg-green-50" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Smartphone
                          className={`h-4 w-4 ${
                            celular ? "text-green-600" : "text-gray-400"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Celular
                        </span>
                      </div>
                      {celular ? (
                        <div className="text-sm">
                          <p className="font-medium">
                            {celular.asset.marca} {celular.asset.modelo}
                          </p>
                          <p className="text-gray-500 font-mono text-xs">
                            {celular.asset.numeroTelefono || celular.asset.imei}
                          </p>
                          <p className="text-gray-400 text-xs">
                            Desde:{" "}
                            {new Date(celular.fechaEntrega).toLocaleDateString("es-CL")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">No asignado</p>
                      )}
                    </div>

                    {/* Monitor */}
                    <div
                      className={`p-3 rounded-lg ${
                        monitor ? "bg-purple-50" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Monitor
                          className={`h-4 w-4 ${
                            monitor ? "text-purple-600" : "text-gray-400"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Monitor
                        </span>
                      </div>
                      {monitor ? (
                        <div className="text-sm">
                          <p className="font-medium">
                            {monitor.asset.marca} {monitor.asset.modelo}
                          </p>
                          <p className="text-gray-500 font-mono text-xs">
                            {monitor.asset.numeroSerie}
                          </p>
                          <p className="text-gray-400 text-xs">
                            Desde:{" "}
                            {new Date(monitor.fechaEntrega).toLocaleDateString("es-CL")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">No asignado</p>
                      )}
                    </div>
                  </div>

                  {/* Otros equipos */}
                  {otros.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-gray-500 mb-2">Otros equipos:</p>
                      <div className="flex flex-wrap gap-2">
                        {otros.map((asig) => (
                          <span
                            key={asig.id}
                            className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                          >
                            {asig.asset.categoria?.nombre}: {asig.asset.marca}{" "}
                            {asig.asset.modelo}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empleados sin equipos */}
      {empleadosSinEquipos.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-yellow-50">
            <h2 className="text-lg font-semibold text-yellow-800">
              Empleados Sin Equipos Asignados ({empleadosSinEquipos.length})
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {empleadosSinEquipos.map((empleado) => (
                <div key={empleado.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">
                    {empleado.nombres} {empleado.apellidoPaterno}
                  </p>
                  <p className="text-sm text-gray-500">{empleado.rut}</p>
                  <p className="text-xs text-gray-400">
                    {empleado.cargo} | {empleado.ubicacion}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
