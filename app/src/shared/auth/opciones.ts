import { randomUUID } from "crypto";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/shared/prisma";
import { anotarIngreso, fijarSesionVigente } from "@/shared/auth/cuentas";
import { normalizarUsuario } from "@/shared/auth/usuario";
import {
  actualizarAcceso,
  datosCliente,
  limpiarRegistroAntiguo,
  minutosDeBloqueo,
  minutosDeBloqueoEquipo,
  registrarAcceso,
  sesionSeguiaAbierta,
  type DatosAcceso,
} from "@/shared/auth/accesos";

// Valores por defecto -- se usan mientras Configuracion > Seguridad no tenga
// fila guardada, o si la consulta a la config falla: el login no se puede
// caer por esto.
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTOS = 15;
const DEFAULT_SESION_HORAS = 24;
const DEFAULT_MAX_INTENTOS_IP = 20;
const DEFAULT_LOCKOUT_IP_MINUTOS = 15;

// Contrasena cifrada de relleno (no corresponde a ninguna cuenta). Cuando el
// usuario no existe se compara igual contra ella, para que la respuesta tarde
// lo mismo que con una contrasena incorrecta y no se pueda adivinar que
// usuarios existen midiendo el tiempo (SPEC 2.112.6).
const HASH_RELLENO = "$2b$12$A1ssCqH/xtvgwitFuqmyWeE/6jkGpeTwRUFEzxU.a.n4RLRVH3F4.";

// Tope del JWT. La duracion real la controla `expiraEn` (ver jwt()), que se
// calcula al iniciar sesion con el valor de Configuracion > Seguridad; este
// tope solo tiene que ser mayor que el maximo permitido (720 horas).
const TOPE_JWT_SEGUNDOS = 31 * 24 * 60 * 60;

/** Largo maximo de una contrasena al iniciar sesion (auditoria 27-sep-2026, 2.6). */
const LARGO_MAXIMO_CLAVE = 200;

/**
 * Secreto con que se cifran las sesiones. Con uno corto o conocido se pueden
 * fabricar cookies de sesion validas (auditoria 27-sep-2026, F1-01), asi que
 * en produccion la app no arranca sin uno de al menos 32 caracteres.
 */
