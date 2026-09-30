'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Can } from '@/shared/ui/Can';
import { Button } from '@/shared/ui/Button';
import { buttonClasses } from '@/shared/ui/buttonStyles';
import { claseInput, MensajeCampo } from '@/shared/ui/CampoFormulario';
import { parseApiError } from '@/shared/utilidades/apiErrors';

/**
 * ID del ticket de la ticketera (SPEC 2.123), en el encabezado del detalle.
 * Se puede agregar o corregir (tambien a solicitudes anteriores que no lo
 * tienen), pero no dejar vacio.
 */
export function TicketSolicitud({
  solicitudId,
  idTicket,
  onGuardado,
}: {
  solicitudId: string;
  idTicket: string | null;
  onGuardado: (idTicket: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setValor(idTicket ?? '');
    setError('');
    setEditando(true);
  };

  const guardar = async () => {
    if (!valor.trim()) return setError('Escribe el ID del ticket');
    setGuardando(true);
    try {
      const res = await fetch(`/api/solicitudes/${solicitudId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idTicket: valor }),
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, 'Error al guardar el ticket');
        return setError(fieldErrors.idTicket ?? message);
      }
      onGuardado((await res.json()).idTicket);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  };

  if (editando) {
    return (
      <div className="mt-1 flex flex-wrap items-start gap-2">
        <div>
          <input
            aria-label="ID Ticket"
            value={valor}
            maxLength={50}
            autoFocus
            onChange={(e) => {
              setValor(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && guardar()}
            aria-invalid={!!error}
            className={claseInput(error)}
            placeholder="Ej: 45821"
          />
          <MensajeCampo mensaje={error} />
        </div>
        <Button size="sm" loading={guardando} onClick={guardar}>
          Guardar
        </Button>
        <button onClick={() => setEditando(false)} className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <p className="flex items-center gap-1 text-sm text-fg-muted">
      Ticket: <span className="font-medium text-fg">{idTicket || 'sin ticket'}</span>
      <Can recurso="solicitudes" accion="write">
        <button
          onClick={abrir}
          className="rounded p-1 text-primary-700 hover:bg-primary-50"
          title={idTicket ? 'Corregir el ID del ticket' : 'Agregar el ID del ticket'}
          aria-label={idTicket ? 'Corregir el ID del ticket' : 'Agregar el ID del ticket'}
        >
          <Pencil size={14} />
        </button>
      </Can>
    </p>
  );
}
