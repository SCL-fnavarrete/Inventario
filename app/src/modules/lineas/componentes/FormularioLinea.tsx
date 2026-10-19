'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { DESCRIPCION_ESTADO, destinosPermitidos, formatearNumero } from '@/modules/lineas';
import { ListaConBuscador } from '@/modules/lineas/componentes/ListaConBuscador';
import {
  OPCIONES_VACIAS,
  nombreCelular,
  nombrePersona,
  type LineaLista,
  type OpcionesLinea,
} from '@/modules/lineas/componentes/tipos';
import { parseApiError } from '@/shared/utilidades/apiErrors';
import { hoyISO } from '@/shared/utilidades/fechas';
import { useEnvio } from '@/shared/hooks/useEnvio';
import { useErroresFormulario } from '@/shared/hooks/useErroresFormulario';
import { Button } from '@/shared/ui/Button';
import {
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseInput,
} from '@/shared/ui/CampoFormulario';
import { CatalogSelect } from '@/shared/ui/CatalogSelect';
import { useToast } from '@/shared/ui/Toast';

/**
 * Formulario de una linea (SPEC 2.131), para crearla o editarla. Al crear se
 * piden sus datos (numero, tipo de chip, operador y fecha de contratacion) y,
 * opcional, a que se asocia segun su tipo de chip: un chip fisico a un celular
 * de la empresa; una eSIM a una persona (telefono personal). Al editar, donde
 * esta y con quien no se tocan: eso es Asignar. Un cambio de estado pide desde
 * cuando rige. Solo baja la pantalla si el formulario no se ve, para no moverla
 * de mas.
 */

const ETIQUETAS = {
  numero: 'Número',
  activoId: 'Celular',
  empleadoId: 'Persona',
  tipoChipId: 'Tipo de chip',
  operadorId: 'Operador',
  estadoId: 'Estado',
  vigenteDesde: 'Rige desde',
  sedeId: 'Sede',
};

const FORM_INICIAL = {
  numero: '',
  estadoId: '',
  vigenteDesde: '',
  tipoChipId: '',
  operadorId: '',
  activoId: '',
  empleadoId: '',
  sedeId: '',
  observaciones: '',
};
type Form = typeof FORM_INICIAL;

