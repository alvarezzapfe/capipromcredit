import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getMarca } from "@/lib/marca";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "CapiProm Credit — Gestión integral de crédito",
    template: "%s · CapiProm Credit",
  },
  description:
    "Plataforma interna de CapiProm para originación, gestión de cartera, cobranza y reportes de crédito. Administra solicitudes, créditos vigentes, flujos de pago y reportes regulatorios en un solo lugar.",
  applicationName: "CapiProm Credit",
  authors: [{ name: "CapiProm" }],
  keywords: ["crédito", "cartera", "cobranza", "SOFOM", "originación", "fintech México"],
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const marca = await getMarca();

  return (
    <html lang="es">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--color-primario:${marca.color_primario};--color-acento:${marca.color_acento};}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=Figtree:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
