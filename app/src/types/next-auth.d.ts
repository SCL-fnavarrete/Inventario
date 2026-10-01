import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      // Con que inicia sesion; es lo que se anota como quien hizo algo (SPEC 2.122).
      usuario: string;
      // Sede del usuario (null para admin, que ve todas). No limita lo que ve (SPEC 2.117).
      sedeId: string | null;
      // Al iniciar esta sesion se cerro otra abierta en otro equipo (SPEC 2.127).
      otraSesionCerrada?: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string;
    usuario: string;
    sedeId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    usuario: string;
    sedeId: string | null;
    // SPEC 2.112: vencimiento segun Configuracion > Seguridad, identificador
    // de la sesion (lista negra) y hora de inicio (sesionesDesde).
    expiraEn?: number;
    sesionId?: string;
    inicio?: number;
    otraSesionCerrada?: boolean;
  }
}
