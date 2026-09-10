import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";

// Todo el modulo de Configuracion (incluidas sus sub-paginas: categorias,
// kit-epp, usuarios, proveedores, parametros, sedes, microsoft-sync,
// mantenimiento) es exclusivo de admin -- ver el recurso "configuracion" en
// permissions.ts. El Sidebar ya ocultaba el link para tecnico, pero cada
// pagina de esta carpeta es un client component sin ningun chequeo propio,
// asi que un tecnico que entrara directo por URL (favorito, link
// compartido, etc.) igual podia ver y usar cualquier sub-pagina, incluida
// "Mantenimiento de Datos" (borrado masivo). Este layout es el guard real,
// del lado del servidor, para todo el arbol -- una sola verificacion en vez
// de repetirla en cada page.tsx.
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
