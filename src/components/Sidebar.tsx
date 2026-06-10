"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Briefcase, FileText, CalendarClock,
  BarChart3, Users, LogOut, Menu, X, UserCheck,
} from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";

const mainItems = [
  { href: "/dashboard", label: "Resumen", Icon: LayoutDashboard },
  { href: "/dashboard/cartera", label: "Cartera", Icon: Briefcase },
  { href: "/dashboard/clientes", label: "Clientes", Icon: UserCheck },
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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const showGestion = rol === "super_admin";

  async function salir() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  }

  function handleNav() {
    if (isMobile) setOpen(false);
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding: "0 10px", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #1a2942", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/dashboard" onClick={handleNav} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          <Image src="/CapiProm_Logo_Negativo.png" alt="CapiProm" width={120} height={35} style={{ objectFit: "contain" }} priority />
        </Link>
        {isMobile && (
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}>
            <X size={20} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1 }}>
        <SectionLabel text="Principal" />
        <nav style={{ display: "grid", gap: 1 }}>
          {mainItems.map((it) => (
            <NavItem key={it.href} {...it} active={isActive(it.href)} onClick={handleNav} />
          ))}
        </nav>
        {showGestion && (
          <>
            <SectionLabel text="Gestión" style={{ marginTop: 20 }} />
            <nav style={{ display: "grid", gap: 1 }}>
              {gestionItems.map((it) => (
                <NavItem key={it.href} {...it} active={isActive(it.href)} onClick={handleNav} />
              ))}
            </nav>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1a2942", paddingTop: 16 }}>
        <div style={{ padding: "0 10px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#e8a33d", marginBottom: 6 }}>
            {rolLabel[rol] ?? rol}
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", wordBreak: "break-all", lineHeight: 1.4 }}>{email}</div>
        </div>
        <button
          onClick={salir}
          style={{
            width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit",
            color: "#94a3b8", background: "transparent", border: "1px solid #1a2942", borderRadius: 6,
            cursor: "pointer", transition: "all 0.12s ease", minHeight: 44,
          }}
        >
          <LogOut size={14} strokeWidth={1.75} /> Cerrar sesión
        </button>
      </div>
    </>
  );

  // Desktop: static sidebar
  if (!isMobile) {
    return (
      <aside className="sidebar-scroll" style={{
        width: 220, borderRight: "1px solid #1a2942", background: "#0a1628",
        display: "flex", flexDirection: "column", position: "sticky", top: 0,
        height: "100vh", padding: "24px 14px 20px", overflowY: "auto",
      }}>
        {sidebarContent}
      </aside>
    );
  }

  // Mobile: hamburger + drawer
  return (
    <>
      {/* Top bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 90,
        background: "#0a1628", height: 56, display: "flex", alignItems: "center",
        padding: "0 16px", gap: 12, borderBottom: "1px solid #1a2942",
      }}>
        <button onClick={() => setOpen(true)} style={{
          background: "none", border: "none", color: "#cbd5e1", cursor: "pointer",
          padding: 8, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Menu size={22} strokeWidth={1.75} />
        </button>
        <Image src="/CapiProm_Logo_Negativo.png" alt="CapiProm" width={100} height={28} style={{ objectFit: "contain" }} />
      </div>

      {/* Spacer for fixed top bar */}
      <div style={{ height: 56 }} />

      {/* Overlay + Drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.5)", transition: "opacity 0.2s",
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="sidebar-scroll"
            style={{
              width: 260, height: "100%", background: "#0a1628",
              display: "flex", flexDirection: "column",
              padding: "24px 14px 20px", overflowY: "auto",
            }}
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

function SectionLabel({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", padding: "0 14px", marginBottom: 8, ...style }}>
      {text}
    </div>
  );
}

function NavItem({ href, label, Icon, active, onClick }: {
  href: string; label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean; onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "9px 14px",
      borderRadius: 6, fontSize: 13.5, fontWeight: active ? 600 : 500,
      color: active ? "#ffffff" : "#94a3b8",
      background: active ? "#1a2942" : "transparent",
      textDecoration: "none", transition: "all 0.12s ease", minHeight: 44,
    }}>
      <span style={{ display: "flex", color: active ? "#e8a33d" : "#94a3b8" }}>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      {label}
    </Link>
  );
}
