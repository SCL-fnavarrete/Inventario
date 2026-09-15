import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

// Rate limiting en memoria (usar Redis en producción)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

// Valores por defecto -- se usan mientras Configuracion > Parametros
// Generales no tenga fila guardada (SystemConfig, 14-sep-2026) o si la
// consulta a la config falla por cualquier motivo: el login NO se puede caer
// por esto, son los mismos numeros que el sistema uso siempre hasta ahora.
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTOS = 15;
const DEFAULT_SESION_HORAS = 24;

/**
 * Intentos de login / bloqueo: se leen de SystemConfig en cada intento (ya
 * es una operacion async, no cuesta nada extra) -- un cambio en
 * Configuracion aplica de inmediato al siguiente login.
 */
async function getConfigLogin(): Promise<{ maxAttempts: number; lockoutMs: number }> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    return {
      maxAttempts: config?.maxIntentosLogin ?? DEFAULT_MAX_ATTEMPTS,
      lockoutMs: (config?.minutosBloqueoLogin ?? DEFAULT_LOCKOUT_MINUTOS) * 60 * 1000,
    };
  } catch {
    return { maxAttempts: DEFAULT_MAX_ATTEMPTS, lockoutMs: DEFAULT_LOCKOUT_MINUTOS * 60 * 1000 };
  }
}

/**
 * Duracion de la sesion (`session.maxAge`, en segundos): a diferencia de lo
 * anterior, NextAuth necesita este valor SINCRONO al construir
 * `authOptions` (se usa para calcular la expiracion del JWT en cada login) --
 * no se puede volver a consultar la base en cada request sin reestructurar
 * como se arma el handler de NextAuth en todas partes donde se usa
 * `getServerSession(authOptions)` (decenas de archivos).
 *
 * Se arranca con el default y se actualiza en segundo plano (sin bloquear
 * el arranque del modulo ni el login) apenas la consulta a SystemConfig
 * responde; `authOptions.session` usa un getter para leer siempre el valor
 * mas reciente de `cachedSesionMaxAgeSegundos`.
 *
 * Consecuencia practica: cambiar la duracion de sesion desde Configuracion
 * aplica recien despues de que el servidor se reinicie/redespliegue (o, como
 * mucho, unos segundos despues si el proceso lleva rato corriendo) -- no es
 * instantaneo como los intentos de login, porque el valor no se vuelve a
 * releer despues de ese refresh inicial. Se le avisa esto a Javier
 * explicitamente (ver SPEC 2.34).
 */
let cachedSesionMaxAgeSegundos = DEFAULT_SESION_HORAS * 60 * 60;

async function refrescarSesionMaxAge(): Promise<void> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    if (config) {
      cachedSesionMaxAgeSegundos = config.duracionSesionHoras * 60 * 60;
    }
  } catch {
    // Se mantiene el default -- ver comentario de la constante.
  }
}
// Fire-and-forget: no se espera esta promesa en ningun lado a proposito, el
// modulo tiene que terminar de cargar (y el login tiene que poder ejecutarse)
// aunque la base todavia no responda.
void refrescarSesionMaxAge();

function checkRateLimit(email: string, maxAttempts: number, lockoutMs: number): boolean {
  const now = Date.now();
  const attempts = loginAttempts.get(email);

  if (!attempts) {
    return true;
  }

  // Limpiar intentos antiguos
  if (now - attempts.lastAttempt > lockoutMs) {
    loginAttempts.delete(email);
    return true;
  }

  return attempts.count < maxAttempts;
}

function recordFailedAttempt(email: string, lockoutMs: number): void {
  const now = Date.now();
  const attempts = loginAttempts.get(email);

  if (!attempts || now - attempts.lastAttempt > lockoutMs) {
    loginAttempts.set(email, { count: 1, lastAttempt: now });
  } else {
    loginAttempts.set(email, { count: attempts.count + 1, lastAttempt: now });
  }
}

function clearAttempts(email: string): void {
  loginAttempts.delete(email);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email y contraseña son requeridos");
        }

        const email = credentials.email.toLowerCase();
        const { maxAttempts, lockoutMs } = await getConfigLogin();

        // Verificar rate limiting
        if (!checkRateLimit(email, maxAttempts, lockoutMs)) {
          throw new Error(`Demasiados intentos. Intente en ${Math.ceil(lockoutMs / 60000)} minutos`);
        }

        const user = await prisma.systemUser.findUnique({
          where: { email },
        });

        // Mismo mensaje para "el correo no existe", "la cuenta esta
        // desactivada" y "la contrasena no coincide" (15-sep-2026, QA
        // funcional). Antes se respondia "Usuario no encontrado o inactivo"
        // vs "Contrasena incorrecta", y esa diferencia permitia averiguar
        // que correos son cuentas reales del sistema probandolos uno por
        // uno (enumeracion de usuarios). El detalle real sigue disponible
        // en el registro de intentos fallidos, no en la respuesta al
        // navegador. Ver SPEC 2.38.
        const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos";

        if (!user || !user.activo) {
          recordFailedAttempt(email, lockoutMs);
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        const isPasswordValid = await compare(credentials.password, user.passwordHash);

        if (!isPasswordValid) {
          recordFailedAttempt(email, lockoutMs);
          throw new Error(CREDENCIALES_INVALIDAS);
        }

        // Limpiar intentos al login exitoso
        clearAttempts(email);

        // Actualizar último login
        await prisma.systemUser.update({
          where: { id: user.id },
          data: { ultimoLogin: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.nombre,
          role: user.rol,
          sedeId: user.sedeId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        // `sedeId` viaja en el token para que sedeScope() no tenga que ir a
        // buscar el usuario en cada request. Si el admin le cambia la sede
        // a alguien con sesion activa, el cambio aplica en el proximo login
        // (maxAge del JWT es configurable, ver session.maxAge mas abajo y
        // Configuracion > Parametros Generales) -- ver SPEC 2.9.
        token.sedeId = (user as { sedeId?: string | null }).sedeId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.sedeId = (token.sedeId as string | null) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    // Getter en vez de un numero fijo: lee siempre el valor cacheado mas
    // reciente (ver cachedSesionMaxAgeSegundos / refrescarSesionMaxAge
    // arriba). Configurable desde Configuracion > Parametros Generales,
    // aplica despues de reiniciar/redesplegar el servidor.
    get maxAge() {
      return cachedSesionMaxAgeSegundos;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
