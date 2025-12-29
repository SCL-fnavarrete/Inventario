import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/ui/Toast";

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
      <ToastProvider position="top-right">
        {/* Skip to content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg"
        >
          Ir al contenido principal
        </a>
        <div className="flex min-h-screen bg-gray-100">
          <Sidebar />
          <main id="main-content" className="flex-1 lg:ml-0 min-w-0">
            <div className="p-6 lg:p-8 w-full">{children}</div>
          </main>
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
