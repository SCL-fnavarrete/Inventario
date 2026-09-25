import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Con una sesion valida no tiene sentido ver el login: se va al inicio. La
// revision se hace aqui y no en el middleware, porque solo aqui se consulta
// la base: una sesion de una cuenta desactivada (SPEC 2.112) sigue teniendo
// su cookie, y el middleware la mandaba al inicio, que la devolvia al login,
// en un ciclo sin fin.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/");
  return <>{children}</>;
}
