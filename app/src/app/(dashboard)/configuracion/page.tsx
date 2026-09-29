import Link from "next/link";
import {
  FolderTree,
  Users,
  Settings2,
  MapPin,
  History,
  KeyRound,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkArrow } from "@/components/ui/Button";
import { Tilt } from "@/components/ui/Tilt";
import { TONO_ACENTO } from "@/lib/constants/tonos";

// Secciones de Configuracion (SPEC 2.112). Todo el modulo es solo de admin
// (layout.tsx), por eso las tarjetas ya no llevan la marca "Admin". Se eliminaron Mantenimiento de Datos (borrado masivo),
// la sincronizacion con Microsoft y Proveedores.
const configSections = [
  {
    title: "Sedes",
    description: "Santiago, Concepción, etc. Dicen dónde está cada equipo y a qué sede pertenece cada persona",
    href: "/configuracion/sedes",
    icon: MapPin,
  },
  {
    // Antes eran dos tarjetas: Categorias y Opciones de Activos (SPEC 2.112.7).
    title: "Catálogos de Activos",
    description: "Categorías, marcas y opciones de sistema operativo, antivirus y licencia Microsoft 365",
    href: "/configuracion/catalogos",
    icon: FolderTree,
  },
  {
    // Antes estaba en Activos: la carga inicial se hace una vez (SPEC 2.116.7).
    title: "Importar inventario",
    description: "Carga masiva de equipos desde Excel (.xlsx), con revisión de filas antes de guardar",
    href: "/configuracion/importar",
    icon: Upload,
  },
  {
    title: "Usuarios del Sistema",
    description: "Quién entra al sistema, con qué rol y de qué sede; activar y desactivar cuentas",
    href: "/configuracion/usuarios",
    icon: Users,
  },
  {
    title: "Seguridad",
    description: "Duración de la sesión y bloqueo por intentos fallidos",
    href: "/configuracion/parametros",
    icon: Settings2,
  },
  {
    title: "Registro de accesos",
    description: "Inicios de sesión, intentos fallidos, bloqueos y cierres de sesión",
    href: "/configuracion/accesos",
    icon: KeyRound,
  },
  {
    title: "Auditoría",
    description: "Historial completo de todos los módulos: quién hizo qué y cuándo",
    href: "/configuracion/auditoria",
    icon: History,
  },
];

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Solo para administradores: sedes, catálogos, usuarios, seguridad y registros del sistema"
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
                  <h2 className="text-lg font-semibold text-fg">{section.title}</h2>
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
