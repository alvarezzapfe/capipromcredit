"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn } from "@/lib/format";
import { Settings, Download, Trash2, Plus, Pencil, ShieldAlert } from "lucide-react";
import { useRol } from "@/lib/useRol";
import { esSoloLectura } from "@/lib/rbac";
import { useIsMobile } from "@/lib/useIsMobile";
import { fmtPct } from "@/lib/credit-engine/rate-label";

type Tab = "datos" | "tasas";

interface RateRow {
  id: string;
  rate_type: string;
  rate_date: string;
  rate_value: number;
}

const RATE_TYPE_LABEL: Record<string, string> = {
  TIIE_28: "TIIE 28d",
  TIIE_FONDEO: "TIIE Fondeo",
  TIIE_91: "TIIE 91d",
  TIIE_182: "TIIE 182d",
};

export default function Configuracion() {
  const m = useIsMobile();
  const rol = useRol();
  const readOnly = rol ? esSoloLectura(rol) : true;
  const canWipe = rol === "super_admin" || rol === "admin";
  const [tab, setTab] = useState<Tab>("datos");

  return (
    <div style={{ padding: m ? "20px 16px 40px" : "32px 48px 60px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 className="display" style={{ fontSize: 32, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
          <Settings size={28} strokeWidth={1.75} style={{ color: "var(--amber)" }} />
          Configuración
        </h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
          Respaldo, limpieza de datos y catálogos de tasas.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid var(--line)" }}>
        {([["datos", "Datos"], ["tasas", "Tasas y catálogos"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "10px 20px", fontSize: 14, fontWeight: tab === key ? 600 : 500,
              fontFamily: "inherit", background: "none", border: "none", cursor: "pointer",
              color: tab === key ? "var(--amber)" : "var(--text-dim)",
              borderBottom: tab === key ? "2px solid var(--amber)" : "2px solid transparent",
              marginBottom: -2, transition: "all 0.12s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "datos" && <TabDatos canWipe={canWipe} readOnly={readOnly} isMobile={m} />}
      {tab === "tasas" && <TabTasas readOnly={readOnly} isMobile={m} />}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB: DATOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabDatos({ canWipe, readOnly, isMobile }: { canWipe: boolean; readOnly: boolean; isMobile?: boolean }) {
  const [incluyeTasas, setIncluyeTasas] = useState(false);
  const [backupAntes, setBackupAntes] = useState(true);
  const [backupDescargado, setBackupDescargado] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);

  const scope = incluyeTasas ? "con_tasas" : "operativo";

  async function descargarBackup() {
    setDescargando(true);
    try {
      const res = await fetch(`/api/configuracion/backup?scope=${scope}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") ?? "capiprom_backup.json";
      a.click();
      URL.revokeObjectURL(url);
      setBackupDescargado(true);
    } catch (e: any) {
      alert("Error descargando backup: " + e.message);
    }
    setDescargando(false);
  }

  const puedeVaciar = canWipe && (!backupAntes || backupDescargado);

  return (
    <div>
      {/* Export */}
      <div className="panel" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Respaldo de datos</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
          Descarga un archivo JSON con todos los datos operativos (créditos, solicitudes, clientes, expedientes).
        </p>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={incluyeTasas} onChange={(e) => setIncluyeTasas(e.target.checked)} />
          Incluir también tasas y catálogos
        </label>
        <button className="btn btn-primary" onClick={descargarBackup} disabled={descargando || readOnly} style={{ padding: "9px 18px", fontSize: 13 }}>
          <Download size={14} strokeWidth={1.75} /> {descargando ? "Descargando…" : "Descargar respaldo"}
        </button>
        {backupDescargado && <span style={{ fontSize: 12, color: "var(--green)", marginLeft: 12 }}>Respaldo descargado</span>}
      </div>

      {/* Wipe */}
      <div className="panel" style={{ padding: "20px 24px", border: "1px solid var(--red)", borderColor: canWipe ? "#fca5a5" : "var(--line)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: canWipe ? "var(--red)" : "var(--text-dim)" }}>
          <Trash2 size={16} strokeWidth={1.75} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Vaciar datos
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
          Elimina créditos, solicitudes, clientes y expedientes. Conserva usuarios, roles, 2FA y el audit trail.
        </p>

        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={incluyeTasas} onChange={(e) => { setIncluyeTasas(e.target.checked); setBackupDescargado(false); }} />
          Incluir también tasas y catálogos
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={backupAntes} onChange={(e) => { setBackupAntes(e.target.checked); if (!e.target.checked) setBackupDescargado(false); }} />
          Respaldar antes de vaciar (recomendado)
        </label>

        {backupAntes && !backupDescargado && (
          <div style={{ fontSize: 12.5, color: "var(--amber)", background: "var(--amber-soft)", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
            Descarga el respaldo primero para habilitar el vaciado.
          </div>
        )}

        {!canWipe ? (
          <div style={{ fontSize: 13, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={14} /> Requiere rol admin o super_admin
          </div>
        ) : (
          <button
            className="btn"
            onClick={() => setMostrarModal(true)}
            disabled={!puedeVaciar}
            style={{
              padding: "9px 18px", fontSize: 13, fontFamily: "inherit", fontWeight: 600,
              background: puedeVaciar ? "var(--red)" : "var(--line)",
              color: puedeVaciar ? "#fff" : "var(--text-faint)",
              border: "none", borderRadius: 6, cursor: puedeVaciar ? "pointer" : "not-allowed",
            }}
          >
            <Trash2 size={14} strokeWidth={1.75} /> Vaciar datos
          </button>
        )}
      </div>

      {mostrarModal && (
        <ModalVaciar scope={scope} onClose={() => setMostrarModal(false)} onDone={() => { setMostrarModal(false); setBackupDescargado(false); }} />
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODAL: Confirmación de vaciado
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ModalVaciar({ scope, onClose, onDone }: { scope: string; onClose: () => void; onDone: () => void }) {
  const [entiendo, setEntiendo] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [factorVal, setFactorVal] = useState("");
  const [tieneTotp, setTieneTotp] = useState<boolean | null>(null);
  const [vaciando, setVaciando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("user_totp").select("pending").eq("user_id", user.id).maybeSingle();
      setTieneTotp(!!data && !data.pending);
    })();
  }, []);

  const puedeConfirmar = entiendo && confirmText === "VACIAR" && factorVal.length > 0 && !vaciando;

  async function ejecutar() {
    setError(null);
    setVaciando(true);
    try {
      const res = await fetch("/api/configuracion/vaciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          segundo_factor: {
            tipo: tieneTotp ? "totp" : "password",
            valor: factorVal,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido");
        setVaciando(false);
        return;
      }
      setResultado(data.conteos);
    } catch (e: any) {
      setError(e.message);
    }
    setVaciando(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.5)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 200, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 480, padding: "28px 28px" }}>
        {resultado ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--green)", marginBottom: 16 }}>Datos vaciados</h2>
            <div style={{ display: "grid", gap: 4, marginBottom: 20 }}>
              {Object.entries(resultado).map(([tabla, n]) => (
                <div key={tabla} style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>{tabla}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{n} registros</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={onDone} style={{ width: "100%" }}>Cerrar</button>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>
              <ShieldAlert size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Vaciar datos — Acción irreversible
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
              Se eliminarán {scope === "con_tasas" ? "datos operativos + tasas" : "datos operativos"}.
              Usuarios, roles, 2FA y audit trail se conservan.
            </p>

            <label style={{ fontSize: 13, display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Entiendo que esta acción es <strong>irreversible</strong> y eliminará permanentemente los datos seleccionados.</span>
            </label>

            <div className="field" style={{ marginBottom: 16 }}>
              <label>Escribe <strong>VACIAR</strong> para confirmar</label>
              <input className="input mono" value={confirmText} onChange={(e) => setConfirmText(e.target.value.toUpperCase())} placeholder="VACIAR" autoComplete="off" />
            </div>

            <div className="field" style={{ marginBottom: 16 }}>
              <label>{tieneTotp ? "Código TOTP (6 dígitos)" : "Contraseña"}</label>
              <input
                className="input mono"
                type={tieneTotp ? "text" : "password"}
                value={factorVal}
                onChange={(e) => setFactorVal(e.target.value)}
                placeholder={tieneTotp ? "000000" : "Tu contraseña"}
                maxLength={tieneTotp ? 6 : 200}
                autoComplete="off"
              />
            </div>

            {error && (
              <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
              <button
                onClick={ejecutar}
                disabled={!puedeConfirmar}
                style={{
                  flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                  background: puedeConfirmar ? "var(--red)" : "var(--line)", color: puedeConfirmar ? "#fff" : "var(--text-faint)",
                  border: "none", borderRadius: 6, cursor: puedeConfirmar ? "pointer" : "not-allowed",
                }}
              >
                {vaciando ? "Vaciando…" : "Confirmar vaciado"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB: TASAS Y CATÁLOGOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabTasas({ readOnly, isMobile }: { readOnly: boolean; isMobile?: boolean }) {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ rate_type: "TIIE_28", rate_date: "", rate_value: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const sb = createClient();
    const { data } = await sb.from("rate_catalog").select("*").order("rate_date", { ascending: false });
    setRates((data ?? []) as RateRow[]);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setError(null);
    const val = Number(form.rate_value);
    if (!form.rate_date) { setError("Fecha requerida"); return; }
    if (!val || val <= 0) { setError("Valor debe ser > 0"); return; }

    setGuardando(true);
    const sb = createClient();
    const row = { rate_type: form.rate_type, rate_date: form.rate_date, rate_value: val / 100 };

    if (editId) {
      const { error: err } = await sb.from("rate_catalog").update(row).eq("id", editId);
      if (err) { setError(err.message); setGuardando(false); return; }
    } else {
      const { error: err } = await sb.from("rate_catalog").insert(row);
      if (err) { setError(err.message); setGuardando(false); return; }
    }

    setForm({ rate_type: "TIIE_28", rate_date: "", rate_value: "" });
    setEditId(null);
    setGuardando(false);
    cargar();
  }

  function iniciarEdicion(r: RateRow) {
    setEditId(r.id);
    setForm({ rate_type: r.rate_type, rate_date: r.rate_date, rate_value: (Number(r.rate_value) * 100).toFixed(4) });
    setError(null);
  }

  // Group latest rate per type for summary
  const latest = new Map<string, RateRow>();
  for (const r of rates) {
    if (!latest.has(r.rate_type)) latest.set(r.rate_type, r);
  }

  return (
    <div>
      {/* Latest rates summary */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {Array.from(latest.entries()).map(([type, r]) => (
          <div key={type} className="panel" style={{ padding: "12px 16px", minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {RATE_TYPE_LABEL[type] ?? type}
            </div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{fmtPct(Number(r.rate_value))}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{r.rate_date}</div>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {!readOnly && (
        <div className="panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {editId ? "Editar valor" : "Agregar nuevo valor"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div className="field">
              <label>Tipo</label>
              <select className="select" value={form.rate_type} onChange={(e) => setForm((f) => ({ ...f, rate_type: e.target.value }))}>
                {Object.entries(RATE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fecha</label>
              <input className="input mono" type="date" value={form.rate_date} onChange={(e) => setForm((f) => ({ ...f, rate_date: e.target.value }))} />
            </div>
            <div className="field">
              <label>Valor (%)</label>
              <input className="input mono" type="number" step="0.0001" value={form.rate_value} onChange={(e) => setForm((f) => ({ ...f, rate_value: e.target.value }))} placeholder="6.7559" />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ padding: "8px 14px", fontSize: 13 }}>
                {editId ? <Pencil size={14} /> : <Plus size={14} />}
                {guardando ? "…" : editId ? "Guardar" : "Agregar"}
              </button>
              {editId && (
                <button className="btn btn-ghost" onClick={() => { setEditId(null); setForm({ rate_type: "TIIE_28", rate_date: "", rate_value: "" }); }} style={{ padding: "8px 10px", fontSize: 13 }}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
          {error && <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>}
        </div>
      )}

      {/* Table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>Cargando…</div>
        ) : rates.length === 0 ? (
          <div style={{ padding: "60px 40px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
            Sin datos en el catálogo de tasas
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  {!readOnly && <th style={{ width: 60 }}></th>}
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="badge" style={{ background: "#f0f2f5", color: "#64748b", fontSize: 11 }}>
                        {RATE_TYPE_LABEL[r.rate_type] ?? r.rate_type}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 13 }}>{r.rate_date}</td>
                    <td className="mono" style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{fmtPct(Number(r.rate_value))}</td>
                    {!readOnly && (
                      <td>
                        <button
                          onClick={() => iniciarEdicion(r)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-dim)" }}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
