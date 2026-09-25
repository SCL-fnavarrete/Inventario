"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Save } from "lucide-react";
import { CatalogSelect } from "@/components/ui/CatalogSelect";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { useCampoSede } from "@/components/providers/SedeSeleccionadaProvider";
import {
  ESTADO_ACTIVO_LABEL,
  CONDICION_ACTIVO_LABEL,
  etiquetaEstadoActivo,
} from "@/lib/constants/estadosActivo";
import { cn } from "@/lib/utils";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";

/**
 * Formulario de Activo, compartido por Nuevo y Editar (SPEC 2.77). Antes
 * eran dos copias de ~560 lineas que ya se habian separado: Editar tenia
 * texto libre donde Nuevo usaba los catalogos. Lo que difiere entre modos
 * es deliberado:
 *   - crear:  elige Sede (despues solo cambia via Guia de Despacho, SPEC
 *             2.8.3), estado fijo "Disponible", N° de serie obligatorio.
 *   - editar: estado solo de lectura (SPEC 2.86) y Nombre de Equipo (al crear se define en la
 *             asignacion, porque se arma con el nombre de quien lo recibe).
 */

export type ActivoFormValues = {
  categoriaId: string;
  sedeId: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  estado: string;
  condicion: string;
  fechaCompra: string;
  fechaGarantiaFin: string;
  procesador: string;
  ram: string;
  almacenamiento: string;
  sistemaOperativo: string;
  imei: string;
  numeroTelefono: string;
  pulgadas: string;
  observaciones: string;
  antivirus: string;
  incidencia: string;
  nombreEquipo: string;
  conectividad: string;
  tipoLicenciaMicrosoft365: string;
};

export const ACTIVO_FORM_VACIO: ActivoFormValues = {
  categoriaId: "",
  sedeId: "",
  marca: "",
  modelo: "",
  numeroSerie: "",
  estado: "disponible",
  condicion: "nuevo",
  fechaCompra: "",
  fechaGarantiaFin: "",
  procesador: "",
  ram: "",
  almacenamiento: "",
  sistemaOperativo: "",
  imei: "",
  numeroTelefono: "",
  pulgadas: "",
  observaciones: "",
  antivirus: "",
  incidencia: "",
  nombreEquipo: "",
  conectividad: "",
  tipoLicenciaMicrosoft365: "",
};

type Modo = "crear" | "editar";

// Fecha ISO -> yyyy-mm-dd para <input type="date">.
const aInputDate = (valor?: string | null) =>
  valor ? new Date(valor).toISOString().split("T")[0] : "";

/** Valores del formulario a partir de un activo de GET /api/activos/[id]. */
export function valoresDesdeActivo(asset: Record<string, unknown>): ActivoFormValues {
  const txt = (k: string) => (asset[k] == null ? "" : String(asset[k]));
  return {
    ...ACTIVO_FORM_VACIO,
    categoriaId: txt("categoriaId"),
    marca: txt("marca"),
    modelo: txt("modelo"),
    numeroSerie: txt("numeroSerie"),
    estado: txt("estado"),
    condicion: txt("condicion"),
    fechaCompra: aInputDate(asset.fechaCompra as string | null),
    fechaGarantiaFin: aInputDate(asset.fechaGarantiaFin as string | null),
    procesador: txt("procesador"),
    ram: txt("ram"),
    almacenamiento: txt("discoDuro"),
    sistemaOperativo: txt("sistemaOperativo"),
    imei: txt("imei"),
    numeroTelefono: txt("numeroTelefono"),
    pulgadas: txt("pulgadas"),
    observaciones: txt("observaciones"),
    antivirus: txt("antivirus"),
    incidencia: txt("incidencia"),
    nombreEquipo: txt("nombreEquipo"),
    conectividad: txt("conectividad"),
    tipoLicenciaMicrosoft365: txt("tipoLicenciaMicrosoft365"),
  };
}

