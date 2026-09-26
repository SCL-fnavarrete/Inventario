import { randomUUID } from "crypto";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";
import {
  datosCliente,
  limpiarRegistroAntiguo,
  minutosDeBloqueo,
  minutosDeBloqueoEquipo,
  registrarAcceso,
} from "./services/accesoService";

// Valores por defecto -- se usan mientras Configuracion > Seguridad no tenga
// fila guardada, o si la consulta a la config falla: el login no se puede
// caer por esto.
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTOS = 15;
const DEFAULT_SESION_HORAS = 24;
const DEFAULT_MAX_INTENTOS_IP = 20;
const DEFAULT_LOCKOUT_IP_MINUTOS = 15;

// Contrasena cifrada de relleno (no corresponde a ninguna cuenta). Cuando el
// correo no existe se compara igual contra ella, para que la respuesta tarde
// lo mismo que con una contrasena incorrecta y no se pueda adivinar que
// correos existen midiendo el tiempo (SPEC 2.112.6).
const HASH_RELLENO = "$2b$12$A1ssCqH/xtvgwitFuqmyWeE/6jkGpeTwRUFEzxU.a.n4RLRVH3F4.";

// Tope del JWT. La duracion real la controla `expiraEn` (ver jwt()), que se
// calcula al iniciar sesion con el valor de Configuracion > Seguridad; este
// tope solo tiene que ser mayor que el maximo permitido (720 horas).
const TOPE_JWT_SEGUNDOS = 31 * 24 * 60 * 60;

