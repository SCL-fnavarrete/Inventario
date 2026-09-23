"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
    // Fondo navy de marca con un degradado suave hacia el azul primario,
    // como las secciones oscuras de sclconsultores.com.
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 px-4">
      <div className="card w-full max-w-md p-8 shadow-card-hover">
        <div className="text-center mb-8">
          <Image
            src="/logo-scl.png"
            alt="SCL Consultores"
            width={320}
            height={160}
            className="mx-auto mb-6 rounded-control"
            priority
          />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Inventario IT</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Control de Activos</p>
          <span className="mx-auto mt-4 block h-1 w-12 rounded-full bg-accent" aria-hidden="true" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <ApiErrorSummary error={error || null} />

          <div>
            <label htmlFor="email" className="field-label">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="field-input"
              placeholder="usuario@sclconsultores.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="field-input"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        {process.env.NODE_ENV === "development" && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Credenciales de prueba (solo desarrollo):</p>
            <p className="font-mono text-xs mt-1">admin@sclconsultores.com / admin123</p>
          </div>
        )}
      </div>
    </div>
  );
}