/** Cuerpo para POST (crear) o PUT (editar) de /api/activos. */
export function payloadActivo(v: ActivoFormValues, modo: Modo) {
  return {
    categoriaId: v.categoriaId,
    // La sede solo se fija al crear; el backend rechaza un valor vacio.
    ...(modo === "crear" ? { sedeId: v.sedeId || undefined } : {}),
    marca: v.marca,
    modelo: v.modelo,
    numeroSerie: v.numeroSerie || null,
    // El estado solo se envia al crear (siempre "disponible"): al editar no
    // cambia, lo mueven los procesos (SPEC 2.86).
    ...(modo === "crear" ? { estado: v.estado } : {}),
    condicion: v.condicion,
    fechaCompra: v.fechaCompra || null,
    fechaGarantiaFin: v.fechaGarantiaFin || null,
    procesador: v.procesador || null,
    ram: v.ram || null,
    discoDuro: v.almacenamiento || null,
    sistemaOperativo: v.sistemaOperativo || null,
    imei: v.imei || null,
    numeroTelefono: v.numeroTelefono || null,
    pulgadas: v.pulgadas || null,
    observaciones: v.observaciones || null,
    antivirus: v.antivirus || null,
    incidencia: v.incidencia || null,
    ...(modo === "editar" ? { nombreEquipo: v.nombreEquipo || null } : {}),
    conectividad: v.conectividad || null,
    // No hay checkbox propio de "tiene M365": se deriva de si hay plan.
    tipoLicenciaMicrosoft365: v.tipoLicenciaMicrosoft365 || null,
    microsoft365: Boolean(v.tipoLicenciaMicrosoft365),
  };
}

type Opcion = { id: string; nombre: string };

// Perifericos simples: solo piden conectividad, no una seccion propia.
const PERIFERICOS_SIMPLES = ["mouse", "teclado", "webcam", "audífonos"];

