"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/Button";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { Logo } from "@/shared/ui/Logo";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/shared/ui/CampoFormulario";
import { InputClave } from "@/shared/ui/InputClave";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { esCorreoValido } from "@/shared/utilidades/text";

const ETIQUETAS = { email: "Correo electrónico", password: "Contraseña" };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.105).
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const faltan: Record<string, string> = {};
    if (!email.trim()) faltan.email = "Escribe tu correo";
    else if (!esCorreoValido(email)) faltan.email = "El correo no es válido";
    if (!password) faltan.password = "Escribe tu contraseña";
    if (reportar(faltan)) return;
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    // Fondo navy de marca (fijo en ambos temas) con halos radiantes celeste
    // y naranjo, como las secciones oscuras de sclconsultores.com.
    <div className="relative min-h-screen flex items-center justify-center px-4 bg-navy bg-[radial-gradient(ellipse_70%_60%_at_100%_0%,--alpha(var(--color-primary-500)/45%),transparent_65%),radial-gradient(ellipse_60%_50%_at_0%_100%,--alpha(var(--color-accent)/18%),transparent_60%)]">
      <ThemeToggle className="absolute top-4 right-4 text-white/80 hover:bg-white/10 hover:text-white" />
      <div className="card w-full max-w-md p-8 shadow-card-hover">
        <div className="text-center mb-8">
          <Logo className="mx-auto mb-6 h-14" priority />
          <h1 className="text-2xl font-bold tracking-tight text-fg">Inventario IT</h1>
          <p className="text-fg-subtle text-sm mt-1">Sistema de Control de Activos</p>
          <span className="mx-auto mt-4 block h-1 w-12 rounded-full bg-accent" aria-hidden="true" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <ResumenErrores mensaje={resumen} />
          <ApiErrorSummary error={error || null} />

          <div>
            <label htmlFor="email" className="field-label">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                limpiar("email");
              }}
              autoComplete="username"
              aria-invalid={!!errores.email}
              className={claseCampo(errores.email)}
              placeholder="usuario@sclconsultores.com"
            />
            <MensajeCampo mensaje={errores.email} />
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Contraseña
            </label>
            <InputClave
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                limpiar("password");
              }}
              autoComplete="current-password"
              aria-invalid={!!errores.password}
              className={claseCampo(errores.password)}
              placeholder="••••••••"
            />
            <MensajeCampo mensaje={errores.password} />
          </div>

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
