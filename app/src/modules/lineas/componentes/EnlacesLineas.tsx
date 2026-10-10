import Link from "next/link";
import { Fragment } from "react";
import { formatearNumero } from "@/modules/lineas";

/** Numeros de las lineas de un equipo, cada uno con enlace a la ficha de la linea. */
export function EnlacesLineas({ lineas, vacio = "-" }: { lineas: { id: string; numero: string }[]; vacio?: string }) {
  if (lineas.length === 0) return <>{vacio}</>;
  return (
    <>
      {lineas.map((l, i) => (
        <Fragment key={l.id}>
          {i > 0 && ", "}
          <Link href={`/activos/lineas/${l.id}`} className="text-primary-700 hover:underline">
            {formatearNumero(l.numero)}
          </Link>
        </Fragment>
      ))}
    </>
  );
}
