import Link from "next/link";
import {
  FolderTree,
  Users,
  Settings2,
  ChevronRight,
  Trash2,
  ShieldAlert,
  MapPin,
  History,
} from "lucide-react";

// Proveedores y Microsoft Sync se sacaron del menu (14-sep-2026), pedido
// explicito de Javier al revisar que funciones deberia tener este modulo:
// Proveedores porque esa tabla se va a eliminar (sin uso); Microsoft Sync
// porque no hay certeza de que la integracion se vaya a usar realmente. Las
// paginas/rutas de ambos NO se borraron (mismo criterio que kit-epp cuando
// se movio de aca) -- solo dejan de aparecer en este listado. Se agrega
// Auditoria, pantalla nueva que unifica AuditLog + AssetHistory +
// WorkflowTransition (ver auditoria/page.tsx).
const configSections = [
  {
    title: "Sedes",
    description: "Administra las sedes (Santiago, Concepción, etc.) que aíslan los datos entre soporte",
    href: "/configuracion/sedes",
    icon: MapPin,
    color: "bg-amber-100 text-amber-600",
    adminOnly: true,
  },
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
    title: "Parámetros Generales",
    description: "Datos de la empresa y seguridad (duración de sesión, intentos de login)",
    href: "/configuracion/parametros",
    icon: Settings2,
    color: "bg-orange-100 text-orange-600",
    adminOnly: false,
  },
  {
    title: "Auditoría",
    description: "Historial completo de todos los módulos: quién hizo qué y cuándo",
    href: "/configuracion/auditoria",
    icon: History,
    color: "bg-indigo-100 text-indigo-600",
    adminOnly: true,
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
