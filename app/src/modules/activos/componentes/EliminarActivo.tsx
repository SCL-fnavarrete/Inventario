"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { useToast } from "@/shared/ui/Toast";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { parseApiError } from "@/shared/utilidades/apiErrors";

/** Borra de la base un equipo ingresado por error (SPEC 2.130). Solo se muestra si se puede. */
export function EliminarActivo({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const eliminar = async () => {
    setEnviando(true);
    const res = await fetch(`/api/activos/${id}`, { method: "DELETE" }).catch(() => null);
    setEnviando(false);
    setAbierto(false);
    if (!res?.ok) {
      const { message } = res
        ? await parseApiError(res, "Error al eliminar el equipo")
        : { message: "Error al eliminar el equipo" };
      toast.error(message);
      return;
    }
    toast.success("Equipo eliminado");
    router.push("/activos");
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={buttonClasses({ variant: "danger" })}>
        <Trash2 size={18} />
        <span>Eliminar</span>
      </button>
      <ConfirmDialog
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        onConfirm={eliminar}
        loading={enviando}
        variant="danger"
        title="Eliminar equipo"
        message={`${nombre} se borrará para siempre, con su historial. Úsalo solo si se ingresó por error. En la auditoría quedará quién lo eliminó.`}
        confirmLabel="Eliminar"
      />
    </>
  );
}
