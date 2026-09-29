import { fireEvent, render, screen } from "@testing-library/react";
import {
  CLAVES,
  COORDINACION_VACIA,
  cuerpoCoordinacion,
  erroresCoordinacion,
  type Coordinacion,
} from "@/modules/solicitudes/componentes/nueva/coordinacion";
import { SeccionCoordinacion } from "@/modules/solicitudes/componentes/nueva/SeccionCoordinacion";
import { ElegirEstadoDevolucion } from "@/modules/solicitudes/componentes/nueva/ElegirEstadoDevolucion";
import { SeccionKitEpp } from "@/modules/solicitudes/componentes/nueva/SeccionKitEpp";

// Auditoria 28-sep-2026 (3.6): piezas sacadas de Nueva Solicitud. Tienen que
// mandar al servidor exactamente lo mismo que antes.

describe("coordinación: datos para el servidor", () => {
  const presencial: Coordinacion = { ...COORDINACION_VACIA, fecha: "2026-10-01T10:00", lugar: "Oficina" };

  test("presencial manda fecha, medio y lugar, con los nombres de la API", () => {
    const cuerpo = cuerpoCoordinacion(presencial, CLAVES.entrega);
    expect(cuerpo.medioEntrega).toBe("presencial");
    expect(cuerpo.lugarEntrega).toBe("Oficina");
    expect(cuerpo.otChilexpressEntrega).toBeUndefined();
    expect(cuerpo.ciudadEntrega).toBeUndefined();
    expect(typeof cuerpo.fechaEntregaCoordinada).toBe("string");
  });

  test("Chilexpress manda OT y destino, no el lugar", () => {
    const cuerpo = cuerpoCoordinacion(
      { ...presencial, medio: "chilexpress", ot: "CH-1", ciudad: "Concepción" },
      CLAVES.devolucion
    );
    expect(cuerpo).toMatchObject({ medioDevolucion: "chilexpress", otChilexpress: "CH-1", ciudadDevolucion: "Concepción" });
    expect(cuerpo.lugarDevolucion).toBeUndefined();
  });

  test("valida lo obligatorio según el medio, con las claves de error de cada tipo", () => {
    expect(erroresCoordinacion(COORDINACION_VACIA, CLAVES.cambio, "falta")).toEqual({
      fechaCambioCoordinada: "falta",
      lugarCambio: "falta",
    });
    expect(
      erroresCoordinacion({ ...COORDINACION_VACIA, medio: "chilexpress", fecha: "x", ot: " " }, CLAVES.entrega, "falta")
    ).toEqual({ otChilexpressEntrega: "falta", ciudadEntrega: "falta" });
    expect(erroresCoordinacion(presencial, CLAVES.entrega, "falta")).toEqual({});
  });
});

describe("SeccionCoordinacion", () => {
  const props = {
    titulo: "Coordinar Entrega",
    claves: CLAVES.entrega,
    etiquetas: { fechaPresencial: "Fecha de entrega", fechaDespacho: "Fecha estimada", lugar: "Lugar de entrega" },
  };

  test("muestra el lugar en presencial y OT/destino al elegir Chilexpress, limpiando el error que ya no aplica", () => {
    const onChange = jest.fn();
    const limpiarError = jest.fn();
    const { rerender } = render(
      <SeccionCoordinacion {...props} valor={COORDINACION_VACIA} onChange={onChange} errores={{}} limpiarError={limpiarError} />
    );
    expect(screen.getByLabelText(/Lugar de entrega/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Despacho (Chilexpress)"));
    expect(onChange).toHaveBeenCalledWith({ ...COORDINACION_VACIA, medio: "chilexpress" });
    expect(limpiarError).toHaveBeenCalledWith("lugarEntrega");

    rerender(
      <SeccionCoordinacion
        {...props}
        valor={{ ...COORDINACION_VACIA, medio: "chilexpress" }}
        onChange={onChange}
        errores={{ otChilexpressEntrega: "Este dato es obligatorio" }}
        limpiarError={limpiarError}
      />
    );
    expect(screen.getByLabelText(/N° de OT Chilexpress/)).toHaveAccessibleDescription("Este dato es obligatorio");
    expect(screen.getByLabelText(/Fecha estimada/)).toBeInTheDocument();
  });

  test("el grupo de medio se anuncia con su nombre", () => {
    render(<SeccionCoordinacion {...props} valor={COORDINACION_VACIA} onChange={() => {}} errores={{}} limpiarError={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Medio" })).toBeInTheDocument();
  });
});

test("ElegirEstadoDevolucion entrega el estado elegido y usa el texto de recuperación", () => {
  const onElegir = jest.fn();
  render(
    <ElegirEstadoDevolucion nombre="d-1" etiqueta="Dell" valor={undefined} onElegir={onElegir} textoNoDevuelto="Sigue sin devolver" />
  );
  fireEvent.click(screen.getByLabelText("Dañado"));
  expect(onElegir).toHaveBeenCalledWith("danado");
  expect(screen.getByRole("radiogroup", { name: "Estado de devolución: Dell" })).toBeInTheDocument();
  expect(screen.getByLabelText("Sigue sin devolver")).toBeInTheDocument();
});

test("SeccionKitEpp: al marcar una categoría elige 1 de cada artículo", () => {
  const onSolicitar = jest.fn();
  let cantidades: Record<string, number> = {};
  const onCantidades = jest.fn((cambiar) => (cantidades = cambiar(cantidades)));
  render(
    <SeccionKitEpp
      catalogo={[
        { id: "a", nombre: "Casco", categoria: "epp", cantidad: 3 },
        { id: "b", nombre: "Guantes", categoria: "epp", cantidad: 0 },
        { id: "c", nombre: "Taza", categoria: "kit_bienvenida", cantidad: 5 },
      ]}
      bloqueado={false}
      solicitado={{ kit_bienvenida: false, epp: false }}
      onSolicitar={onSolicitar}
      cantidades={{}}
      onCantidades={onCantidades}
      limpiarError={() => {}}
    />
  );
  fireEvent.click(screen.getByLabelText("EPP"));
  expect(onSolicitar).toHaveBeenCalledWith("epp", true);
  expect(cantidades).toEqual({ a: 1, b: 1 });
});