function Campo({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={cn("field-label", error && "text-red-600")}>{label}</label>
      {children}
      {error ? <MensajeCampo mensaje={error} /> : hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

// Nombre de cada campo obligatorio en el resumen de errores.
const ETIQUETAS_ACTIVO: Record<string, string> = {
  categoriaId: "Categoría",
  marca: "Marca",
  modelo: "Modelo",
  numeroSerie: "Número de serie",
  sedeId: "Sede",
};

function Seccion({ titulo, cols = 3, children }: { titulo: string; cols?: 2 | 3; children: ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="mb-4 text-lg font-semibold text-fg">{titulo}</h2>
      <div
        className={
          cols === 3
            ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            : "grid grid-cols-1 gap-4 md:grid-cols-2"
        }
      >
        {children}
      </div>
    </div>
  );
}

interface ActivoFormProps {
  modo: Modo;
  initialValues?: ActivoFormValues;
  /** Guarda en el backend; si lanza o no redirige, el formulario se rehabilita. */
  onSubmit: (values: ActivoFormValues) => Promise<void>;
  /** A donde lleva Cancelar; o onCancel, si el formulario va en una ventana. */
  cancelHref?: string;
  onCancel?: () => void;
  /**
   * Sede ya decidida por quien usa el formulario (una compra crea sus
   * equipos en la sede de la factura, SPEC 2.103): no se muestra el selector.
   */
  sedeFija?: string;
  /** Errores por campo que devolvio el servidor (ej. N° de serie repetido). */
  erroresServidor?: Record<string, string>;
}

export function ActivoForm({
  modo,
  initialValues = ACTIVO_FORM_VACIO,
  onSubmit,
  cancelHref,
  onCancel,
  sedeFija,
  erroresServidor = {},
}: ActivoFormProps) {
  const crear = modo === "crear";
  const { data: session } = useSession();
  // Sede al crear: precargada con la del navbar o la propia (useCampoSede,
  // SPEC 2.80). Al editar no se muestra: el activo conserva la suya.
  const [sedeElegida, setSedeId] = useCampoSede();
  const sedeId = sedeFija ?? sedeElegida;
  const esAdminSede = session?.user?.role === "admin";

  const [values, setValues] = useState<ActivoFormValues>(initialValues);
  const [categories, setCategories] = useState<Opcion[]>([]);
  const [sedes, setSedes] = useState<Opcion[]>([]);
  const [guardando, setGuardando] = useState(false);
  // Validacion por campo, igual que en Onboarding.
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS_ACTIVO);
  const error = (campo: string): string | undefined => errores[campo] ?? erroresServidor[campo];

  useEffect(() => {
    fetch("/api/categorias")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
    if (crear) {
      fetch("/api/sedes?activas=true")
        .then((r) => r.json())
        .then((data) => setSedes(Array.isArray(data) ? data : []))
        .catch(() => setSedes([]));
    }
  }, [crear]);

  const set = (name: keyof ActivoFormValues) => (valor: string) =>
    setValues((prev) => ({ ...prev, [name]: valor }));
  const bind = (name: keyof ActivoFormValues) => ({
    name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      set(name)(e.target.value);
      limpiar(name);
    },
    className: claseCampo(error(name)),
    "aria-invalid": !!error(name),
  });

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!values.categoriaId) e.categoriaId = "Elige la categoría";
    if (!values.marca.trim()) e.marca = "Escribe la marca";
    if (!values.modelo.trim()) e.modelo = "Escribe el modelo";
    if (crear && !values.numeroSerie.trim()) e.numeroSerie = "Escribe el número de serie";
    if (crear && !sedeId) e.sedeId = "Elige la sede";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reportar(validar())) return;
    setGuardando(true);
    try {
      await onSubmit(crear ? { ...values, sedeId } : values);
    } finally {
      setGuardando(false);
    }
  }

  const categoria = categories.find((c) => c.id === values.categoriaId)?.nombre.toLowerCase();
  const esPerifericoSimple = categoria ? PERIFERICOS_SIMPLES.includes(categoria) : false;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <ResumenErrores mensaje={resumen} />
      <Seccion titulo="Información General">
        <Campo label="Categoría *" error={error("categoriaId")}>
          <select {...bind("categoriaId")} required>
            <option value="">Seleccionar categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Marca *" error={error("marca")}>
          <input type="text" {...bind("marca")} required />
        </Campo>
        <Campo label="Modelo *" error={error("modelo")}>
          <input type="text" {...bind("modelo")} required />
        </Campo>
        <Campo label={crear ? "Número de Serie *" : "Número de Serie"} error={error("numeroSerie")}>
          <input type="text" {...bind("numeroSerie")} required={crear} />
        </Campo>
        <Campo label="Estado">
          <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-fg-muted">
            {crear
              ? ESTADO_ACTIVO_LABEL.disponible
              : etiquetaEstadoActivo(values.estado)}
          </p>
          {!crear && (
            <p className="mt-1 text-xs text-fg-subtle">
              El estado cambia con su proceso: solicitudes, mantenciones, baja o venta.
            </p>
          )}
        </Campo>
        <Campo label="Condición">
          <select {...bind("condicion")}>
            {Object.entries(CONDICION_ACTIVO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha de Compra">
          <input type="date" {...bind("fechaCompra")} />
        </Campo>
        <Campo
          label="Fin de Garantía"
          hint="Opcional. El dashboard avisa cuando faltan 30 días para vencer."
        >
          <input type="date" {...bind("fechaGarantiaFin")} />
        </Campo>
        {crear && !sedeFija && (
          <Campo
            label={
              <>
                Sede <span className="text-red-500">*</span>
              </>
            }
            hint={
              esAdminSede
                ? "Obligatorio: a qué sede pertenece este equipo."
                : "Es tu sede: los equipos que crees quedan registrados en ella."
            }
            error={error("sedeId")}
          >
            <select
              name="sedeId"
              value={sedeId}
              onChange={(e) => {
                setSedeId(e.target.value);
                limpiar("sedeId");
              }}
              className={claseCampo(error("sedeId"))}
              aria-invalid={!!error("sedeId")}
              required
              disabled={!esAdminSede}
            >
              <option value="" disabled>
                Selecciona una sede...
              </option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </Seccion>

      {categoria === "notebook" && (
        <Seccion titulo="Especificaciones Técnicas - Notebook">
          <Campo label="Procesador">
            <input type="text" {...bind("procesador")} placeholder="ej: Intel Core i7-1165G7" />
          </Campo>
          <Campo label="RAM">
            <input type="text" {...bind("ram")} placeholder="ej: 16GB" />
          </Campo>
          <Campo label="Almacenamiento">
            <input type="text" {...bind("almacenamiento")} placeholder="ej: 512GB SSD" />
          </Campo>
          <Campo label="Sistema Operativo">
            <CatalogSelect
              endpoint="/api/sistemas-operativos"
              value={values.sistemaOperativo}
              onChange={set("sistemaOperativo")}
              placeholder="Selecciona un sistema operativo"
            />
          </Campo>
          <Campo label="Antivirus">
            <CatalogSelect
              endpoint="/api/antivirus"
              value={values.antivirus}
              onChange={set("antivirus")}
              placeholder="Selecciona un antivirus"
            />
          </Campo>
          {!crear && (
            <Campo label="Nombre del Equipo">
              <input type="text" {...bind("nombreEquipo")} placeholder="ej: NB-SCL-001" />
            </Campo>
          )}
          <Campo label="Licencia Microsoft 365">
            <CatalogSelect
              endpoint="/api/licencias-m365"
              value={values.tipoLicenciaMicrosoft365}
              onChange={set("tipoLicenciaMicrosoft365")}
              placeholder="Selecciona una licencia (vacío si no tiene)"
            />
          </Campo>
        </Seccion>
      )}

      {categoria === "celular" && (
        <Seccion titulo="Especificaciones Técnicas - Celular">
          <Campo label="IMEI">
            <input type="text" {...bind("imei")} />
          </Campo>
          <Campo label="Número de Teléfono">
            <input type="text" {...bind("numeroTelefono")} />
          </Campo>
          <Campo label="Almacenamiento">
            <input type="text" {...bind("almacenamiento")} placeholder="ej: 128GB" />
          </Campo>
        </Seccion>
      )}

      {categoria === "monitor" && (
        <Seccion titulo="Especificaciones Técnicas - Monitor" cols={2}>
          <Campo label="Pulgadas">
            <input type="text" {...bind("pulgadas")} placeholder="ej: 24" />
          </Campo>
        </Seccion>
      )}

      {esPerifericoSimple && (
        <Seccion titulo={`Especificaciones Técnicas - ${categories.find((c) => c.id === values.categoriaId)?.nombre}`}>
          <Campo label="Conectividad">
            <select {...bind("conectividad")}>
              <option value="">Seleccionar conectividad</option>
              <option value="usb">USB</option>
              <option value="bluetooth">Bluetooth</option>
              <option value="cable">Cable</option>
            </select>
          </Campo>
        </Seccion>
      )}

      <div className="card p-6">
        <h2 className="mb-4 text-lg font-semibold text-fg">Observaciones</h2>
        <textarea {...bind("observaciones")} rows={4} placeholder="Notas adicionales sobre el activo..." />
        <div className="mt-4">
          <Campo label="Incidencia">
            <textarea
              {...bind("incidencia")}
              rows={2}
              placeholder="Incidencias reportadas (robo, falla, etc.)..."
            />
          </Campo>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        {onCancel ? (
          <button type="button" onClick={onCancel} className={buttonClasses({ variant: "outline", className: "px-6" })}>
            Cancelar
          </button>
        ) : (
          <Link href={cancelHref ?? "/activos"} className={buttonClasses({ variant: "outline", className: "px-6" })}>
            Cancelar
          </Link>
        )}
        <Button type="submit" loading={guardando} leftIcon={<Save size={18} />} className="px-6">
          {guardando ? "Guardando..." : crear ? "Guardar Activo" : "Guardar Cambios"}
        </Button>
      </div>
    </form>
  );
}

export default ActivoForm;
