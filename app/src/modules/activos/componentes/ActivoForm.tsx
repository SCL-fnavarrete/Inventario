"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { TipoFicha } from "@prisma/client";
import { normalizarImei, validarImei } from "@/modules/activos/imei";
import Link from "next/link";
import { Save } from "lucide-react";
import { CatalogSelect } from "@/shared/ui/CatalogSelect";
import { Button } from "@/shared/ui/Button";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { useCampoSede } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import {
  ESTADO_ACTIVO_LABEL,
  CONDICION_ACTIVO_LABEL,
  etiquetaEstadoActivo,
} from "@/modules/activos/estados";
import { cn } from "@/shared/cn";
import { MENSAJE_GARANTIA_ANTES_DE_COMPRA, terminaAntesDeEmpezar } from "@/shared/validaciones/ordenFechas";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { leerClp, VALOR_MAXIMO_CLP } from "@/shared/utilidades/moneda";

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
  /** Al editar: el equipo no tiene sede (se importo sin ella) y se le puede asignar (SPEC 2.117). */
  sinSede?: boolean;
  marca: string;
  modelo: string;
  numeroSerie: string;
  estado: string;
  condicion: string;
  fechaCompra: string;
  fechaGarantiaFin: string;
  // Pesos chilenos, como se escribe ("850.000"); vacio = sin valor (SPEC 2.124).
  valor: string;
  procesador: string;
  ram: string;
  almacenamiento: string;
  sistemaOperativo: string;
  imei: string;
  // "si" | "no"; "" al crear = el valor por defecto de su tipo (ver
  // cargadorAlGuardar).
  tieneCargador: string;
  pulgadas: string;
  observaciones: string;
  antivirus: string;
  incidencia: string;
  nombreEquipo: string;
  // Lugar fisico donde esta el equipo (SPEC 2.138): editable en cualquier momento.
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
  valor: "",
  procesador: "",
  ram: "",
  almacenamiento: "",
  sistemaOperativo: "",
  imei: "",
  tieneCargador: "",
  pulgadas: "",
  observaciones: "",
  antivirus: "",
  incidencia: "",
  nombreEquipo: "",
  conectividad: "",
  tipoLicenciaMicrosoft365: "",
};

type Modo = "crear" | "editar";
// Los campos que se escriben (todos menos la marca sinSede).
type CampoTexto = Exclude<keyof ActivoFormValues, "sinSede">;

// Fecha ISO -> yyyy-mm-dd para <input type="date">.
const aInputDate = (valor?: string | null) =>
  valor ? new Date(valor).toISOString().split("T")[0] : "";

/** Valores del formulario a partir de un activo de GET /api/activos/[id]. */
export function valoresDesdeActivo(asset: Record<string, unknown>): ActivoFormValues {
  const txt = (k: string) => (asset[k] == null ? "" : String(asset[k]));
  // Opciones de catalogo: llegan por su relacion, con su nombre (SPEC 2.168).
  const opcion = (k: string) => (asset[k] as { nombre?: string } | null | undefined)?.nombre ?? "";
  return {
    ...ACTIVO_FORM_VACIO,
    categoriaId: txt("categoriaId"),
    sinSede: asset.sedeId == null,
    marca: opcion("marca"),
    modelo: txt("modelo"),
    numeroSerie: txt("numeroSerie"),
    estado: txt("estado"),
    condicion: txt("condicion"),
    fechaCompra: aInputDate(asset.fechaCompra as string | null),
    fechaGarantiaFin: aInputDate(asset.fechaGarantiaFin as string | null),
    valor: asset.valor == null ? "" : Number(asset.valor).toLocaleString("es-CL"),
    procesador: txt("procesador"),
    ram: txt("ram"),
    almacenamiento: txt("discoDuro"),
    sistemaOperativo: opcion("sistemaOperativo"),
    imei: txt("imei"),
    tieneCargador: asset.tieneCargador == null ? "" : asset.tieneCargador ? "si" : "no",
    pulgadas: txt("pulgadas"),
    observaciones: txt("observaciones"),
    antivirus: opcion("antivirus"),
    incidencia: txt("incidencia"),
    nombreEquipo: txt("nombreEquipo"),
    conectividad: txt("conectividad"),
    tipoLicenciaMicrosoft365: opcion("licenciaMicrosoft365"),
  };
}

