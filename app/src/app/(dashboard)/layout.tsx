import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/shared/auth/opciones";
import { Navbar } from "@/shared/ui/layout/Navbar";
import { SessionProvider } from "@/shared/ui/providers/SessionProvider";
import { SedeSeleccionadaProvider } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { ToastProvider } from "@/shared/ui/Toast";
import { AvisoOtraSesion } from "@/shared/ui/AvisoOtraSesion";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    // Con cookie de sesion pero sin sesion valida: vencio, se inicio en otro
    // equipo o la cerro un administrador. El login lo explica (SPEC 2.127).
    const almacen = await cookies();
    const habiaSesion =
      almacen.has("next-auth.session-token") || almacen.has("__Secure-next-auth.session-token");
    redirect(habiaSesion ? "/login?sesion=cerrada" : "/login");
  }

  return (
    <SessionProvider>
      <SedeSeleccionadaProvider>
        <ToastProvider position="top-right">
          <AvisoOtraSesion />
          {/* Skip to content link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand focus:text-white focus:rounded-lg focus:shadow-lg"
          >
            Ir al contenido principal
          </a>
          <div className="min-h-screen">
            <Navbar />
            <main id="main-content" className="mx-auto w-full max-w-screen-2xl px-4 pt-4 pb-8 lg:px-8">
              {children}
            </main>
          </div>
        </ToastProvider>
      </SedeSeleccionadaProvider>
    </SessionProvider>
  );
}
