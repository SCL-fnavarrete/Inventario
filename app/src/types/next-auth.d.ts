import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      // Sede del usuario (null para admin, que ve todas). Ver sedeScope()
      // y SPEC 2.9.
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
  }
}
