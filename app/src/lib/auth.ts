import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

// Rate limiting en memoria (usar Redis en producción)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const attempts = loginAttempts.get(email);

  if (!attempts) {
    return true;
  }

  // Limpiar intentos antiguos
  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(email);
    return true;
  }

  return attempts.count < MAX_ATTEMPTS;
}

function recordFailedAttempt(email: string): void {
  const now = Date.now();
  const attempts = loginAttempts.get(email);

  if (!attempts || now - attempts.lastAttempt > LOCKOUT_DURATION) {
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

        // Verificar rate limiting
        if (!checkRateLimit(email)) {
          throw new Error("Demasiados intentos. Intente en 15 minutos");
        }

        const user = await prisma.systemUser.findUnique({
          where: { email },
        });

        if (!user || !user.activo) {
          recordFailedAttempt(email);
          throw new Error("Usuario no encontrado o inactivo");
        }

        const isPasswordValid = await compare(credentials.password, user.passwordHash);

        if (!isPasswordValid) {
          recordFailedAttempt(email);
          throw new Error("Contraseña incorrecta");
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
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
    maxAge: 24 * 60 * 60, // 24 horas
  },
  secret: process.env.NEXTAUTH_SECRET,
};
