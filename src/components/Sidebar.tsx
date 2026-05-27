"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  CalendarClock,
  BarChart3,
  Users,
  LogOut,
} from "lucide-react";

const mainItems = [
  { href: "/dashboard", label: "Resumen", Icon: LayoutDashboard },
  { href: "/dashboard/cartera", label: "Cartera", Icon: Briefcase },
  { href: "/dashboard/creditos", label: "Solicitudes", Icon: FileText },
  { href: "/dashboard/flujos", label: "Flujos y cobranza", Icon: CalendarClock },
  { href: "/dashboard/reportes", label: "Reportes", Icon: BarChart3 },
];

const gestionItems = [
  { href: "/dashboard/usuarios", label: "Usuarios", Icon: Users },
];

const rolLabel: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  demo: "Demo",
  operador: "Operador",
  consulta: "Consulta",
};

export default function Sidebar({ email, rol }: { email: string; rol: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const showGestion = rol === "super_admin";

  async function salir() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);
  }

  return (
    <aside
      className="sidebar-scroll"
      style={{
        width: 220,
        borderRight: "1px solid #1a2942",
        background: "#0a1628",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
        padding: "24px 14px 20px",
        overflowY: "auto",
      }}
    >
      {/* --- Logo --- */}
      <div style={{ padding: "0 10px", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #1a2942" }}>
        <Link
          href="/dashboard"
          style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
        >
          <Image
            src="/CapiProm_Logo_Negativo.png"
            alt="CapiProm"
            width={120}
            height={35}
            style={{ objectFit: "contain" }}
            priority
          />
        </Link>
      </div>

      {/* --- Principal --- */}
      <div style={{ flex: 1 }}>
        <SectionLabel text="Principal" />
        <nav style={{ display: "grid", gap: 1 }}>
          {mainItems.map((it) => (
            <NavItem key={it.href} {...it} active={isActive(it.href)} />
          ))}
        </nav>

        {showGestion && (
          <>
            <SectionLabel text="Gestión" style={{ marginTop: 20 }} />
            <nav style={{ display: "grid", gap: 1 }}>
              {gestionItems.map((it) => (
                <NavItem key={it.href} {...it} active={isActive(it.href)} />
              ))}
            </nav>
          </>
        )}
      </div>

      {/* --- Footer --- */}
      <div style={{ borderTop: "1px solid #1a2942", paddingTop: 16 }}>
        <div style={{ padding: "0 10px", marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#e8a33d",
              marginBottom: 6,
            }}
          >
            {rolLabel[rol] ?? rol}
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", wordBreak: "break-all", lineHeight: 1.4 }}>
            {email}
          </div>
        </div>
        <button
          onClick={salir}
          style={{
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "9px 14px",
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: "inherit",
            color: "#94a3b8",
            background: "transparent",
            border: "1px solid #1a2942",
            borderRadius: 6,
            cursor: "pointer",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#cbd5e1";
            e.currentTarget.style.borderColor = "#2a3a52";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
            e.currentTarget.style.borderColor = "#1a2942";
          }}
        >
          <LogOut size={14} strokeWidth={1.75} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "#475569",
        padding: "0 14px",
        marginBottom: 8,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 14px",
        borderRadius: 6,
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        color: active ? "#ffffff" : "#94a3b8",
        background: active ? "#1a2942" : "transparent",
        textDecoration: "none",
        transition: "all 0.12s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = "#cbd5e1";
          e.currentTarget.style.background = "rgba(26,41,66,0.5)";
          const icon = e.currentTarget.querySelector("[data-icon]") as HTMLElement;
          if (icon) icon.style.color = "#cbd5e1";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = "#94a3b8";
          e.currentTarget.style.background = "transparent";
          const icon = e.currentTarget.querySelector("[data-icon]") as HTMLElement;
          if (icon) icon.style.color = "#94a3b8";
        }
      }}
    >
      <span data-icon style={{ display: "flex", color: active ? "#e8a33d" : "#94a3b8", transition: "color 0.12s ease" }}>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      {label}
    </Link>
  );
}
