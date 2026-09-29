import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      // Sede del usuario (null para admin, que ve todas). No limita lo que ve (SPEC 2.117).
      sedeId: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string;
    sedeId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    sedeId: string | null;
    // SPEC 2.112: vencimiento segun Configuracion > Seguridad, identificador
    // de la sesion (lista negra) y hora de inicio (sesionesDesde).
    expiraEn?: number;
    sesionId?: string;
    inicio?: number;
  }
}
