"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn, pct, fecha, labelEstatus, ESTATUS_CREDITO } from "@/lib/format";
import { Briefcase, Plus } from "lucide-react";
import {
  generarTablaAmortizacion,
  type Frecuencia,
  type MetodoAmort,
} from "@/lib/amortizacion";
import { useRol } from "@/lib/useRol";
import { esSoloLectura, puedeEliminar, puedeEliminarDesdeTabla, type Rol } from "@/lib/rbac";
import { Trash2 } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";

interface Credito {
  id: string;
  folio: string;
  acreditado: string;
  rfc: string | null;
  monto: number;
  tasa_anual: number;
  plazo_meses: number;
  frecuencia: string;
  metodo_amort: string;
  fecha_origen: string;
  estatus: string;
}

export default function Cartera() {
  const isMobile = useIsMobile();
  const rol = useRol();
  const readOnly = rol ? esSoloLectura(rol) : false;
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [detalle, setDetalle] = useState<Credito | null>(null);
  const [avisoElim, setAvisoElim] = useState<string | null>(null);
  const [elimDesdeTabla, setElimDesdeTabla] = useState<Credito | null>(null);
  const showTableDelete = puedeEliminarDesdeTabla(rol);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("creditos")
      .select("*")
      .order("created_at", { ascending: false });
    setCreditos((data ?? []) as Credito[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div style={{ padding: isMobile ? "20px 16px 40px" : "36px 40px 60px", maxWidth: 1200 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "flex-end",
          marginBottom: isMobile ? 20 : 28,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>
            Cartera de crédito
          </h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
            {creditos.length} crédito{creditos.length === 1 ? "" : "s"} en cartera.
          </p>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" onClick={() => setMostrarAlta(true)}>
            + Originar crédito
          </button>
        )}
      </header>

      {avisoElim && (
        <div style={{ background: "var(--green-soft)", color: "var(--green)", padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18 }}>
          {avisoElim}
        </div>
      )}

      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>
            Cargando…
          </div>
        ) : creditos.length === 0 ? (
          <div style={{ padding: "80px 40px", textAlign: "center" }}>
            <Briefcase size={36} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginTop: 14 }}>
              Cartera vacía
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, maxWidth: 320, margin: "4px auto 0" }}>
              Origina tu primer crédito para verlo aquí con su tabla de amortización.
            </p>
            {!readOnly && (
              <button className="btn btn-primary" onClick={() => setMostrarAlta(true)} style={{ marginTop: 20, fontSize: 13, padding: "9px 18px" }}>
                <Plus size={14} strokeWidth={1.75} /> Originar crédito
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Acreditado</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th>Tasa</th>
                <th>Plazo</th>
                <th>Origen</th>
                <th>Estatus</th>
                {showTableDelete && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {creditos.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setDetalle(c)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="mono" style={{ color: "var(--amber)" }}>{c.folio}</td>
                  <td>{c.acreditado}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.monto))}</td>
                  <td className="mono">{pct(Number(c.tasa_anual))}</td>
                  <td className="mono">{c.plazo_meses}m</td>
                  <td>{fecha(c.fecha_origen)}</td>
                  <td>
                    <span className={`badge badge-${c.estatus}`}>
                      {labelEstatus[c.estatus]}
                    </span>
                  </td>
                  {showTableDelete && (
                    <td style={{ textAlign: "right" }}>
                      <button
                        title="Eliminar crédito"
                        aria-label={`Eliminar crédito ${c.folio}`}
                        onClick={(e) => { e.stopPropagation(); setElimDesdeTabla(c); }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 5,
                          background: "transparent",
                          border: "none",
                          borderRadius: 4,
                          color: "var(--red)",
                          cursor: "pointer",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(181,72,72,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
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

      {mostrarAlta && (
        <ModalAlta
          isMobile={isMobile}
          onClose={() => setMostrarAlta(false)}
          onSaved={() => {
            setMostrarAlta(false);
            cargar();
          }}
        />
      )}

      {detalle && (
        <ModalDetalle
          credito={detalle}
          rol={rol}
          isMobile={isMobile}
          onClose={() => setDetalle(null)}
          onChanged={() => {
            cargar();
          }}
          onDeleted={(folio) => {
            setDetalle(null);
            cargar();
            setAvisoElim(`Crédito ${folio} eliminado.`);
            setTimeout(() => setAvisoElim(null), 6000);
          }}
        />
      )}

      {elimDesdeTabla && (
        <ModalConfirmarEliminacion
          credito={elimDesdeTabla}
          onClose={() => setElimDesdeTabla(null)}
          onDeleted={(folio) => {
            setElimDesdeTabla(null);
            cargar();
            setAvisoElim(`Crédito ${folio} eliminado.`);
            setTimeout(() => setAvisoElim(null), 6000);
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// MODAL: Alta / Originación de crédito
// =====================================================================
function ModalAlta({ onClose, onSaved, isMobile }: { onClose: () => void; onSaved: () => void; isMobile?: boolean }) {
  const [form, setForm] = useState({
    acreditado: "",
    rfc: "",
    monto: "",
    tasa_anual: "",
    plazo_meses: "",
    frecuencia: "mensual" as Frecuencia,
    metodo_amort: "lineal" as MetodoAmort,
    crecimiento: "5",
    fecha_origen: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Vista previa de amortización
  const puedePrevisualizar =
    form.monto && form.tasa_anual && form.plazo_meses;
  let preview: ReturnType<typeof generarTablaAmortizacion> = [];
  let previewErr: string | null = null;
  if (puedePrevisualizar) {
    try {
      preview = generarTablaAmortizacion({
        monto: Number(form.monto),
        tasaAnual: Number(form.tasa_anual) / 100,
        plazoMeses: Number(form.plazo_meses),
        frecuencia: form.frecuencia,
        metodo: form.metodo_amort,
        fechaOrigen: form.fecha_origen,
        crecimientoPeriodo: form.metodo_amort === "creciente" ? Number(form.crecimiento) / 100 : undefined,
      });
    } catch (e: any) {
      previewErr = e.message;
    }
  }

  async function guardar() {
    setError(null);
    if (!form.acreditado || !form.monto || !form.tasa_anual || !form.plazo_meses) {
      setError("Completa acreditado, monto, tasa y plazo.");
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    const folio = "CP-" + Date.now().toString().slice(-7);

    // 1. Insertar crédito
    const { data: credito, error: errCred } = await supabase
      .from("creditos")
      .insert({
        folio,
        acreditado: form.acreditado,
        rfc: form.rfc || null,
        monto: Number(form.monto),
        tasa_anual: Number(form.tasa_anual) / 100,
        plazo_meses: Number(form.plazo_meses),
        frecuencia: form.frecuencia,
        metodo_amort: form.metodo_amort,
        fecha_origen: form.fecha_origen,
        estatus: "vigente",
      })
      .select()
      .single();

    if (errCred || !credito) {
      setGuardando(false);
      setError("Error al crear el crédito: " + (errCred?.message ?? ""));
      return;
    }

    // 2. Generar e insertar amortización
    const tabla = generarTablaAmortizacion({
      monto: Number(form.monto),
      tasaAnual: Number(form.tasa_anual) / 100,
      plazoMeses: Number(form.plazo_meses),
      frecuencia: form.frecuencia,
      metodo: form.metodo_amort,
      fechaOrigen: form.fecha_origen,
      crecimientoPeriodo: form.metodo_amort === "creciente" ? Number(form.crecimiento) / 100 : undefined,
    });
    const filas = tabla.map((c) => ({
      credito_id: credito.id,
      numero_cupon: c.numero_cupon,
      fecha_pago: c.fecha_pago,
      saldo_inicial: c.saldo_inicial,
      capital: c.capital,
      interes: c.interes,
      pago_total: c.pago_total,
      saldo_final: c.saldo_final,
    }));
    await supabase.from("amortizacion").insert(filas);

    // 3. Bitácora
    await supabase.from("bitacora").insert({
      entidad: "credito",
      entidad_id: credito.id,
      accion: "creado",
      detalle: { folio, monto: Number(form.monto), cupones: tabla.length },
      usuario: operador,
    });

    setGuardando(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 0 }}>
        {/* Formulario */}
        <div style={{ padding: isMobile ? "24px 20px" : "30px 30px", borderRight: isMobile ? "none" : "1px solid var(--line)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0a1628", marginBottom: 22 }}>
            Originar crédito
          </h2>
          <div style={{ display: "grid", gap: 15 }}>
            <div className="field">
              <label>Acreditado *</label>
              <input className="input" value={form.acreditado} onChange={(e) => set("acreditado", e.target.value)} placeholder="Nombre o razón social" />
            </div>
            <div className="field">
              <label>RFC</label>
              <input className="input" value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label>Monto (MXN) *</label>
                <input className="input mono" type="number" value={form.monto} onChange={(e) => set("monto", e.target.value)} placeholder="100000" />
              </div>
              <div className="field">
                <label>Tasa anual (%) *</label>
                <input className="input mono" type="number" value={form.tasa_anual} onChange={(e) => set("tasa_anual", e.target.value)} placeholder="24" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label>Plazo (meses) *</label>
                <input className="input mono" type="number" value={form.plazo_meses} onChange={(e) => set("plazo_meses", e.target.value)} placeholder="12" />
              </div>
              <div className="field">
                <label>Fecha de origen</label>
                <input className="input mono" type="date" value={form.fecha_origen} onChange={(e) => set("fecha_origen", e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label>Frecuencia</label>
                <select className="select" value={form.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}>
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
              <div className="field">
                <label>Método</label>
                <select className="select" value={form.metodo_amort} onChange={(e) => set("metodo_amort", e.target.value)}>
                  <option value="lineal">Lineal</option>
                  <option value="bullet">Bullet</option>
                  <option value="creciente">Creciente</option>
                </select>
                <span style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                  {form.metodo_amort === "lineal" && "Capital constante, interés decreciente."}
                  {form.metodo_amort === "bullet" && "Solo intereses; capital al final."}
                  {form.metodo_amort === "creciente" && "Cuotas crecen periodo a periodo."}
                </span>
              </div>
            </div>

            {form.metodo_amort === "creciente" && (
              <div className="field">
                <label>Crecimiento por periodo (%)</label>
                <input className="input mono" type="number" value={form.crecimiento} onChange={(e) => set("crecimiento", e.target.value)} placeholder="5" style={{ maxWidth: 160 }} />
              </div>
            )}

            {error && (
              <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 13.5 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ flex: 1 }}>
                {guardando ? "Guardando…" : "Originar"}
              </button>
            </div>
          </div>
        </div>

        {/* Vista previa de amortización */}
        <div style={{ padding: "30px 26px", background: "#f4f6f8", maxHeight: "82vh", overflowY: "auto" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 6 }}>
            Vista previa
          </h3>
          {previewErr ? (
            <p style={{ color: "var(--red)", fontSize: 13 }}>{previewErr}</p>
          ) : preview.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: 13.5 }}>
              Captura monto, tasa y plazo para ver la tabla de amortización.
            </p>
          ) : (
            <>
              <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 14 }}>
                {preview.length} cupones · pago {preview[0].pago_total === preview[1]?.pago_total ? "fijo" : "variable"} de{" "}
                <span className="mono" style={{ color: "var(--amber)" }}>{mxn(preview[0].pago_total)}</span>
              </p>
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: "right" }}>Capital</th>
                    <th style={{ textAlign: "right" }}>Interés</th>
                    <th style={{ textAlign: "right" }}>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c) => (
                    <tr key={c.numero_cupon}>
                      <td className="mono">{c.numero_cupon}</td>
                      <td style={{ fontSize: 11.5 }}>{fecha(c.fecha_pago)}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{mxn(c.capital)}</td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(c.interes)}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{mxn(c.pago_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// =====================================================================
// MODAL: Detalle de crédito (amortización + cambio de estatus + bitácora)
// =====================================================================
function ModalDetalle({
  credito,
  rol,
  isMobile,
  onClose,
  onChanged,
  onDeleted,
}: {
  credito: Credito;
  rol: Rol | null;
  isMobile?: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (folio: string) => void;
}) {
  const readOnly = rol ? esSoloLectura(rol) : false;
  const canDelete = rol ? puedeEliminar(rol) : false;
  const [amort, setAmort] = useState<any[]>([]);
  const [bitacora, setBitacora] = useState<any[]>([]);
  const [estatus, setEstatus] = useState(credito.estatus);
  const [guardando, setGuardando] = useState(false);
  const [mostrarConfirmElim, setMostrarConfirmElim] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [a, b] = await Promise.all([
      supabase.from("amortizacion").select("*").eq("credito_id", credito.id).order("numero_cupon"),
      supabase.from("bitacora").select("*").eq("entidad", "credito").eq("entidad_id", credito.id).order("created_at", { ascending: false }),
    ]);
    setAmort(a.data ?? []);
    setBitacora(b.data ?? []);
  }, [credito.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarEstatus() {
    if (estatus === credito.estatus) return;
    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    await supabase.from("creditos").update({ estatus }).eq("id", credito.id);
    await supabase.from("bitacora").insert({
      entidad: "credito",
      entidad_id: credito.id,
      accion: "cambio_estatus",
      detalle: { de: credito.estatus, a: estatus },
      usuario: operador,
    });
    setGuardando(false);
    onChanged();
    cargar();
  }

  async function marcarPagado(cuponId: string, pagado: boolean) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";
    await supabase
      .from("amortizacion")
      .update({ pagado, fecha_pago_real: pagado ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", cuponId);
    await supabase.from("bitacora").insert({
      entidad: "credito",
      entidad_id: credito.id,
      accion: pagado ? "pago_registrado" : "pago_revertido",
      detalle: { cupon: cuponId },
      usuario: operador,
    });
    cargar();
    onChanged();
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
    <Overlay onClose={onClose} wide>
      <div style={{ padding: "28px 32px", maxHeight: "86vh", overflowY: "auto" }}>
        {/* Encabezado */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <span className="mono" style={{ color: "var(--amber)", fontSize: 13 }}>{credito.folio}</span>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: "#0a1628", marginTop: 4 }}>{credito.acreditado}</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {canDelete && (
              <button
                className="btn btn-danger"
                onClick={() => setMostrarConfirmElim(true)}
                style={{ padding: "8px 14px", fontSize: 12.5 }}
              >
                <Trash2 size={14} strokeWidth={1.75} /> Eliminar
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: "8px 14px" }}>✕</button>
          </div>
        </div>

        {/* Datos clave */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginBottom: 24 }}>
          <Dato label="Monto" valor={mxn(Number(credito.monto))} />
          <Dato label="Tasa anual" valor={pct(Number(credito.tasa_anual))} />
          <Dato label="Plazo" valor={`${credito.plazo_meses} meses`} />
          <Dato label="Frecuencia" valor={labelEstatus[credito.frecuencia] ?? credito.frecuencia} />
          <Dato label="Origen" valor={fecha(credito.fecha_origen)} />
        </div>

        {/* Cambio de estatus */}
        {!readOnly && <div className="panel" style={{ padding: "16px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>Estatus:</span>
          <select className="select" value={estatus} onChange={(e) => setEstatus(e.target.value)} style={{ width: "auto", minWidth: 160 }}>
            {ESTATUS_CREDITO.map((s) => (
              <option key={s} value={s}>{labelEstatus[s]}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={cambiarEstatus}
            disabled={estatus === credito.estatus || guardando}
            style={{ padding: "9px 16px", fontSize: 13, opacity: estatus === credito.estatus ? 0.5 : 1 }}
          >
            {guardando ? "Guardando…" : "Actualizar estatus"}
          </button>
        </div>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 16 : 24 }}>
          {/* Amortización */}
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Tabla de amortización</h3>
            <div className="panel" style={{ overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: "right" }}>Pago</th>
                    <th style={{ textAlign: "right" }}>Saldo</th>
                    {!readOnly && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {amort.map((c) => {
                    const vencido = !c.pagado && c.fecha_pago < hoy;
                    return (
                      <tr key={c.id} style={{ opacity: c.pagado ? 0.55 : 1 }}>
                        <td className="mono">{c.numero_cupon}</td>
                        <td style={{ color: vencido ? "var(--red)" : "inherit" }}>{fecha(c.fecha_pago)}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.pago_total))}</td>
                        <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(Number(c.saldo_final))}</td>
                        {!readOnly && <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => marcarPagado(c.id, !c.pagado)}
                            className="btn btn-ghost"
                            style={{ padding: "4px 9px", fontSize: 11 }}
                          >
                            {c.pagado ? "✓ Pagado" : "Marcar"}
                          </button>
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bitácora / trazabilidad */}
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Trazabilidad</h3>
            <div className="panel" style={{ padding: "8px 0", maxHeight: 420, overflowY: "auto" }}>
              {bitacora.length === 0 ? (
                <p style={{ padding: 20, color: "var(--text-faint)", fontSize: 13 }}>Sin movimientos.</p>
              ) : (
                bitacora.map((b) => (
                  <div key={b.id} style={{ padding: "11px 18px", borderBottom: "1px solid var(--line-soft)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{accionLabel(b.accion)}</div>
                    {b.detalle?.de && (
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        {labelEstatus[b.detalle.de]} → {labelEstatus[b.detalle.a]}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                      {new Date(b.created_at).toLocaleString("es-MX")} · {b.usuario}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Overlay>

    {mostrarConfirmElim && (
      <ModalConfirmarEliminacion
        credito={credito}
        onClose={() => setMostrarConfirmElim(false)}
        onDeleted={onDeleted}
      />
    )}
    </>
  );
}

function accionLabel(a: string) {
  const m: Record<string, string> = {
    creado: "Crédito originado",
    cambio_estatus: "Cambio de estatus",
    pago_registrado: "Pago registrado",
    pago_revertido: "Pago revertido",
    credito_eliminado: "Crédito eliminado",
  };
  return m[a] ?? a;
}

// =====================================================================
// MODAL: Confirmar eliminación de crédito
// =====================================================================
function ModalConfirmarEliminacion({
  credito,
  onClose,
  onDeleted,
}: {
  credito: Credito;
  onClose: () => void;
  onDeleted: (folio: string) => void;
}) {
  const [folioInput, setFolioInput] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const folioMatch = folioInput.trim() === credito.folio;
  const motivoOk = motivo.trim().length >= 10;
  const puedeConfirmar = folioMatch && motivoOk && !eliminando;

  async function confirmar() {
    setError(null);
    setEliminando(true);
    try {
      const res = await fetch("/api/creditos/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credito_id: credito.id, motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al eliminar");
        setEliminando(false);
        return;
      }
      onDeleted(credito.folio);
    } catch {
      setError("Error de conexión");
      setEliminando(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,22,40,0.55)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        zIndex: 200,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{ width: "100%", maxWidth: 500, padding: "32px 28px" }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0a1628", marginBottom: 16 }}>
          Eliminar crédito {credito.folio}
        </h3>

        {/* Warning */}
        <div
          style={{
            background: "var(--red-soft)",
            border: "1px solid rgba(181,72,72,0.2)",
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--red)",
          }}
        >
          Esta acción es irreversible. Se eliminarán: el crédito, su tabla de
          amortización completa, y la información del acreditado asociada.
          Los datos en bitácora se conservan como histórico de auditoría.
        </div>

        {/* Credit summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 20,
            padding: "12px 14px",
            background: "#f9fafc",
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          <div>
            <span style={{ color: "var(--text-faint)" }}>Folio: </span>
            <span className="mono" style={{ fontWeight: 600 }}>{credito.folio}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-faint)" }}>Estatus: </span>
            <span style={{ fontWeight: 600 }}>{labelEstatus[credito.estatus]}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-faint)" }}>Acreditado: </span>
            <span style={{ fontWeight: 600 }}>{credito.acreditado}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-faint)" }}>Monto: </span>
            <span className="mono" style={{ fontWeight: 600 }}>{mxn(Number(credito.monto))}</span>
          </div>
        </div>

        {/* Folio confirmation */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Para confirmar, escribe el folio del crédito:{" "}
            <strong className="mono" style={{ color: "var(--text)" }}>{credito.folio}</strong>
          </label>
          <input
            className="input mono"
            value={folioInput}
            onChange={(e) => setFolioInput(e.target.value)}
            placeholder={credito.folio}
            style={{
              borderColor: folioInput && !folioMatch ? "var(--red)" : undefined,
            }}
          />
        </div>

        {/* Motivo */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Motivo de la eliminación (mínimo 10 caracteres)
          </label>
          <textarea
            className="textarea"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Describe por qué se elimina este crédito..."
          />
          {motivo.length > 0 && motivo.trim().length < 10 && (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {10 - motivo.trim().length} caracteres más
            </span>
          )}
        </div>

        {error && (
          <div
            style={{
              background: "var(--red-soft)",
              color: "var(--red)",
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            onClick={confirmar}
            disabled={!puedeConfirmar}
            style={{ opacity: puedeConfirmar ? 1 : 0.45 }}
          >
            {eliminando ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

// =====================================================================
// Overlay reutilizable
// =====================================================================
function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,22,40,0.4)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: "24px max(8px, env(safe-area-inset-left))",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{
          width: "100%",
          maxWidth: wide ? 940 : 760,
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
          maxHeight: "95vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