export function FormularioLinea({
  linea,
  onCerrar,
}: {
  linea: LineaLista | null;
  onCerrar: (guardada: boolean) => void;
}) {
  const nueva = !linea;
  const toast = useToast();
  const { enviando, ejecutar } = useEnvio();
  const [opciones, setOpciones] = useState<OpcionesLinea>(OPCIONES_VACIAS);
  const [form, setForm] = useState<Form>(() =>
    linea
      ? {
          ...FORM_INICIAL,
          numero: formatearNumero(linea.numero),
          estadoId: linea.estado.id,
          vigenteDesde: hoyISO(),
          tipoChipId: linea.tipoChip?.id ?? '',
          operadorId: linea.operador?.id ?? '',
          observaciones: linea.observaciones ?? '',
        }
      : { ...FORM_INICIAL, vigenteDesde: hoyISO() }
  );
  const [error, setError] = useState('');
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);
  const ref = useRef<HTMLDivElement>(null);
  const idForm = useId();

  useEffect(() => {
    fetch('/api/lineas/opciones').then(async (r) => r.ok && setOpciones(await r.json()));
  }, []);

  // Si el formulario no se ve (por ejemplo, se abrio desde una fila lejos del inicio), la pantalla va hasta el.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { top } = el.getBoundingClientRect();
    if (top < 80 || top > window.innerHeight * 0.6)
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const cambiar = (campo: keyof Form, valor: string) => {
    setForm((prev) => {
      const nuevo = { ...prev, [campo]: valor };
      // Al cambiar el tipo de chip se quita la asociacion que ya no corresponde.
      if (campo === 'tipoChipId') {
        const permitidos = destinosPermitidos(opciones.tiposChip.find((t) => t.id === valor));
        if (!permitidos.includes('telefono')) nuevo.activoId = '';
        if (!permitidos.includes('persona')) nuevo.empleadoId = '';
      }
      return nuevo;
    });
    limpiar(campo);
  };

  const guardar = async () => {
    const faltan: Record<string, string> = {};
    if (!form.numero.trim()) faltan.numero = 'Escribe el número';
    // Lo que pide una línea nueva (las importadas pueden no traerlo todavía).
    if (nueva) {
      if (!form.tipoChipId) faltan.tipoChipId = 'Elige el tipo de chip';
      if (!form.operadorId) faltan.operadorId = 'Elige el operador';
    }
    if (reportar(faltan)) return;
    const res = await fetch(nueva ? '/api/lineas' : `/api/lineas/${linea.id}`, {
      method: nueva ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null);
    if (!res?.ok) {
      const { message, fieldErrors } = res
        ? await parseApiError(res, 'Error al guardar la línea')
        : { message: 'Error al guardar la línea', fieldErrors: {} };
      if (!reportarServidor(fieldErrors)) setError(message);
      return;
    }
    toast.success(nueva ? 'Línea creada' : 'Línea guardada');
    onCerrar(true);
  };

  // A que se puede asociar segun el tipo de chip: fisico -> celular; eSIM -> persona.
  const permitidos = destinosPermitidos(opciones.tiposChip.find((t) => t.id === form.tipoChipId));
  // Persona del celular elegido, para mostrarla al crear.
  const personaDelCelular =
    opciones.celulares.find((c) => c.id === form.activoId)?.empleadoActual ?? null;
  // "Rige desde" importa al crear y cuando cambia el estado.
  const pideVigencia = nueva || form.estadoId !== linea.estado.id;
  // Sin estado elegido (opciones que aun no cargaban), la linea queda Activa.
  const estadoIdMostrado =
    form.estadoId || opciones.estados.find((e) => e.clave === 'activa')?.id || '';
  const estadoElegido = opciones.estados.find((e) => e.id === estadoIdMostrado);

  return (
    <div ref={ref} className="card scroll-mt-24 p-6">
      <h2 className="mb-4 text-lg font-semibold text-fg">
        {nueva ? 'Nueva línea' : `Editar línea ${formatearNumero(linea.numero)}`}
      </h2>
      <div className="mb-4 empty:hidden">
        <ResumenErrores mensaje={resumen || error} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CampoTexto
          label="Número"
          obligatorio
          value={form.numero}
          onChange={(v) => cambiar('numero', v)}
          error={errores.numero}
          placeholder="Ej: 9 1234 5678"
        />
        <CampoFormulario
          label="Estado"
          error={errores.estadoId}
          htmlFor={`${idForm}-estado`}
          ayuda={estadoElegido ? DESCRIPCION_ESTADO[estadoElegido.clave ?? ''] : undefined}
        >
          <select
            id={`${idForm}-estado`}
            value={estadoIdMostrado}
            onChange={(e) => cambiar('estadoId', e.target.value)}
            className={claseInput(errores.estadoId)}
          >
            {/* Dar de baja pide el motivo y tiene su propio boton (SPEC 2.140): aqui solo se reactiva. */}
            {opciones.estados
              .filter((e) => !e.deBaja || e.id === linea?.estado.id)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
          </select>
        </CampoFormulario>

        <CampoFormulario
          label="Tipo de chip"
          obligatorio={nueva}
          error={errores.tipoChipId}
          htmlFor={`${idForm}-chip`}
          ayuda={
            nueva ? 'Define a qué se asocia: físico a un celular, eSIM a una persona.' : undefined
          }
        >
          <CatalogSelect
            id={`${idForm}-chip`}
            endpoint="/api/lineas/catalogos/tipos-chip"
            usarId
            value={form.tipoChipId}
            onChange={(v) => cambiar('tipoChipId', v)}
            placeholder={nueva ? 'Elige el tipo de chip' : 'Sin indicar'}
            actual={linea?.tipoChip}
            invalido={!!errores.tipoChipId}
          />
        </CampoFormulario>

        <CampoFormulario
          label="Operador"
          obligatorio={nueva}
          error={errores.operadorId}
          htmlFor={`${idForm}-operador`}
        >
          <CatalogSelect
            id={`${idForm}-operador`}
            endpoint="/api/lineas/catalogos/operadores"
            usarId
            value={form.operadorId}
            onChange={(v) => cambiar('operadorId', v)}
            placeholder={nueva ? 'Elige el operador' : 'Sin indicar'}
            actual={linea?.operador}
            invalido={!!errores.operadorId}
          />
        </CampoFormulario>

        {pideVigencia && (
          <CampoTexto
            label={nueva ? 'Fecha de contratación' : 'Rige desde'}
            type="date"
            max={hoyISO()}
            value={form.vigenteDesde}
            onChange={(v) => cambiar('vigenteDesde', v)}
            error={errores.vigenteDesde}
            ayuda={estadoElegido?.deBaja ? 'Será su fecha de baja.' : undefined}
          />
        )}
        {nueva && (
          <CampoFormulario
            label="Sede"
            error={errores.sedeId}
            htmlFor={`${idForm}-sede`}
            ayuda="Opcional: dónde se guarda el chip mientras no está en un teléfono."
          >
            <select
              id={`${idForm}-sede`}
              value={form.sedeId}
              onChange={(e) => cambiar('sedeId', e.target.value)}
              aria-invalid={!!errores.sedeId}
              className={claseInput(errores.sedeId)}
            >
              <option value="">Sin sede</option>
              {opciones.sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </CampoFormulario>
        )}
        <CampoFormulario
          label="Observaciones"
          className={nueva ? 'md:col-span-2 lg:col-span-4' : 'md:col-span-2'}
        >
          <textarea
            rows={2}
            value={form.observaciones}
            onChange={(e) => cambiar('observaciones', e.target.value)}
            className={claseInput()}
          />
        </CampoFormulario>

        {nueva && (
          // A que se asocia (opcional): depende del tipo de chip.
          <div
            role="group"
            aria-label="Asociar (opcional)"
            className="grid grid-cols-1 gap-4 border-t border-line pt-4 md:col-span-2 md:grid-cols-2 lg:col-span-4"
          >
            <p className="text-sm font-semibold text-fg md:col-span-2">Asociar (opcional)</p>
            {permitidos.includes('telefono') ? (
              <>
                <ListaConBuscador
                  label="Celular de la empresa"
                  valor={form.activoId}
                  onChange={(v) => cambiar('activoId', v)}
                  error={errores.activoId}
                  vacio="Sin celular por ahora"
                  buscar="Buscar por marca, modelo o IMEI"
                  opciones={opciones.celulares.map((c) => ({ id: c.id, texto: nombreCelular(c) }))}
                />
                <CampoFormulario label="Persona">
                  <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg-muted">
                    {!form.activoId
                      ? 'La que tenga el celular'
                      : personaDelCelular
                        ? `${nombrePersona(personaDelCelular)} (la tiene quien usa el celular)`
                        : 'El celular no está asignado a nadie'}
                  </p>
                </CampoFormulario>
              </>
            ) : permitidos.includes('persona') ? (
              <>
                <CampoFormulario label="Teléfono">
                  <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg-muted">
                    Teléfono personal
                  </p>
                </CampoFormulario>
                <ListaConBuscador
                  label="Persona"
                  valor={form.empleadoId}
                  onChange={(v) => cambiar('empleadoId', v)}
                  error={errores.empleadoId}
                  vacio="Sin persona por ahora"
                  buscar="Buscar por nombre o RUT"
                  opciones={opciones.personas.map((p) => ({
                    id: p.id,
                    texto: nombrePersona(p) + (p.rut ? ` · ${p.rut}` : ''),
                  }))}
                />
              </>
            ) : (
              <p className="text-sm text-fg-subtle md:col-span-2">
                Elige el tipo de chip para asociarla: un chip físico va en un celular de la empresa;
                una eSIM, con una persona.
              </p>
            )}
          </div>
        )}
        {!nueva && (
          <p className="text-sm text-fg-subtle md:col-span-2 lg:col-span-4">
            Dónde está la línea y quién la tiene no se cambian aquí: si está disponible, usa{' '}
            <b>Asignar</b>; si está asignada, cambia con las solicitudes.
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Button variant="outline" onClick={() => onCerrar(false)}>
          Cancelar
        </Button>
        <Button loading={enviando} leftIcon={<Save size={18} />} onClick={() => ejecutar(guardar)}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
