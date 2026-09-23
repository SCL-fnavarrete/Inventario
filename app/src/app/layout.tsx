import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { temaInitScript } from "@/lib/tema";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: temaInitScript pone data-theme en <html>
    // antes de hidratar, y el servidor no lo conoce.
    <html lang="es" className={montserrat.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInitScript }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
