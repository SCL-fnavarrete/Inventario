import { render, screen } from "@testing-library/react";
import { CampoFormulario, CampoTexto } from "@/shared/ui/CampoFormulario";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";

// Auditoria 27-sep-2026, 2.13: el lector de pantalla anuncia los errores y
// los lee al entrar al campo.

test("un campo nativo queda unido a su mensaje de error", () => {
  render(
    <CampoFormulario label="Marca" error="La marca es requerida">
      <input />
    </CampoFormulario>
  );
  expect(screen.getByLabelText("Marca")).toHaveAccessibleDescription("La marca es requerida");
});

test("también a su texto de ayuda si no hay error", () => {
  render(
    <CampoFormulario label="RUT" ayuda="Sin puntos ni guion">
      <input />
    </CampoFormulario>
  );
  expect(screen.getByLabelText("RUT")).toHaveAccessibleDescription("Sin puntos ni guion");
});

test("sin error ni ayuda no apunta a nada", () => {
  render(
    <CampoFormulario label="Modelo">
      <input />
    </CampoFormulario>
  );
  expect(screen.getByLabelText("Modelo")).not.toHaveAttribute("aria-describedby");
});

test("CampoTexto (componente) también queda unido a su error", () => {
  render(<CampoTexto label="Nombre" value="" onChange={() => {}} error="El nombre es requerido" />);
  expect(screen.getByLabelText("Nombre")).toHaveAccessibleDescription("El nombre es requerido");
});

test("el cartel de error de la API se anuncia", () => {
  render(<ApiErrorSummary error="No se pudo guardar" />);
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar");
});
