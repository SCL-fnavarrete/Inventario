import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/shared/auth/opciones";
import { can } from "@/shared/auth/permisos";

// Todo el modulo de Configuracion es exclusivo de admin (ver el recurso
// "configuracion" en shared/auth/permisos.ts). Este layout es el guard real, del
// lado del servidor, para todo el arbol, ya que las paginas de esta
// carpeta son client components sin chequeo propio.
export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !can(session.user.role, "configuracion", "read")) {
    redirect("/");
  }

  return <>{children}</>;
}
