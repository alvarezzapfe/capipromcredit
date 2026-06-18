"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn } from "@/lib/format";
import { Settings, Download, Trash2, Plus, ShieldAlert, Cloud, RefreshCw } from "lucide-react";
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

interface BackupItem {
  name: string;
  size: number;
  created_at: string;
  signedUrl: string | null;
}

function TabDatos({ canWipe, readOnly, isMobile }: { canWipe: boolean; readOnly: boolean; isMobile?: boolean }) {
  const [incluyeTasas, setIncluyeTasas] = useState(false);
  const [backupAntes, setBackupAntes] = useState(true);
  const [backupOk, setBackupOk] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  // Saved backups list
  const [respaldos, setRespaldos] = useState<BackupItem[]>([]);
  const [cargandoResp, setCargandoResp] = useState(false);

  const scope = incluyeTasas ? "con_tasas" : "operativo";

  const cargarRespaldos = useCallback(async () => {
    if (readOnly) return;
    setCargandoResp(true);
    try {
      const res = await fetch("/api/configuracion/respaldos");
      if (res.ok) {
        const data = await res.json();
        setRespaldos(data.items ?? []);
      }
    } catch { /* ignore */ }
    setCargandoResp(false);
  }, [readOnly]);

  useEffect(() => { cargarRespaldos(); }, [cargarRespaldos]);

  /** Upload backup to cloud bucket */
  async function subirRespaldo() {
    setSubiendo(true);
    setBackupMsg(null);
    try {
      const res = await fetch("/api/configuracion/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setBackupOk(true);
      setBackupMsg(`Respaldo guardado: ${data.filename}`);
      cargarRespaldos();
    } catch (e: any) {
      setBackupMsg("Error: " + e.message);
    }
    setSubiendo(false);
  }

  /** Direct download (legacy) */
  async function descargarDirecto() {
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
      setBackupOk(true);
    } catch (e: any) {
      setBackupMsg("Error: " + e.message);
    }
    setDescargando(false);
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const puedeVaciar = canWipe && (!backupAntes || backupOk);

  return (
    <div>
      {/* Backup */}
      <div className="panel" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          <Cloud size={16} strokeWidth={1.75} style={{ marginRight: 6, verticalAlign: "middle", color: "var(--amber)" }} />
          Respaldo de datos
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
          Genera un respaldo JSON y lo guarda en la nube. También puedes descargar directamente.
        </p>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={incluyeTasas} onChange={(e) => setIncluyeTasas(e.target.checked)} />
          Incluir también tasas y catálogos
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={subirRespaldo} disabled={subiendo || readOnly} style={{ padding: "9px 18px", fontSize: 13 }}>
            <Cloud size={14} strokeWidth={1.75} /> {subiendo ? "Guardando…" : "Guardar respaldo en nube"}
          </button>
          <button className="btn btn-ghost" onClick={descargarDirecto} disabled={descargando || readOnly} style={{ padding: "9px 18px", fontSize: 13 }}>
            <Download size={14} strokeWidth={1.75} /> {descargando ? "Descargando…" : "Descarga directa"}
          </button>
        </div>
        {backupMsg && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: backupOk ? "var(--green)" : "var(--red)" }}>{backupMsg}</div>
        )}
      </div>

      {/* Saved backups */}
      {!readOnly && (
        <div className="panel" style={{ padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Respaldos guardados</h3>
            <button onClick={cargarRespaldos} disabled={cargandoResp} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }} title="Recargar">
              <RefreshCw size={14} strokeWidth={1.75} style={{ animation: cargandoResp ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
          {cargandoResp ? (
            <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "12px 0" }}>Cargando…</div>
          ) : respaldos.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "12px 0" }}>Sin respaldos guardados</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {respaldos.map((r) => (
                <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "—"}
                      {r.size > 0 && <span> · {fmtSize(r.size)}</span>}
                    </div>
                  </div>
                  {r.signedUrl && (
                    <a href={r.signedUrl} download={r.name} style={{ color: "var(--amber)", fontSize: 12.5, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <Download size={13} /> Descargar
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          <input type="checkbox" checked={incluyeTasas} onChange={(e) => { setIncluyeTasas(e.target.checked); setBackupOk(false); setBackupMsg(null); }} />
          Incluir también tasas y catálogos
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={backupAntes} onChange={(e) => { setBackupAntes(e.target.checked); if (!e.target.checked) { setBackupOk(false); setBackupMsg(null); } }} />
          Respaldar antes de vaciar (recomendado)
        </label>

        {backupAntes && !backupOk && (
          <div style={{ fontSize: 12.5, color: "var(--amber)", background: "var(--amber-soft)", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
            Guarda un respaldo en la nube primero para habilitar el vaciado.
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
        <ModalVaciar scope={scope} onClose={() => setMostrarModal(false)} onDone={() => { setMostrarModal(false); setBackupOk(false); setBackupMsg(null); }} />
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
  const rol = useRol();
  const esSuperAdmin = rol === "super_admin";
  const [rates, setRates] = useState<RateRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ rate_type: "TIIE_28", rate_type_custom: "", rate_date: "", rate_value: "" });
  const [usaCustom, setUsaCustom] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const sb = createClient();
    const { data } = await sb.from("rate_catalog").select("*").order("rate_date", { ascending: false });
    setRates((data ?? []) as RateRow[]);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Dynamic rate types from existing data
  const tiposExistentes = Array.from(new Set(rates.map((r) => r.rate_type)));

  async function guardar() {
    setError(null);
    setExito(null);
    const rateType = usaCustom ? form.rate_type_custom.trim().toUpperCase().replace(/\s+/g, "_") : form.rate_type;
    const val = Number(form.rate_value);
    if (!rateType) { setError("Tipo de tasa requerido"); return; }
    if (!form.rate_date) { setError("Fecha de vigencia requerida"); return; }
    if (!val || val <= 0) { setError("Valor debe ser mayor a 0"); return; }

    setGuardando(true);
    try {
      const res = await fetch("/api/configuracion/tasas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_type: rateType, rate_date: form.rate_date, rate_value: val / 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setExito(`${RATE_TYPE_LABEL[rateType] ?? rateType} al ${form.rate_date}: ${val}%`);
      setForm({ rate_type: rateType, rate_type_custom: "", rate_date: "", rate_value: "" });
      setUsaCustom(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
    setGuardando(false);
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

      {/* Load rate form — super_admin only */}
      <div className="panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Cargar tasa</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
          Inserta un nuevo valor al historial del catálogo (no edita los anteriores).
        </p>
        {!esSuperAdmin ? (
          <div style={{ fontSize: 13, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={14} /> Solo super admin puede cargar tasas
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div className="field">
                <label>Tipo de tasa</label>
                {usaCustom ? (
                  <input className="input mono" value={form.rate_type_custom} onChange={(e) => setForm((f) => ({ ...f, rate_type_custom: e.target.value }))} placeholder="NUEVO_TIPO" />
                ) : (
                  <select className="select" value={form.rate_type} onChange={(e) => setForm((f) => ({ ...f, rate_type: e.target.value }))}>
                    {tiposExistentes.map((t) => <option key={t} value={t}>{RATE_TYPE_LABEL[t] ?? t}</option>)}
                  </select>
                )}
                <label style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, marginTop: 4, cursor: "pointer", color: "var(--text-dim)" }}>
                  <input type="checkbox" checked={usaCustom} onChange={(e) => setUsaCustom(e.target.checked)} />
                  Nuevo tipo
                </label>
              </div>
              <div className="field">
                <label>Fecha de vigencia</label>
                <input className="input mono" type="date" value={form.rate_date} onChange={(e) => setForm((f) => ({ ...f, rate_date: e.target.value }))} />
              </div>
              <div className="field">
                <label>Valor (%)</label>
                <input className="input mono" type="number" step="0.0001" value={form.rate_value} onChange={(e) => setForm((f) => ({ ...f, rate_value: e.target.value }))} placeholder="6.7559" />
              </div>
            </div>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ padding: "8px 16px", fontSize: 13 }}>
              <Plus size={14} strokeWidth={1.75} /> {guardando ? "Guardando…" : "Cargar tasa"}
            </button>
            {error && <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>}
            {exito && <div style={{ marginTop: 8, fontSize: 13, color: "var(--green)" }}>Cargada: {exito}</div>}
          </>
        )}
      </div>

      {/* History table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Historial de tasas</h3>
        </div>
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
                  <th>Fecha de vigencia</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
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
