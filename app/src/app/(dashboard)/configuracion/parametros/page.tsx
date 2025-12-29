"use client";

import { useState } from "react";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Save,
  Bell,
  Clock,
  FileText,
  Shield,
  Database
} from "lucide-react";

type ConfigSection = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
};

const configSections: ConfigSection[] = [
  {
    id: "empresa",
    title: "Datos de la Empresa",
    description: "Información general de la empresa para reportes y documentos",
    icon: Building2,
    color: "bg-blue-100 text-blue-600",
  },
  {
    id: "notificaciones",
    title: "Notificaciones",
    description: "Configuración de alertas y notificaciones del sistema",
    icon: Bell,
    color: "bg-yellow-100 text-yellow-600",
  },
  {
    id: "mantenciones",
    title: "Mantenciones",
    description: "Parámetros para programación de mantenciones",
    icon: Clock,
    color: "bg-green-100 text-green-600",
  },
  {
    id: "documentos",
    title: "Documentos",
    description: "Configuración de generación de actas y reportes",
    icon: FileText,
    color: "bg-purple-100 text-purple-600",
  },
  {
    id: "seguridad",
    title: "Seguridad",
    description: "Políticas de seguridad y acceso",
    icon: Shield,
    color: "bg-red-100 text-red-600",
  },
  {
    id: "sistema",
    title: "Sistema",
    description: "Información y estado del sistema",
    icon: Database,
    color: "bg-gray-100 text-gray-600",
  },
];

