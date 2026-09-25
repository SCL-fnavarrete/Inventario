import Link from "next/link";
import {
  FolderTree,
  Users,
  Settings2,
  ShieldAlert,
  MapPin,
  History,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { LinkArrow } from "@/components/ui/Button";
import { Tilt } from "@/components/ui/Tilt";
import { TONO_ACENTO } from "@/lib/constants/tonos";

// Secciones de Configuracion (SPEC 2.112). Todo el modulo es solo de admin
// (layout.tsx). Se eliminaron Mantenimiento de Datos (borrado masivo),
// la sincronizacion con Microsoft y Proveedores.
const configSections = [
  {
    title: "Sedes",
    description: "Administra las sedes (Santiago, Concepción, etc.) que aíslan los datos entre soporte",
    href: "/configuracion/sedes",
    icon: MapPin,
    adminOnly: true,
  },
  {
    title: "Categorías de Activos",
    description: "Gestiona las categorías para clasificar equipos (Notebook, Celular, Monitor, etc.)",
    href: "/configuracion/categorias",
    icon: FolderTree,
    adminOnly: false,
  },
  {
    title: "Opciones de Activos",
    description: "Administra las opciones de Sistema Operativo, Antivirus y Licencia Microsoft 365",
    href: "/configuracion/opciones-activos",
    icon: ListChecks,
    adminOnly: false,
  },
  {
    title: "Usuarios del Sistema",
    description: "Administra los usuarios y sus roles de acceso al sistema",
    href: "/configuracion/usuarios",
    icon: Users,
    adminOnly: false,
  },
  {
    title: "Seguridad",
    description: "Duración de la sesión e intentos de inicio de sesión",
    href: "/configuracion/parametros",
    icon: Settings2,
    adminOnly: false,
  },
  {
    title: "Auditoría",
    description: "Historial completo de todos los módulos: quién hizo qué y cuándo",
    href: "/configuracion/auditoria",
    icon: History,
    adminOnly: true,
  },
];

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Administra la configuración del sistema de inventario"
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {configSections.map((section) => {
          const Icon = section.icon;
          return (
            <Tilt key={section.href}>
              <Link
                href={section.href}
                className={cn("card-feature group flex h-full items-start gap-4 p-6", TONO_ACENTO.primary)}
              >
                <div className="rounded-control p-3 bg-primary-50 text-primary-700">
                  <Icon size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-fg">{section.title}</h2>
                    {section.adminOnly && (
                      <Badge variant="warning" size="sm">
                        <ShieldAlert size={12} />
                        Admin
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{section.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 group-hover:text-primary-900">
                    Abrir
                    <LinkArrow size="sm" />
                  </span>
                </div>
              </Link>
            </Tilt>
          );
        })}
      </div>
    </div>
  );
}