const LARGO_MINIMO_SECRETO = 32;
function secretoDeSesion(): string | undefined {
  const secreto = process.env.NEXTAUTH_SECRET;
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO) {
    const mensaje = `NEXTAUTH_SECRET debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres (genéralo con: openssl rand -base64 32)`;
    if (process.env.NODE_ENV === "production") throw new Error(mensaje);
    if (process.env.NODE_ENV === "development") console.warn(`[seguridad] ${mensaje}`);
  }
  return secreto;
}

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
        usuario: { label: "Usuario", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.usuario || !credentials?.password) {
          throw new Error("Usuario y contraseña son requeridos");
        }

        // Se inicia sesion con el usuario, no con el correo (SPEC 2.122).
        const usuario = normalizarUsuario(credentials.usuario);
        const cliente = datosCliente(req?.headers);
        const { maxIntentos, minutosBloqueo, horasSesion, maxIntentosIp, minutosBloqueoIp } =
          await getConfigSeguridad();

        // El intento se anota ANTES de revisar nada, como fallido, y al final
        // se corrige con su resultado real (auditoria 27-sep-2026, 2.6). Asi
        // los intentos simultaneos se cuentan entre si: antes, 50 intentos a
        // la vez pasaban todos la revision de bloqueo mientras bcrypt
        // comparaba, porque ninguno se habia anotado todavia.
        const intentoId = await registrarAcceso({ usuarioIngresado: usuario, resultado: "clave_incorrecta", ...cliente });
        const cerrarIntento = (d: Omit<DatosAcceso, "usuarioIngresado" | "ip" | "navegador">) =>
          actualizarAcceso(intentoId, { usuarioIngresado: usuario, ...cliente, ...d });
        // El propio intento ya esta en el registro: no debe adelantar el bloqueo.
        const enCurso = intentoId ? 1 : 0;

        // Bloqueo por intentos fallidos, contados en el registro de accesos
        // (SPEC 2.112): funciona aunque el servidor corra en varias copias.
        // Por usuario desde este equipo, por usuario desde cualquier lugar (con
        // un tope mas alto) y por equipo (SPEC 2.112.6 y 2.114).
        const bloqueoUsuario = await minutosDeBloqueo(usuario, cliente.ip, maxIntentos, minutosBloqueo, enCurso);
        const bloqueoEquipo = await minutosDeBloqueoEquipo(cliente.ip, maxIntentosIp, minutosBloqueoIp, enCurso);
        const bloqueo = Math.max(bloqueoUsuario.minutos, bloqueoEquipo);
        if (bloqueo > 0) {
          await cerrarIntento({
            resultado: "bloqueado",
            detalle:
              bloqueoEquipo >= bloqueoUsuario.minutos
                ? "Demasiados intentos desde este equipo"
                : bloqueoUsuario.motivo === "global"
                  ? "Demasiados intentos contra esta cuenta desde distintos equipos"
                  : null,
          });
          throw new Error(`Demasiados intentos. Intente en ${bloqueo} minuto${bloqueo === 1 ? "" : "s"}`);
        }

        // Mismo mensaje para "el usuario no existe", "la cuenta esta
        // desactivada" y "la contrasena no coincide", para no permitir
        // enumerar cuentas reales probando usuarios uno por uno. El detalle
        // real queda en el registro de accesos.
        const CREDENCIALES_INVALIDAS = "Usuario o contraseña incorrectos";

        // Ninguna clave valida pasa de 200 caracteres (ver validarPasswordFuerte);
        // una mas larga solo sirve para gastar CPU en bcrypt. Cuenta como fallo.
        if (credentials.password.length > LARGO_MAXIMO_CLAVE) {
          await cerrarIntento({ resultado: "clave_incorrecta", detalle: "Contraseña demasiado larga" });
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        const user = await prisma.systemUser.findUnique({
          where: { usuario },
          include: { sede: { select: { activa: true } } },
        });
        // Siempre se compara una contrasena, exista o no la cuenta: asi todas
        // las respuestas tardan lo mismo (ver HASH_RELLENO).
        const isPasswordValid = await compare(credentials.password, user?.passwordHash ?? HASH_RELLENO);

        if (!user) {
          await cerrarIntento({ resultado: "usuario_inexistente" });
          throw new Error(CREDENCIALES_INVALIDAS);
        }
        if (!user.activo) {
          await cerrarIntento({ usuarioId: user.id, resultado: "usuario_inactivo" });
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        if (!isPasswordValid) {
          await cerrarIntento({ usuarioId: user.id, resultado: "clave_incorrecta" });
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        // Tecnico de una sede desactivada (SPEC 2.112.6). Aqui la contrasena
        // ya es correcta, asi que se le dice el motivo.
        if (user.rol !== "admin" && user.sede && !user.sede.activa) {
          await cerrarIntento({ usuarioId: user.id, resultado: "sede_inactiva" });
          throw new Error("Tu sede está desactivada. Pide a un administrador que te cambie de sede.");
        }

        await anotarIngreso(user.id);
        // Identificador propio de esta sesion (SPEC 2.112.5): une el ingreso
        // con su cierre en el registro y es lo que se anota en la lista negra
        // al cerrar sesion.
        const sesionId = randomUUID();
        await cerrarIntento({ usuarioId: user.id, resultado: "exito", sesionId });
        // Una sola sesion por usuario, gana la ultima (SPEC 2.127): esta pasa
        // a ser la vigente y las demas quedan fuera en su siguiente accion.
        // Si la anterior seguia abierta, queda en el registro y se avisa.
        const anterior = await fijarSesionVigente(user.id, sesionId);
        const otraSesionCerrada =
          !!anterior && (await sesionSeguiaAbierta(anterior, horasSesion, user.sesionesDesde));
        if (otraSesionCerrada) {
          await registrarAcceso({
            usuarioIngresado: usuario,
            usuarioId: user.id,
            resultado: "sesion_revocada",
            sesionId: anterior,
            detalle: "Se inició sesión en otro equipo",
          });
        }
        await limpiarRegistroAntiguo();

        return {
          id: user.id,
          usuario: user.usuario,
          name: user.nombre,
          role: user.rol,
          sedeId: user.sedeId,
          expiraEn: Date.now() + horasSesion * 60 * 60 * 1000,
          sesionId,
          otraSesionCerrada,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.usuario = user.usuario;
        token.sedeId = (user as { sedeId?: string | null }).sedeId ?? null;
        token.expiraEn = (user as { expiraEn?: number }).expiraEn;
        token.sesionId = (user as { sesionId?: string }).sesionId;
        token.otraSesionCerrada = (user as { otraSesionCerrada?: boolean }).otraSesionCerrada ?? false;
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
          usuario: true,
          sesionesDesde: true,
          sesionVigenteId: true,
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
      // Solo vale la sesion vigente de la cuenta (SPEC 2.127): otra se inicio
      // despues en otro equipo, o un administrador la cerro.
      if (actual.sesionVigenteId !== token.sesionId) {
        throw new Error("Sesión reemplazada");
      }
      token.role = actual.rol;
      token.sedeId = actual.sedeId;
      token.name = actual.nombre;
      token.usuario = actual.usuario;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.usuario = token.usuario;
        session.user.sedeId = (token.sedeId as string | null) ?? null;
        // Para el aviso "se cerró tu sesión en otro equipo" (SPEC 2.127).
        session.user.otraSesionCerrada = token.otraSesionCerrada === true;
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
  secret: secretoDeSesion(),
};