/** Configuracion > Seguridad, leida en cada inicio de sesion (aplica de inmediato). */
async function getConfigSeguridad() {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    return {
      maxIntentos: config?.maxIntentosLogin ?? DEFAULT_MAX_ATTEMPTS,
      minutosBloqueo: config?.minutosBloqueoLogin ?? DEFAULT_LOCKOUT_MINUTOS,
      horasSesion: config?.duracionSesionHoras ?? DEFAULT_SESION_HORAS,
      maxIntentosIp: config?.maxIntentosIp ?? DEFAULT_MAX_INTENTOS_IP,
      minutosBloqueoIp: config?.minutosBloqueoIp ?? DEFAULT_LOCKOUT_IP_MINUTOS,
    };
  } catch {
    return {
      maxIntentos: DEFAULT_MAX_ATTEMPTS,
      minutosBloqueo: DEFAULT_LOCKOUT_MINUTOS,
      horasSesion: DEFAULT_SESION_HORAS,
      maxIntentosIp: DEFAULT_MAX_INTENTOS_IP,
      minutosBloqueoIp: DEFAULT_LOCKOUT_IP_MINUTOS,
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email y contraseña son requeridos");
        }

        const email = credentials.email.toLowerCase().trim();
        const cliente = datosCliente(req?.headers);
        const { maxIntentos, minutosBloqueo, horasSesion, maxIntentosIp, minutosBloqueoIp } =
          await getConfigSeguridad();

        // Bloqueo por intentos fallidos, contados en el registro de accesos
        // (SPEC 2.112): funciona aunque el servidor corra en varias copias.
        // Por correo y tambien por equipo (SPEC 2.112.6), para frenar a quien
        // prueba muchos correos desde el mismo lugar.
        const bloqueoCorreo = await minutosDeBloqueo(email, maxIntentos, minutosBloqueo);
        const bloqueoEquipo = await minutosDeBloqueoEquipo(cliente.ip, maxIntentosIp, minutosBloqueoIp);
        const bloqueo = Math.max(bloqueoCorreo, bloqueoEquipo);
        if (bloqueo > 0) {
          await registrarAcceso({
            email,
            resultado: "bloqueado",
            detalle: bloqueoEquipo >= bloqueoCorreo ? "Demasiados intentos desde este equipo" : null,
            ...cliente,
          });
          throw new Error(`Demasiados intentos. Intente en ${bloqueo} minuto${bloqueo === 1 ? "" : "s"}`);
        }

        const user = await prisma.systemUser.findUnique({
          where: { email },
          include: { sede: { select: { activa: true } } },
        });
        // Siempre se compara una contrasena, exista o no la cuenta: asi todas
        // las respuestas tardan lo mismo (ver HASH_RELLENO).
        const isPasswordValid = await compare(credentials.password, user?.passwordHash ?? HASH_RELLENO);

        // Mismo mensaje para "el correo no existe", "la cuenta esta
        // desactivada" y "la contrasena no coincide", para no permitir
        // enumerar cuentas reales probando correos uno por uno. El detalle
        // real queda en el registro de accesos.
        const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos";

        if (!user) {
          await registrarAcceso({ email, resultado: "usuario_inexistente", ...cliente });
          throw new Error(CREDENCIALES_INVALIDAS);
        }
        if (!user.activo) {
          await registrarAcceso({ email, usuarioId: user.id, resultado: "usuario_inactivo", ...cliente });
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        if (!isPasswordValid) {
          await registrarAcceso({ email, usuarioId: user.id, resultado: "clave_incorrecta", ...cliente });
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        // Tecnico de una sede desactivada (SPEC 2.112.6). Aqui la contrasena
        // ya es correcta, asi que se le dice el motivo.
        if (user.rol !== "admin" && user.sede && !user.sede.activa) {
          await registrarAcceso({ email, usuarioId: user.id, resultado: "sede_inactiva", ...cliente });
          throw new Error("Tu sede está desactivada. Pide a un administrador que te cambie de sede.");
        }

        await prisma.systemUser.update({
          where: { id: user.id },
          data: { ultimoLogin: new Date() },
        });
        // Identificador propio de esta sesion (SPEC 2.112.5): une el ingreso
        // con su cierre en el registro y es lo que se anota en la lista negra
        // al cerrar sesion.
        const sesionId = randomUUID();
        await registrarAcceso({ email, usuarioId: user.id, resultado: "exito", sesionId, ...cliente });
        await limpiarRegistroAntiguo();

        return {
          id: user.id,
          email: user.email,
          name: user.nombre,
          role: user.rol,
          sedeId: user.sedeId,
          expiraEn: Date.now() + horasSesion * 60 * 60 * 1000,
          sesionId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sedeId = (user as { sedeId?: string | null }).sedeId ?? null;
        token.expiraEn = (user as { expiraEn?: number }).expiraEn;
        token.sesionId = (user as { sesionId?: string }).sesionId;
        token.inicio = Date.now();
        return token;
      }

      // SPEC 2.112: la duracion de la sesion es la de Configuracion >
      // Seguridad al momento de iniciarla.
      // Una sesion sin identificador es anterior a la lista negra: se pide
      // iniciar sesion de nuevo.
      if (
        typeof token.expiraEn !== "number" ||
        Date.now() > token.expiraEn ||
        typeof token.sesionId !== "string" ||
        typeof token.inicio !== "number"
      ) {
        throw new Error("Sesión vencida");
      }

      // En cada consulta se revisa la cuenta: una desactivada queda sin
      // acceso en su siguiente accion, y un cambio de rol o de sede aplica
      // de inmediato (antes esperaba a que venciera la sesion). Lanzar aqui
      // hace que NextAuth invalide la sesion.
      //
      // En la misma consulta (SPEC 2.112.5): si esta sesion se cerro (lista
      // negra) o se inicio antes de que se desactivara la cuenta, ya no vale,
      // aunque alguien haya guardado una copia del token o la cuenta se haya
      // reactivado despues.
      const actual = await prisma.systemUser.findUnique({
        where: { id: token.id as string },
        select: {
          activo: true,
          rol: true,
          sedeId: true,
          nombre: true,
          sesionesDesde: true,
          sesionesCerradas: { where: { id: token.sesionId }, select: { id: true } },
          sede: { select: { activa: true } },
        },
      });
      if (!actual || !actual.activo) {
        throw new Error("Cuenta desactivada");
      }
      // Su sede se desactivo (SPEC 2.112.6): sale en su siguiente accion.
      if (actual.rol !== "admin" && actual.sede && !actual.sede.activa) {
        throw new Error("Sede desactivada");
      }
      if (actual.sesionesCerradas.length > 0) {
        throw new Error("Sesión cerrada");
      }
      if (actual.sesionesDesde && token.inicio < actual.sesionesDesde.getTime()) {
        throw new Error("Sesión cortada");
      }
      token.role = actual.rol;
      token.sedeId = actual.sedeId;
      token.name = actual.nombre;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.sedeId = (token.sedeId as string | null) ?? null;
        if (token.name) session.user.name = token.name;
      }
      return session;
    },
  },
  // El cierre de sesion (registro y lista negra) lo hace la ruta de
  // NextAuth, que tiene la direccion de red y el navegador: ver
  // app/api/auth/[...nextauth]/route.ts y cerrarSesion().
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: TOPE_JWT_SEGUNDOS,
  },
  secret: process.env.NEXTAUTH_SECRET,
};
