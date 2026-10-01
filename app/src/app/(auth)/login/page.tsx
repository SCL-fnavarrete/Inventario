"use client";

import { useEffect, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/Button";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { Logo } from "@/shared/ui/Logo";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/shared/ui/CampoFormulario";
import { InputClave } from "@/shared/ui/InputClave";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { CLAVE_AVISO_OTRA_SESION } from "@/shared/ui/AvisoOtraSesion";

// Se inicia sesion con el usuario, no con el correo (SPEC 2.122).
const ETIQUETAS = { usuario: "Usuario", password: "Contraseña" };

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Llego aqui porque su sesion dejo de valer (SPEC 2.127): no se sabe si
  // vencio, se inicio en otro equipo o la cerro un administrador.
  const [sesionCerrada, setSesionCerrada] = useState(false);
  useEffect(() => {
    setSesionCerrada(new URLSearchParams(window.location.search).get("sesion") === "cerrada");
  }, []);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.105).
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const faltan: Record<string, string> = {};
    if (!usuario.trim()) faltan.usuario = "Escribe tu usuario";
    if (!password) faltan.password = "Escribe tu contraseña";
    if (reportar(faltan)) return;
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        usuario,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        // Si al entrar se cerro otra sesion abierta, se avisa ya dentro (SPEC 2.127).
        const sesion = await getSession();
        if (sesion?.user?.otraSesionCerrada) {
          try {
            sessionStorage.setItem(CLAVE_AVISO_OTRA_SESION, "1");
          } catch {
            // Sin almacenamiento del navegador, solo no se muestra el aviso.
          }
        }
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
          {sesionCerrada && !error && (
            <p role="status" className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-fg-muted">
              Tu sesión se cerró. Puede haber vencido, haberse iniciado con tu usuario en otro equipo o haberla
              cerrado un administrador. Vuelve a iniciar sesión.
            </p>
          )}
          <ResumenErrores mensaje={resumen} />
          <ApiErrorSummary error={error || null} />

          <div>
            <label htmlFor="usuario" className="field-label">
              Usuario
            </label>
            <input
              id="usuario"
              type="text"
              value={usuario}
              onChange={(e) => {
                setUsuario(e.target.value);
                limpiar("usuario");
              }}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errores.usuario}
              className={claseCampo(errores.usuario)}
              placeholder="jsoto"
            />
            <MensajeCampo mensaje={errores.usuario} />
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
