import type { Metadata } from "next";
import { headers } from "next/headers";
import { Montserrat } from "next/font/google";
import { temaInitScript } from "@/shared/tema";
import "./globals.css";

// Tipografia de marca (sclconsultores.com). next/font la sirve desde el
// propio dominio, sin peticion a Google ni salto de layout al cargar.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Inventario IT - SCL Consultores",
  description: "Sistema de Control de Inventario de Activos IT",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce de esta visita (lo genera proxy.ts): sin el, la CSP bloquea el
  // script del tema (shared/seguridad/csp.ts).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // suppressHydrationWarning: temaInitScript pone data-theme en <html>
    // antes de hidratar, y el servidor no lo conoce.
    <html lang="es" className={montserrat.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: temaInitScript }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