/** Cuerpo para POST (crear) o PUT (editar) de /api/activos. */
export function payloadActivo(v: ActivoFormValues, modo: Modo) {
  return {
    categoriaId: v.categoriaId,
    // La sede se fija al crear; al editar, solo si el equipo no tenia (SPEC 2.117).
    ...(modo === "crear" || (v.sinSede && v.sedeId) ? { sedeId: v.sedeId || undefined } : {}),
    marca: v.marca,
    modelo: v.modelo,
    numeroSerie: v.numeroSerie || null,
    // El estado solo se envia al crear (siempre "disponible"): al editar no
    // cambia, lo mueven los procesos (SPEC 2.86).
    ...(modo === "crear" ? { estado: v.estado } : {}),
    condicion: v.condicion,
    fechaCompra: v.fechaCompra || null,
    fechaGarantiaFin: v.fechaGarantiaFin || null,
    valor: v.valor.trim() || null,
    procesador: v.procesador || null,
    ram: v.ram || null,
    discoDuro: v.almacenamiento || null,
    sistemaOperativo: v.sistemaOperativo || null,
    imei: v.imei || null,
    // Sin indicar no se envia: no pisa lo que ya tenia.
    ...(v.tieneCargador ? { tieneCargador: v.tieneCargador === "si" } : {}),
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

// La categoria dice que campos pide (SPEC 2.112.7); el formulario ya no la
// reconoce por su nombre.
type CategoriaFormulario = Opcion & { tipoFicha: TipoFicha };

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
  imei: "IMEI",
  sedeId: "Sede",
  valor: "Valor",
  fechaGarantiaFin: "Fin de garantía",
};

/** Formulario dentro de una ventana: tarjetas y espacios mas chicos. */
const EnVentanaContext = createContext(false);

function Seccion({ titulo, cols = 3, children }: { titulo: string; cols?: 2 | 3; children: ReactNode }) {
  const enVentana = useContext(EnVentanaContext);
  return (
    <div className={enVentana ? "rounded-lg border border-line p-4" : "card p-6"}>
      <h2 className={enVentana ? "mb-3 text-base font-semibold text-fg" : "mb-4 text-lg font-semibold text-fg"}>
        {titulo}
      </h2>
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2",
          enVentana ? "gap-3" : "gap-4",
          cols === 3 && "lg:grid-cols-3"
        )}
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
  // Sede al crear: precargada con la del navbar o la propia (useCampoSede,
  // SPEC 2.80). Al editar no se muestra: el activo conserva la suya, salvo que
  // no tenga (importado sin sede): entonces se le asigna aqui una vez (SPEC 2.117).
  const [sedeElegida, setSedeId] = useCampoSede();
  const sedeId = sedeFija ?? sedeElegida;

  const [values, setValues] = useState<ActivoFormValues>(initialValues);
  const [categories, setCategories] = useState<CategoriaFormulario[]>([]);
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
    if (crear || initialValues.sinSede) {
      fetch("/api/sedes")
        .then((r) => r.json())
        .then((data) => setSedes(Array.isArray(data) ? data : []))
        .catch(() => setSedes([]));
    }
  }, [crear, initialValues.sinSede]);

  const set = (name: CampoTexto) => (valor: string) =>
    setValues((prev) => ({ ...prev, [name]: valor }));
  const bind = (name: CampoTexto) => ({
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
    if (!values.marca.trim()) e.marca = "Elige la marca";
    if (!values.modelo.trim()) e.modelo = "Escribe el modelo";
    // Lo que identifica al equipo (SPEC 2.112.7): el IMEI en los celulares
    // (el N° de serie ahi es opcional) y el N° de serie en los demas.
    const esCelular = categories.find((c) => c.id === values.categoriaId)?.tipoFicha === "celular";
    if (crear && !esCelular && !values.numeroSerie.trim()) e.numeroSerie = "Escribe el número de serie";
    if (esCelular && !normalizarImei(values.imei)) e.imei = "Escribe el IMEI del celular";
    else if (values.imei.trim() && validarImei(values.imei)) e.imei = validarImei(values.imei)!;
    if (crear && !sedeId) e.sedeId = "Elige la sede";
    // La garantia es opcional, pero si se escribe no puede terminar antes de la compra.
    if (terminaAntesDeEmpezar(values.fechaCompra, values.fechaGarantiaFin)) {
      e.fechaGarantiaFin = MENSAJE_GARANTIA_ANTES_DE_COMPRA;
    }
    const valor = leerClp(values.valor);
    if (valor !== null && (Number.isNaN(valor) || valor > VALOR_MAXIMO_CLP)) {
      e.valor = "Escribe un monto en pesos, sin decimales (máximo $999.999.999)";
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reportar(validar())) return;
    setGuardando(true);
    try {
      const conCargador = { ...values, tieneCargador: cargadorAlGuardar(values.tieneCargador) };
    await onSubmit(crear ? { ...conCargador, sedeId } : conCargador);
    } finally {
      setGuardando(false);
    }
  }

  const categoriaElegida = categories.find((c) => c.id === values.categoriaId);
  const ficha = categoriaElegida?.tipoFicha;
  // Computadores y celulares se entregan con cargador salvo que se diga lo
  // contrario; con "Si", al entregarlo y devolverlo se pregunta su estado y
  // va en el acta (SPEC 2.112.7). Los demas tipos no llevan cargador. Antes
  // un computador creado a mano quedaba sin cargador y nunca se preguntaba.
  const llevaCargador = ficha === "computador" || ficha === "celular";
  function cargadorAlGuardar(valor: string) {
    if (!llevaCargador) return crear ? "no" : valor;
    return valor || "si";
  }
  const campoCargador = (
    <Campo label="Cargador" hint="Con «Sí», al entregarlo y devolverlo se pregunta el estado del cargador y va en el acta.">
      <select {...bind("tieneCargador")} value={values.tieneCargador || "si"}>
        <option value="si">Sí, se entrega con cargador</option>
        <option value="no">No</option>
      </select>
    </Campo>
  );

  const formulario = (
    <form onSubmit={handleSubmit} className={onCancel ? "space-y-4" : "space-y-6"} noValidate>
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
          {/* De una lista (SPEC 2.116.4): cada marca se escribe de una sola forma. */}
          <CatalogSelect
            endpoint="/api/marcas"
            value={values.marca}
            onChange={(v) => {
              set("marca")(v);
              limpiar("marca");
            }}
            placeholder="Selecciona una marca"
          />
        </Campo>
        <Campo label="Modelo *" error={error("modelo")}>
          <input type="text" {...bind("modelo")} required />
        </Campo>
        <Campo label={crear && ficha !== "celular" ? "Número de Serie *" : "Número de Serie"} error={error("numeroSerie")}>
          <input type="text" {...bind("numeroSerie")} required={crear && ficha !== "celular"} />
        </Campo>
        <Campo label="Estado">
          <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-fg-muted">
            {crear
              ? ESTADO_ACTIVO_LABEL.disponible
              : etiquetaEstadoActivo(values.estado)}
          </p>
          {!crear && (
            <p className="mt-1 text-xs text-fg-subtle">
              El estado cambia con su proceso: solicitudes, mantenciones o baja.
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
        <Campo
          label="Valor (CLP)"
          error={error("valor")}
          hint="Opcional. Cuánto vale el equipo, en pesos. Si cambia, queda en el historial."
        >
          <input type="text" inputMode="numeric" placeholder="Ej: 850.000" {...bind("valor")} />
        </Campo>
        {crear && !sedeFija && (
          <Campo
            label={
              <>
                Sede <span className="text-red-500">*</span>
              </>
            }
            hint="Obligatorio: a qué sede pertenece este equipo."
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
        {!crear && values.sinSede && (
          <Campo label="Sede" hint="Este equipo no tiene sede. Asígnala aquí; después solo cambia con una Guía de Despacho." error={error("sedeId")}>
            <select {...bind("sedeId")}>
              <option value="">Sin sede</option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </Seccion>

      {ficha === "computador" && (
        <Seccion titulo={`Especificaciones Técnicas - ${categoriaElegida?.nombre}`}>
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
          {campoCargador}
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

      {ficha === "celular" && (
        <Seccion titulo={`Especificaciones Técnicas - ${categoriaElegida?.nombre}`}>
          <Campo label="IMEI *" error={error("imei")} hint="15 números. Se ve marcando *#06# en el teléfono.">
            <input type="text" inputMode="numeric" {...bind("imei")} required />
          </Campo>
          <Campo label="Procesador">
            <input type="text" {...bind("procesador")} placeholder="ej: Snapdragon 8 Gen 2" />
          </Campo>
          <Campo label="RAM">
            <input type="text" {...bind("ram")} placeholder="ej: 8GB" />
          </Campo>
          <Campo label="Almacenamiento">
            <input type="text" {...bind("almacenamiento")} placeholder="ej: 128GB" />
          </Campo>
          <Campo label="Sistema Operativo">
            <CatalogSelect
              endpoint="/api/sistemas-operativos"
              value={values.sistemaOperativo}
              onChange={set("sistemaOperativo")}
              placeholder="Selecciona un sistema operativo (ej: Android 14)"
            />
          </Campo>
          {campoCargador}
        </Seccion>
      )}

      {ficha === "monitor" && (
        <Seccion titulo={`Especificaciones Técnicas - ${categoriaElegida?.nombre}`} cols={2}>
          <Campo label="Pulgadas">
            <input type="text" {...bind("pulgadas")} placeholder="ej: 24" />
          </Campo>
        </Seccion>
      )}

      {ficha === "periferico" && (
        <Seccion titulo={`Especificaciones Técnicas - ${categoriaElegida?.nombre}`}>
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

      <div className={onCancel ? "rounded-lg border border-line p-4" : "card p-6"}>
        <h2 className={onCancel ? "mb-3 text-base font-semibold text-fg" : "mb-4 text-lg font-semibold text-fg"}>Observaciones</h2>
        <textarea {...bind("observaciones")} rows={onCancel ? 2 : 4} placeholder="Notas adicionales sobre el activo..." />
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

  return <EnVentanaContext.Provider value={!!onCancel}>{formulario}</EnVentanaContext.Provider>;
}

export default ActivoForm;
