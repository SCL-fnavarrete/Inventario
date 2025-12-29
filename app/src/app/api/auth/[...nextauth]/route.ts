import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Fix for Next.js 16 + Turbopack: prevent static analysis of dynamic API route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
