import { redirect } from "next/navigation";

// Este modulo se movio fuera de Configuracion (que quedo admin-only,
// 9-sep-2026) para que el tecnico pudiera seguir agregando/editando su
// propio stock de Kit de Bienvenida y EPP. Redirige a la nueva ubicacion en
// vez de borrarse -- mismo workaround usado con /empleados, /empleados/nuevo
// y /empleados/importar cuando device_bash no podia borrar archivos.
export default function KitEppRedirectPage() {
  redirect("/activos/kit-bienvenida");
}