export default function ParametrosPage() {
  const [activeSection, setActiveSection] = useState("empresa");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  // Estado para datos de empresa
  const [empresaData, setEmpresaData] = useState({
    nombre: "SLC Consultores",
    rut: "76.XXX.XXX-X",
    direccion: "Santiago, Chile",
    telefono: "+56 2 XXXX XXXX",
    email: "contacto@sclconsultores.com",
    sitioWeb: "www.sclconsultores.com",
  });

  // Estado para notificaciones
  const [notificacionesData, setNotificacionesData] = useState({
    emailRrhh: "rrhh@sclconsultores.com",
    notificarDesvinculaciones: true,
    notificarMantencionesVencidas: true,
    diasAnticipacionMantencion: 7,
    notificarDevolucionesPendientes: true,
  });

  // Estado para mantenciones
  const [mantencionesData, setMantencionesData] = useState({
    frecuenciaPreventivaMeses: 6,
    diasGraciaMantencion: 15,
    notificarTecnico: true,
    autoCrearMantencionPreventiva: false,
  });

  // Estado para documentos
  const [documentosData, setDocumentosData] = useState({
    logoUrl: "",
    piePagina: "Sistema de Control de Inventario IT - SLC Consultores",
    incluirFirmaDigital: true,
    formatoFecha: "DD/MM/YYYY",
  });

  // Estado para seguridad
  const [seguridadData, setSeguridadData] = useState({
    tiempoSesionMinutos: 60,
    intentosMaximosLogin: 5,
    requerirCambioPassword: false,
    diasCambioPassword: 90,
  });

  const handleSave = async () => {
    setSaving(true);
    // Simular guardado
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSuccess("Configuración guardada exitosamente");
    setTimeout(() => setSuccess(""), 3000);
  };

  const renderContent = () => {
    switch (activeSection) {
      case "empresa":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building2 size={16} className="inline mr-1" />
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  value={empresaData.nombre}
                  onChange={(e) => setEmpresaData({ ...empresaData, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUT Empresa
                </label>
                <input
                  type="text"
                  value={empresaData.rut}
                  onChange={(e) => setEmpresaData({ ...empresaData, rut: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <MapPin size={16} className="inline mr-1" />
                  Dirección
                </label>
                <input
                  type="text"
                  value={empresaData.direccion}
                  onChange={(e) => setEmpresaData({ ...empresaData, direccion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone size={16} className="inline mr-1" />
                  Teléfono
                </label>
                <input
                  type="text"
                  value={empresaData.telefono}
                  onChange={(e) => setEmpresaData({ ...empresaData, telefono: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail size={16} className="inline mr-1" />
                  Email de Contacto
                </label>
                <input
                  type="email"
                  value={empresaData.email}
                  onChange={(e) => setEmpresaData({ ...empresaData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sitio Web
                </label>
                <input
                  type="text"
                  value={empresaData.sitioWeb}
                  onChange={(e) => setEmpresaData({ ...empresaData, sitioWeb: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        );

      case "notificaciones":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email de RRHH para Notificaciones
              </label>
              <input
                type="email"
                value={notificacionesData.emailRrhh}
                onChange={(e) => setNotificacionesData({ ...notificacionesData, emailRrhh: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificacionesData.notificarDesvinculaciones}
                  onChange={(e) => setNotificacionesData({ ...notificacionesData, notificarDesvinculaciones: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Notificar desvinculaciones a RRHH</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificacionesData.notificarMantencionesVencidas}
                  onChange={(e) => setNotificacionesData({ ...notificacionesData, notificarMantencionesVencidas: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Notificar mantenciones vencidas</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notificacionesData.notificarDevolucionesPendientes}
                  onChange={(e) => setNotificacionesData({ ...notificacionesData, notificarDevolucionesPendientes: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Notificar devoluciones pendientes</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Días de anticipación para alertas de mantención
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={notificacionesData.diasAnticipacionMantencion}
                onChange={(e) => setNotificacionesData({ ...notificacionesData, diasAnticipacionMantencion: parseInt(e.target.value) })}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case "mantenciones":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frecuencia de mantención preventiva (meses)
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={mantencionesData.frecuenciaPreventivaMeses}
                  onChange={(e) => setMantencionesData({ ...mantencionesData, frecuenciaPreventivaMeses: parseInt(e.target.value) })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Días de gracia después de fecha programada
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={mantencionesData.diasGraciaMantencion}
                  onChange={(e) => setMantencionesData({ ...mantencionesData, diasGraciaMantencion: parseInt(e.target.value) })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mantencionesData.notificarTecnico}
                  onChange={(e) => setMantencionesData({ ...mantencionesData, notificarTecnico: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Notificar al técnico asignado</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mantencionesData.autoCrearMantencionPreventiva}
                  onChange={(e) => setMantencionesData({ ...mantencionesData, autoCrearMantencionPreventiva: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Programar automáticamente la próxima mantención preventiva al completar la actual</span>
              </label>
            </div>
          </div>
        );

      case "documentos":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del Logo (para reportes)
              </label>
              <input
                type="text"
                value={documentosData.logoUrl}
                onChange={(e) => setDocumentosData({ ...documentosData, logoUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pie de página para documentos
              </label>
              <input
                type="text"
                value={documentosData.piePagina}
                onChange={(e) => setDocumentosData({ ...documentosData, piePagina: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Formato de Fecha
              </label>
              <select
                value={documentosData.formatoFecha}
                onChange={(e) => setDocumentosData({ ...documentosData, formatoFecha: e.target.value })}
                className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={documentosData.incluirFirmaDigital}
                onChange={(e) => setDocumentosData({ ...documentosData, incluirFirmaDigital: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Incluir espacio para firma digital en actas</span>
            </label>
          </div>
        );

      case "seguridad":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tiempo de sesión (minutos)
                </label>
                <input
                  type="number"
                  min="15"
                  max="480"
                  value={seguridadData.tiempoSesionMinutos}
                  onChange={(e) => setSeguridadData({ ...seguridadData, tiempoSesionMinutos: parseInt(e.target.value) })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intentos máximos de login
                </label>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={seguridadData.intentosMaximosLogin}
                  onChange={(e) => setSeguridadData({ ...seguridadData, intentosMaximosLogin: parseInt(e.target.value) })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={seguridadData.requerirCambioPassword}
                  onChange={(e) => setSeguridadData({ ...seguridadData, requerirCambioPassword: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Requerir cambio de contraseña periódico</span>
              </label>
              {seguridadData.requerirCambioPassword && (
                <div className="ml-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Días para cambio de contraseña
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="365"
                    value={seguridadData.diasCambioPassword}
                    onChange={(e) => setSeguridadData({ ...seguridadData, diasCambioPassword: parseInt(e.target.value) })}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        );

      case "sistema":
        return (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Información del Sistema</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Versión:</span>
                  <span className="ml-2 font-medium text-gray-900">1.0.0</span>
                </div>
                <div>
                  <span className="text-gray-600">Framework:</span>
                  <span className="ml-2 font-medium text-gray-900">Next.js 16</span>
                </div>
                <div>
                  <span className="text-gray-600">Base de datos:</span>
                  <span className="ml-2 font-medium text-gray-900">PostgreSQL</span>
                </div>
                <div>
                  <span className="text-gray-600">ORM:</span>
                  <span className="ml-2 font-medium text-gray-900">Prisma</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Estado de la Base de Datos</h3>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-blue-800">Conexión activa</span>
              </div>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="font-medium text-yellow-900 mb-2">Próximas Funcionalidades</h3>
              <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                <li>Integración con Microsoft Intune</li>
                <li>Notificaciones por email automáticas</li>
                <li>Exportación a formatos adicionales</li>
                <li>Dashboard personalizable</li>
              </ul>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parámetros Generales</h1>
        <p className="text-gray-600 mt-1">Configuración general del sistema de inventario</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar de secciones */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <div className="bg-white rounded-lg shadow">
            <nav className="space-y-1 p-2">
              {configSections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeSection === section.id
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className={`p-1.5 rounded ${section.color}`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{section.title}</div>
                      <div className="text-xs text-gray-500 line-clamp-1">
                        {section.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Contenido de la sección */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                {configSections.find(s => s.id === activeSection)?.title}
              </h2>
              {activeSection !== "sistema" && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  {saving ? "Guardando..." : "Guardar Cambios"}
                </button>
              )}
            </div>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
