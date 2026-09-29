import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/shared/auth/opciones";
import { can } from "@/shared/auth/permisos";

// Registrar una compra es solo de admin (SPEC 2.111.1): el tecnico ve las
// compras, pero no las registra. La pagina es un client component; este
// layout es el guard real, del lado del servidor.
export default async function NuevaCompraLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !can(session.user.role, "compras", "write")) {
    redirect("/compras");
  }

  return <>{children}</>;
}
