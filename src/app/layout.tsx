import type { Metadata } from "next";
import "./globals.css";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@300;400;500;600&family=Outfit:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
