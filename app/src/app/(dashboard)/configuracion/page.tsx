import Link from "next/link";
import {
  FolderTree,
  Users,
  Truck,
  Settings2,
  ChevronRight,
  Trash2,
  ShieldAlert
} from "lucide-react";

const configSections = [
  {
    title: "Categorías de Activos",
    description: "Gestiona las categorías para clasificar equipos (Notebook, Celular, Monitor, etc.)",
    href: "/configuracion/categorias",
    icon: FolderTree,
    color: "bg-blue-100 text-blue-600",
    adminOnly: false,
  },
  {
    title: "Usuarios del Sistema",
    description: "Administra los usuarios y sus roles de acceso al sistema",
    href: "/configuracion/usuarios",
    icon: Users,
    color: "bg-green-100 text-green-600",
    adminOnly: false,
  },
  {
    title: "Proveedores",
    description: "Gestiona los proveedores de equipos y servicios",
    href: "/configuracion/proveedores",
    icon: Truck,
    color: "bg-purple-100 text-purple-600",
    adminOnly: false,
  },
  {
    title: "Parámetros Generales",
    description: "Configuración general del sistema",
    href: "/configuracion/parametros",
    icon: Settings2,
    color: "bg-orange-100 text-orange-600",
    adminOnly: false,
  },
  {
    title: "Mantenimiento de Datos",
    description: "Eliminación masiva de registros (Solo Administradores)",
    href: "/configuracion/mantenimiento",
    icon: Trash2,
    color: "bg-red-100 text-red-600",
    adminOnly: true,
  },
];

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">
          Administra la configuración del sistema de inventario
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {configSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className={`bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow group ${
                section.adminOnly ? "border-2 border-red-200" : ""
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${section.color}`}>
                  <Icon size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {section.title}
                      </h2>
                      {section.adminOnly && (
                        <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          <ShieldAlert size={12} />
                          Admin
                        </span>
                      )}
                    </div>
                    <ChevronRight
                      size={20}
                      className="text-gray-400 group-hover:text-gray-600 transition-colors"
                    />
                  </div>
                  <p className="text-gray-600 mt-1 text-sm">
                    {section.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
