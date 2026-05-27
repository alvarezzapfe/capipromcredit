"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { Users, Plus, RotateCcw, Trash2, KeyRound } from "lucide-react";
import { etiquetaRol, ROLES, type Rol } from "@/lib/rbac";

interface PerfilRow {
  id: string;
  email: string;
  nombre: string | null;
  rol: string;
  activo: boolean;
  created_at: string;
  totp_enrolled: boolean;
}

export default function UsuariosPage() {
  const [perfiles, setPerfiles] = useState<PerfilRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [yo, setYo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "err"; msg: string } | null>(null);
  const [modal, setModal] = useState(false);
  const [confirmElim, setConfirmElim] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    setYo(userData.user?.id ?? null);

    const { data: profs } = await supabase
      .from("perfiles")
      .select("*")
      .order("created_at", { ascending: true });

    const { data: totps } = await supabase.from("user_totp").select("user_id, pending");

    const totpMap = new Map<string, boolean>();
    (totps ?? []).forEach((t: { user_id: string; pending: boolean }) => {
      totpMap.set(t.user_id, !t.pending);
    });

    setPerfiles(
      (profs ?? []).map((p: any) => ({
        ...p,
        totp_enrolled: totpMap.get(p.id) ?? false,
      }))
    );
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function apiCall(url: string, body: object, successMsg?: string) {
    setAviso(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setAviso({ tipo: "err", msg: data.error ?? "Error desconocido" });
      return false;
    }
    if (successMsg) setAviso({ tipo: "ok", msg: successMsg });
    cargar();
    return true;
  }

  async function cambiarRol(userId: string, rol: string) {
    await apiCall("/api/usuarios/actualizar-rol", { user_id: userId, rol });
  }

  async function toggleActivo(userId: string, activo: boolean) {
    await apiCall("/api/usuarios/toggle-activo", { user_id: userId, activo });
  }

  async function resetTotp(userId: string) {
    await apiCall("/api/usuarios/reset-totp", { user_id: userId }, "2FA reseteado. El usuario deberá configurarlo de nuevo.");
  }

  async function eliminar(userId: string) {
    const ok = await apiCall("/api/usuarios/eliminar", { user_id: userId }, "Usuario eliminado.");
    if (ok) setConfirmElim(null);
  }

  const badgeColor: Record<string, { bg: string; fg: string }> = {
    super_admin: { bg: "#ede9fe", fg: "#6d28d9" },
    admin: { bg: "#e8eef5", fg: "#1e3a5f" },
    demo: { bg: "#f0f2f5", fg: "#64748b" },
  };

  return (
    <div style={{ padding: "36px 40px 60px", maxWidth: 1100 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>Usuarios</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
            Gestión de accesos al sistema. Solo super administradores tienen acceso a esta vista.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <Plus size={14} strokeWidth={1.75} /> Nuevo usuario
        </button>
      </header>

      {aviso && (
        <div style={{
          padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18,
          background: aviso.tipo === "ok" ? "var(--green-soft)" : "var(--red-soft)",
          color: aviso.tipo === "ok" ? "var(--green)" : "var(--red)",
        }}>
          {aviso.msg}
        </div>
      )}

      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>Cargando…</div>
        ) : perfiles.length === 0 ? (
          <div style={{ padding: "80px 40px", textAlign: "center" }}>
            <Users size={36} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginTop: 14 }}>Sin usuarios</h3>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>TOTP</th>
                <th>Activo</th>
                <th>Creado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {perfiles.map((p) => {
                const soyYo = p.id === yo;
                const bc = badgeColor[p.rol] ?? badgeColor.demo;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {p.email} {soyYo && <span style={{ color: "var(--amber)", fontSize: 11 }}>(tú)</span>}
                      </div>
                    </td>
                    <td>
                      <select
                        className="select"
                        value={p.rol}
                        disabled={soyYo}
                        onChange={(e) => cambiarRol(p.id, e.target.value)}
                        style={{ width: "auto", padding: "5px 10px", fontSize: 12.5, opacity: soyYo ? 0.5 : 1 }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{etiquetaRol(r)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: p.totp_enrolled ? "var(--green)" : "var(--text-faint)" }}>
                        {p.totp_enrolled ? "✓" : "—"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        disabled={soyYo}
                        onClick={() => toggleActivo(p.id, !p.activo)}
                        style={{ padding: "4px 10px", fontSize: 12, opacity: soyYo ? 0.4 : 1 }}
                      >
                        {p.activo ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-faint)" }}>
                      {new Date(p.created_at).toLocaleDateString("es-MX")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-ghost"
                          title="Reset 2FA"
                          disabled={soyYo}
                          onClick={() => resetTotp(p.id)}
                          style={{ padding: "5px 8px", opacity: soyYo ? 0.3 : 1 }}
                        >
                          <KeyRound size={14} strokeWidth={1.75} />
                        </button>
                        <button
                          title="Eliminar usuario"
                          disabled={soyYo}
                          onClick={() => setConfirmElim(p.id)}
                          style={{
                            padding: "5px 8px", border: "1px solid var(--red)", borderRadius: 6,
                            background: "transparent", color: "var(--red)", cursor: soyYo ? "not-allowed" : "pointer",
                            opacity: soyYo ? 0.3 : 1, fontFamily: "inherit", display: "inline-flex",
                          }}
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Nuevo usuario */}
      {modal && <ModalNuevoUsuario onClose={() => setModal(false)} onCreated={() => { setModal(false); cargar(); setAviso({ tipo: "ok", msg: "Usuario creado exitosamente." }); }} />}

      {/* Modal: Confirmar eliminación */}
      {confirmElim && (
        <div onClick={() => setConfirmElim(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.4)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="panel" style={{ maxWidth: 400, padding: "32px 28px" }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Eliminar usuario</h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginBottom: 20 }}>
              Esta acción es irreversible. Se eliminará la cuenta y todos los datos asociados.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setConfirmElim(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => eliminar(confirmElim)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalNuevoUsuario({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>("admin");
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function generarPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 14; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setPassword(pwd);
  }

  async function crear() {
    setError(null);
    if (!email || password.length < 8) { setError("Email y contraseña (min 8 chars) son requeridos."); return; }
    setGuardando(true);
    const res = await fetch("/api/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rol, activo }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) { setError(data.error); return; }
    onCreated();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.4)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 460, padding: "36px 32px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Nuevo usuario</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginBottom: 24 }}>Crea una cuenta con acceso al sistema.</p>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="field">
            <label>Correo *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@empresa.mx" />
          </div>
          <div className="field">
            <label>Contraseña inicial *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input mono" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={generarPassword} style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap" }}>Generar</button>
            </div>
          </div>
          <div className="field">
            <label>Rol</label>
            <select className="select" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => <option key={r} value={r}>{etiquetaRol(r)}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo al crear
          </label>

          {error && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13 }}>{error}</div>}

          <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.5 }}>
            Comparte las credenciales por un canal seguro (1Password, Signal). El usuario se enrolará en 2FA en su primer login.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={crear} disabled={guardando}>
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
