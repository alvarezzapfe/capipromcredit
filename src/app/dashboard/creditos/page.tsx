"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn, labelEstatus, ESTATUS_SOLICITUD } from "@/lib/format";
import { Inbox, Plus, ArrowRightCircle, Undo2 } from "lucide-react";
import { useRol } from "@/lib/useRol";
import { esSoloLectura } from "@/lib/rbac";
import { useIsMobile } from "@/lib/useIsMobile";
import Link from "next/link";

interface Solicitud {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rfc: string | null;
  monto_solicitado: number;
  plazo_meses: number;
  destino: string | null;
  estatus: string;
  created_at: string;
  credito_id: string | null;
  folio_credito?: string | null;
}

const formVacio = { nombre: "", email: "", telefono: "", rfc: "", monto_solicitado: "", plazo_meses: "", destino: "" };

export default function Solicitudes() {
  const isMobile = useIsMobile();
  const rol = useRol();
  const readOnly = rol ? esSoloLectura(rol) : false;
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<string>("todas");

  const [errCambio, setErrCambio] = useState<string | null>(null);
  const [msgExito, setMsgExito] = useState<string | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<string | null>(null); // solicitud_id en proceso

  // Modal nueva solicitud
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(formVacio);
  const [guardando, setGuardando] = useState(false);
  const [errModal, setErrModal] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("solicitudes")
      .select("*")
      .order("created_at", { ascending: false });

    // Enrich convertidas with folio
    const sols = (data ?? []) as Solicitud[];
    const convertidas = sols.filter((s) => s.credito_id);
    if (convertidas.length > 0) {
      const ids = convertidas.map((s) => s.credito_id!);
      const { data: creds } = await supabase
        .from("creditos")
        .select("id, folio")
        .in("id", ids);
      const folioMap = new Map((creds ?? []).map((c: any) => [c.id, c.folio]));
      for (const s of sols) {
        if (s.credito_id) s.folio_credito = folioMap.get(s.credito_id) ?? null;
      }
    }

    setSolicitudes(sols);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiar(id: string, nuevoEstatus: string) {
    setErrCambio(null);
    setMsgExito(null);

    // Si pasa a "aprobada", ofrecer conversión directa
    if (nuevoEstatus === "aprobada") {
      const supabase = createClient();
      const { error: errUpd } = await supabase.from("solicitudes").update({ estatus: nuevoEstatus }).eq("id", id);
      if (errUpd) { setErrCambio("Error al actualizar: " + errUpd.message); setTimeout(() => setErrCambio(null), 6000); return; }
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("bitacora").insert({ entidad: "solicitud", entidad_id: id, accion: "cambio_estatus", detalle: { a: nuevoEstatus }, usuario: userData.user?.email ?? "sistema" });
      await cargar();

      // Ofrecer convertir inmediatamente
      if (confirm("Solicitud aprobada. ¿Convertir a crédito borrador en cartera? (Los términos se podrán editar antes de activar)")) {
        await convertir(id);
      }
      return;
    }

    const supabase = createClient();
    const { error: errUpd } = await supabase.from("solicitudes").update({ estatus: nuevoEstatus }).eq("id", id);
    if (errUpd) {
      setErrCambio("Error al actualizar: " + errUpd.message);
      setTimeout(() => setErrCambio(null), 6000);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("bitacora").insert({
      entidad: "solicitud",
      entidad_id: id,
      accion: "cambio_estatus",
      detalle: { a: nuevoEstatus },
      usuario: userData.user?.email ?? "sistema",
    });
    cargar();
  }

  async function convertir(solicitudId: string) {
    setErrCambio(null);
    setMsgExito(null);
    setConvirtiendo(solicitudId);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("convertir_solicitud_a_credito", { p_solicitud_id: solicitudId });
    setConvirtiendo(null);

    if (error) {
      console.error("RPC convertir_solicitud_a_credito falló:", error);
      setErrCambio("Error al convertir: " + error.message + (error.hint ? ` (hint: ${error.hint})` : "") + (error.code ? ` [${error.code}]` : ""));
      return;
    }
    const folio = (data as any)?.folio ?? "";
    setMsgExito(`Crédito ${folio} creado como borrador. Edita los términos en Cartera y actívalo.`);
    setTimeout(() => setMsgExito(null), 10000);
    cargar();
  }

  async function anularConversion(solicitudId: string) {
    if (!confirm("¿Anular la conversión? El crédito borrador se cancelará y la solicitud volverá a 'Aprobada'.")) return;
    setErrCambio(null);
    setMsgExito(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("anular_conversion_solicitud", { p_solicitud_id: solicitudId });
    if (error) {
      console.error("RPC anular_conversion_solicitud falló:", error);
      setErrCambio("Error al anular: " + error.message + (error.hint ? ` (hint: ${error.hint})` : "") + (error.code ? ` [${error.code}]` : ""));
      return;
    }
    setMsgExito("Conversión anulada. La solicitud volvió a 'Aprobada'.");
    setTimeout(() => setMsgExito(null), 8000);
    cargar();
  }

  async function guardarSolicitud() {
    setErrModal(null);
    if (!form.nombre || !form.monto_solicitado || !form.plazo_meses) {
      setErrModal("Completa nombre, monto y plazo.");
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operadorEmail = userData.user?.email ?? "sistema";

    const { data: inserted, error } = await supabase.from("solicitudes").insert({
      nombre: form.nombre,
      email: form.email || operadorEmail,
      telefono: form.telefono || null,
      rfc: form.rfc ? form.rfc.toUpperCase() : null,
      monto_solicitado: Number(form.monto_solicitado),
      plazo_meses: Number(form.plazo_meses),
      destino: form.destino || null,
    }).select("id").single();

    if (error) {
      setGuardando(false);
      setErrModal("Error al guardar: " + error.message);
      return;
    }

    await supabase.from("bitacora").insert({
      entidad: "solicitud",
      entidad_id: inserted.id,
      accion: "creado",
      detalle: { origen: "alta_manual", operador: operadorEmail },
      usuario: operadorEmail,
    });

    setGuardando(false);
    setModal(false);
    setForm(formVacio);
    cargar();
  }

  // Filter: "todas" excluye convertidas; "convertida" es pestaña aparte
  const filtradas =
    filtro === "todas"
      ? solicitudes.filter((s) => s.estatus !== "convertida")
      : solicitudes.filter((s) => s.estatus === filtro);

  return (
    <div style={{ padding: isMobile ? "20px 16px 40px" : "32px 48px 60px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>Solicitudes</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
            Alta y seguimiento de prospectos de crédito.
          </p>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            + Nueva solicitud
          </button>
        )}
      </header>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {["todas", ...ESTATUS_SOLICITUD].map((f) => {
          const activo = filtro === f;
          const count = f === "todas"
            ? solicitudes.filter((s) => s.estatus !== "convertida").length
            : solicitudes.filter((s) => s.estatus === f).length;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: activo ? 600 : 500,
                fontFamily: "inherit",
                borderRadius: 999,
                border: activo ? "1px solid #c8841f" : "1px solid #e4e8ee",
                background: activo ? "#faf0dd" : "transparent",
                color: activo ? "#c8841f" : "#5b6b80",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => {
                if (!activo) {
                  e.currentTarget.style.borderColor = "#cbd5e1";
                  e.currentTarget.style.color = "#0a1628";
                }
              }}
              onMouseLeave={(e) => {
                if (!activo) {
                  e.currentTarget.style.borderColor = "#e4e8ee";
                  e.currentTarget.style.color = "#5b6b80";
                }
              }}
            >
              {f === "todas" ? "Todas" : labelEstatus[f]}
              <span style={{ fontSize: 11.5, opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {errCambio && (
        <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <span>{errCambio}</span>
          <button onClick={() => setErrCambio(null)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontWeight: 700, fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0 }}>✕</button>
        </div>
      )}
      {msgExito && (
        <div style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18 }}>{msgExito}</div>
      )}

      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>Cargando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: "80px 40px", textAlign: "center" }}>
            <Inbox size={36} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginTop: 14 }}>
              {filtro !== "todas" ? `Sin solicitudes "${labelEstatus[filtro]}"` : "Sin solicitudes registradas"}
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, maxWidth: 320, margin: "4px auto 0" }}>
              Da de alta el primer prospecto de crédito o impórtalos desde Excel.
            </p>
            {filtro === "todas" && (
              <button className="btn btn-primary" onClick={() => setModal(true)} style={{ marginTop: 20, fontSize: 13, padding: "9px 18px" }}>
                <Plus size={14} strokeWidth={1.75} /> Nueva solicitud
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Solicitante</th>
                <th>Contacto</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th>Plazo</th>
                <th>Recibida</th>
                <th>Estatus</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                    {s.rfc && <div className="mono" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{s.rfc}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <div>{s.email}</div>
                    {s.telefono && <div style={{ color: "var(--text-dim)" }}>{s.telefono}</div>}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(s.monto_solicitado))}</td>
                  <td className="mono">{s.plazo_meses}m</td>
                  <td style={{ fontSize: 13 }}>{new Date(s.created_at).toLocaleDateString("es-MX")}</td>
                  <td>
                    <span className={`badge badge-${s.estatus}`}>{labelEstatus[s.estatus]}</span>
                  </td>
                  <td>
                    {s.estatus === "convertida" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {s.folio_credito ? (
                          <Link
                            href="/dashboard/cartera"
                            style={{ fontSize: 12.5, color: "#c8841f", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            Ver {s.folio_credito} <ArrowRightCircle size={13} />
                          </Link>
                        ) : (
                          <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Convertida</span>
                        )}
                        {rol === "super_admin" && (
                          <button
                            onClick={() => anularConversion(s.id)}
                            title="Anular conversión (super_admin)"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#94a3b8" }}
                          >
                            <Undo2 size={14} />
                          </button>
                        )}
                      </div>
                    ) : s.estatus === "aprobada" && !s.credito_id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {readOnly ? (
                          <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>—</span>
                        ) : (
                          <>
                            <select
                              className="select"
                              value={s.estatus}
                              onChange={(e) => cambiar(s.id, e.target.value)}
                              style={{ padding: "6px 10px", fontSize: 12.5, width: "auto" }}
                            >
                              {ESTATUS_SOLICITUD.filter((es) => es !== "convertida").map((es) => (
                                <option key={es} value={es}>{labelEstatus[es]}</option>
                              ))}
                            </select>
                            <button
                              className="btn btn-primary"
                              onClick={() => {
                                if (confirm("Esto creará el crédito en cartera con términos default por revisar. ¿Continuar?")) {
                                  convertir(s.id);
                                }
                              }}
                              disabled={convirtiendo === s.id}
                              style={{ padding: "5px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                            >
                              {convirtiendo === s.id ? "Convirtiendo…" : "Convertir a crédito"}
                            </button>
                          </>
                        )}
                      </div>
                    ) : readOnly ? (
                      <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>—</span>
                    ) : (
                      <select
                        className="select"
                        value={s.estatus}
                        onChange={(e) => cambiar(s.id, e.target.value)}
                        style={{ padding: "6px 10px", fontSize: 12.5, width: "auto" }}
                      >
                        {ESTATUS_SOLICITUD.filter((es) => es !== "convertida").map((es) => (
                          <option key={es} value={es}>{labelEstatus[es]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ---- Modal: Nueva solicitud ---- */}
      {modal && (
        <div
          onClick={() => setModal(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(10,22,40,0.4)", backdropFilter: "blur(6px)",
            display: "grid", placeItems: "center", zIndex: 100, overflowY: "auto",
          }}
        >
          <div
            className="panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 500, padding: isMobile ? "24px 20px" : "36px 34px" }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0a1628", marginBottom: 6 }}>
              Nueva solicitud
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginBottom: 24 }}>
              Alta manual de prospecto de crédito.
            </p>

            <div style={{ display: "grid", gap: 16 }}>
              <div className="field">
                <label>Nombre completo *</label>
                <input className="input" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre y apellidos" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="field">
                  <label>Correo</label>
                  <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="correo@ejemplo.com" />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input className="input" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="55 0000 0000" />
                </div>
              </div>

              <div className="field">
                <label>RFC</label>
                <input className="input" value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="field">
                  <label>Monto solicitado (MXN) *</label>
                  <input className="input mono" type="number" value={form.monto_solicitado} onChange={(e) => set("monto_solicitado", e.target.value)} placeholder="100000" />
                </div>
                <div className="field">
                  <label>Plazo (meses) *</label>
                  <input className="input mono" type="number" value={form.plazo_meses} onChange={(e) => set("plazo_meses", e.target.value)} placeholder="12" />
                </div>
              </div>

              <div className="field">
                <label>Destino del crédito</label>
                <textarea className="textarea" rows={2} value={form.destino} onChange={(e) => set("destino", e.target.value)} placeholder="Capital de trabajo, equipamiento, etc." />
              </div>

              {errModal && (
                <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 13.5 }}>
                  {errModal}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarSolicitud} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar solicitud"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
