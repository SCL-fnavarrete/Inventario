import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/shared/auth/opciones";
import { Navbar } from "@/shared/ui/layout/Navbar";
import { SessionProvider } from "@/shared/ui/providers/SessionProvider";
import { SedeSeleccionadaProvider } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { ToastProvider } from "@/shared/ui/Toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <SessionProvider>
      <SedeSeleccionadaProvider>
        <ToastProvider position="top-right">
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
