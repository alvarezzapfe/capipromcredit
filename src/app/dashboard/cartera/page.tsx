"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn, pct, fecha, labelEstatus, ESTATUS_CREDITO, TIPO_PRODUCTO_LABEL, TIPO_PRODUCTO_FULL, GARANTIA_LABEL } from "@/lib/format";
import { Briefcase, Plus, Trash2, Upload, Download } from "lucide-react";
import {
  generarTablaAmortizacion, calcularGraciaPeridos,
  type Frecuencia, type MetodoAmort, type TipoGracia,
} from "@/lib/amortizacion";
import { calcularFactoraje, type DesgloseFactoraje } from "@/lib/factoraje";
import { construirOperacion, type InputOperacion, type TipoProducto, type ResultadoOperacion } from "@/lib/operaciones";
import { calcularEstadoLinea, type Movimiento } from "@/lib/revolvente";
import { useRol } from "@/lib/useRol";
import { esSoloLectura, puedeEliminar, puedeEliminarDesdeTabla, type Rol } from "@/lib/rbac";
import { useIsMobile } from "@/lib/useIsMobile";
import { ModalAltaCliente } from "@/components/ModalAltaCliente";
import { WizardActivar } from "@/components/WizardActivar";
import { rateLabel } from "@/lib/credit-engine/rate-label";
import {
  calcularNPV, generarSchedule, saldoInsolutoCupones,
  type CuponSchedule, type ParamsSchedule, type FrecuenciaWizard,
  type EsquemaPreset, type ConvencionDias, type RateCatalogRow,
  type BaseCalendario, type InteresBase, type SupuestoForward,
  MESES_POR_PERIODO,
} from "@/lib/credit-engine";

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
  tipo_tasa: string;
  tasa_referencia: string | null;
  valor_referencia: number | null;
  spread_pp: number | null;
  tipo_garantia: string;
  periodo_gracia_meses: number;
  tipo_gracia: string;
  tipo_disposicion: string;
  tipo_producto: TipoProducto;
  credito_origen_id: string | null;
  limite_linea: number | null;
  valor_bien: number | null;
  enganche: number | null;
  valor_residual: number | null;
  deudor: string | null;
  monto_factura: number | null;
  aforo: number | null;
  tasa_descuento: number | null;
  comision_pct: number | null;
  fecha_vencimiento: string | null;
  rate_type: string | null;
  spread: number | null;
  fixed_rate: number | null;
  day_count_base: number;
  esquema: string;
  convencion_dias: string;
  frecuencia_revision: number | null;
  fecha_primer_pago: string | null;
  comision_apertura: number;
  comision_apertura_pct: number | null;
  comision_iva: boolean;
  iva_intereses: boolean;
  cat: number | null;
  tir: number | null;
  modalidad_interes: string;
  saldo_override: number | null;
  base_calendario: string;
  num_pagos_capital: number | null;
  supuesto_forward: string;
  interes_base: string;
}

interface Disposicion {
  id: string;
  credito_id: string;
  numero: number;
  monto: number;
  fecha: string;
}


function tasaLabel(c: Credito): string {
  return rateLabel({
    rate_type: c.rate_type,
    spread: c.spread != null ? Number(c.spread) : null,
    fixed_rate: c.fixed_rate != null ? Number(c.fixed_rate) : null,
  });
}

/** Saldo insoluto de una línea multi-disposición: schedule por disposición + suma. */
function calcularSaldoLineaMultiple(
  c: Credito, disps: Disposicion[], catalog: RateCatalogRow[], fechaCorte: string,
): number {
  if (disps.length === 0) return 0;
  const freq = (Object.keys(MESES_POR_PERIODO) as FrecuenciaWizard[]).includes(c.frecuencia as FrecuenciaWizard)
    ? (c.frecuencia as FrecuenciaWizard) : "mensual" as FrecuenciaWizard;
  const mpp = MESES_POR_PERIODO[freq];
  let tipoGracia: "sin_pago" | "solo_interes" | "capitaliza_interes" = "solo_interes";
  if (c.tipo_gracia === "total") tipoGracia = "capitaliza_interes";
  const baseCalendario = (c.base_calendario as BaseCalendario) ?? "aniversario";
  const interesBase = (c.interes_base as InteresBase) ?? "apertura";
  const supuesto: SupuestoForward = c.supuesto_forward === "cero" ? "cero" : "ultima_conocida";

  let total = 0;
  for (const d of disps) {
    const montoDisp = Number(d.monto);
    if (montoDisp <= 0) continue;
    try {
      const params: ParamsSchedule = {
        monto: montoDisp,
        fechaDisposicion: d.fecha,
        fechaPrimerPago: addMesesHelper(d.fecha, mpp),
        plazoMeses: Number(c.plazo_meses) || 60,
        frecuencia: freq,
        esquema: (c.esquema as EsquemaPreset) || "frances",
        rateType: c.rate_type ?? null,
        spread: c.spread != null ? Number(c.spread) : null,
        fixedRate: c.fixed_rate != null ? Number(c.fixed_rate) : null,
        convencionDias: (c.convencion_dias as ConvencionDias) || "ACT/360",
        frecuenciaRevision: c.frecuencia_revision ?? null,
        graciaMeses: Number(c.periodo_gracia_meses) || 0,
        tipoGracia,
        comisionApertura: 0, comisionIva: false, ivaIntereses: false,
        baseCalendario, interesBase, supuestoForward: supuesto,
        numPagosCapital: c.num_pagos_capital ?? null,
      };
      const schedule = generarSchedule(params, catalog);
      total += saldoInsolutoCupones(schedule.cupones, fechaCorte, montoDisp);
    } catch {
      total += montoDisp; // conservative fallback
    }
  }
  return Math.round(total * 100) / 100;
}

function addMesesHelper(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, maxDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

function graciaLabel(c: Credito): string {
  if (!c.periodo_gracia_meses || c.tipo_gracia === "ninguna") return "—";
  return `${c.periodo_gracia_meses}m ${c.tipo_gracia}`;
}

// =====================================================================
// MAIN
// =====================================================================
export default function Cartera() {
  const isMobile = useIsMobile();
  const rol = useRol();
  const readOnly = rol ? esSoloLectura(rol) : false;
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [mostrarImport, setMostrarImport] = useState(false);
  const [avisoImport, setAvisoImport] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Credito | null>(null);
  const [avisoElim, setAvisoElim] = useState<string | null>(null);
  const [elimDesdeTabla, setElimDesdeTabla] = useState<Credito | null>(null);
  const [reparando, setReparando] = useState(false);
  const [avisoRepair, setAvisoRepair] = useState<string | null>(null);
  const showTableDelete = puedeEliminarDesdeTabla(rol);

  const [saldosRev, setSaldosRev] = useState<Record<string, number>>({});
  const [saldosInsolutos, setSaldosInsolutos] = useState<Record<string, number>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data } = await supabase.from("creditos").select("*").order("created_at", { ascending: false });
    const creds = (data ?? []) as Credito[];
    setCreditos(creds);

    // Fetch saldos for revolvente lines
    const revIds = creds.filter(c => c.tipo_producto === "linea_revolvente").map(c => c.id);
    if (revIds.length > 0) {
      const { data: movs } = await supabase.from("movimientos_linea").select("credito_id,tipo,monto").in("credito_id", revIds);
      const saldos: Record<string, number> = {};
      for (const id of revIds) {
        const ms = (movs ?? []).filter((m: any) => m.credito_id === id);
        let s = 0;
        for (const m of ms) s += m.tipo === "disposicion" ? Number(m.monto) : -Number(m.monto);
        saldos[id] = Math.max(0, Math.round(s * 100) / 100);
      }
      setSaldosRev(saldos);
    }

    // Fetch saldo insoluto for non-revolvente active credits
    const activeIds = creds.filter(c => c.tipo_producto !== "linea_revolvente" && ["vigente", "en_mora"].includes(c.estatus)).map(c => c.id);
    if (activeIds.length > 0) {
      const { data: amortData } = await supabase
        .from("amortizacion")
        .select("credito_id, saldo_inicial, pagado, numero_cupon")
        .in("credito_id", activeIds)
        .eq("pagado", false)
        .order("numero_cupon", { ascending: true });
      const si: Record<string, number> = {};
      for (const a of amortData ?? []) {
        if (!si.hasOwnProperty(a.credito_id)) {
          si[a.credito_id] = Number(a.saldo_inicial);
        }
      }
      // Use saldo_override if present
      for (const c of creds) {
        if (c.saldo_override != null && c.saldo_override > 0) {
          si[c.id] = Number(c.saldo_override);
        }
      }

      // Multi-disposition credits WITHOUT amortization: schedule por disposición
      const multiNoAmort = creds.filter(
        (c) => c.tipo_disposicion === "multiple"
          && ["vigente", "en_mora"].includes(c.estatus)
          && !si.hasOwnProperty(c.id)
          && !(c.saldo_override != null && c.saldo_override > 0),
      );
      if (multiNoAmort.length > 0) {
        const multiIds = multiNoAmort.map((c) => c.id);
        const [{ data: dispData }, { data: catData }] = await Promise.all([
          supabase.from("disposiciones").select("*").in("credito_id", multiIds),
          supabase.from("rate_catalog").select("rate_type, rate_date, rate_value").order("rate_date", { ascending: false }),
        ]);
        const hoy = new Date().toISOString().slice(0, 10);
        for (const c of multiNoAmort) {
          const disps = ((dispData ?? []) as Disposicion[]).filter((d) => d.credito_id === c.id);
          if (disps.length > 0) {
            si[c.id] = calcularSaldoLineaMultiple(c, disps, (catData ?? []) as RateCatalogRow[], hoy);
          }
        }
      }

      setSaldosInsolutos(si);
    }

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function repararAmortizacion() {
    setReparando(true);
    setAvisoRepair(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    const { data: todos } = await supabase.from("creditos").select("*").neq("tipo_producto", "linea_revolvente").neq("estatus", "borrador");
    if (!todos || todos.length === 0) { setReparando(false); setAvisoRepair("No hay créditos para revisar."); return; }

    let reparados = 0;
    let errores = 0;

    for (const c of todos) {
      const { count } = await supabase.from("amortizacion").select("id", { count: "exact", head: true }).eq("credito_id", c.id);
      if ((count ?? 0) > 0) continue;

      const tp = c.tipo_producto as TipoProducto;
      const esArr = tp === "arrendamiento_financiero" || tp === "arrendamiento_puro";
      const esFact = tp === "factoraje";

      const input: InputOperacion = {
        tipo_producto: tp,
        folio: c.folio,
        acreditado: c.acreditado,
        rfc: c.rfc ?? undefined,
        fecha_origen: c.fecha_origen,
        monto: Number(c.monto) || 0,
        tipo_tasa: c.tipo_tasa === "variable" ? "variable" : "fija",
        tasa_anual_pct: Number(c.tasa_anual) * 100,
        tasa_referencia: c.tasa_referencia ?? undefined,
        valor_referencia_pct: c.valor_referencia != null ? Number(c.valor_referencia) * 100 : 0,
        spread_pp: c.spread_pp != null ? Number(c.spread_pp) * 100 : 0,
        plazo_meses: Number(c.plazo_meses) || 0,
        frecuencia: (c.frecuencia || "mensual") as Frecuencia,
        metodo_amort: (c.metodo_amort || "frances") as MetodoAmort,
        tipo_garantia: c.tipo_garantia ?? undefined,
        periodo_gracia_meses: Number(c.periodo_gracia_meses) || 0,
        tipo_gracia: (c.tipo_gracia || "ninguna") as TipoGracia,
        tipo_disposicion: "unica",
        valor_bien: esArr ? Number(c.valor_bien ?? 0) : 0,
        enganche: esArr ? Number(c.enganche ?? 0) : 0,
        valor_residual: esArr ? Number(c.valor_residual ?? 0) : 0,
        deudor: esFact ? (c.deudor ?? undefined) : undefined,
        monto_factura: esFact ? Number(c.monto_factura ?? 0) : 0,
        aforo_pct: esFact ? Number(c.aforo ?? 80) : 80,
        tasa_descuento_pct: esFact ? Number(c.tasa_descuento ?? 0) : 0,
        comision_pct: esFact ? Number(c.comision_pct ?? 0) : 0,
        fecha_vencimiento: esFact ? (c.fecha_vencimiento ?? undefined) : undefined,
      };

      try {
        const resultado = construirOperacion(input);
        if (resultado.cupones.length === 0) continue;

        const { error: errAmort } = await supabase.from("amortizacion").insert(resultado.cupones.map((cup) => ({
          credito_id: c.id, numero_cupon: cup.numero_cupon, fecha_pago: cup.fecha_pago,
          saldo_inicial: cup.saldo_inicial, capital: cup.capital, interes: cup.interes,
          pago_total: cup.pago_total, saldo_final: cup.saldo_final,
          ...(cup.valor_referencia != null ? { valor_referencia: cup.valor_referencia } : {}),
          ...(cup.tasa_aplicada != null ? { tasa_aplicada: cup.tasa_aplicada } : {}),
        })));
        if (errAmort) { errores++; continue; }

        await supabase.from("creditos").update({ tipo_disposicion: "unica" }).eq("id", c.id);
        await supabase.from("bitacora").insert({ entidad: "credito", entidad_id: c.id, accion: "reparado", detalle: { cupones: resultado.cupones.length }, usuario: operador });
        reparados++;
      } catch {
        errores++;
      }
    }

    setReparando(false);
    cargar();
    if (reparados === 0 && errores === 0) {
      setAvisoRepair("Todos los créditos ya tienen amortización. Nada que reparar.");
    } else {
      setAvisoRepair(`${reparados} crédito${reparados === 1 ? "" : "s"} reparado${reparados === 1 ? "" : "s"}${errores > 0 ? `, ${errores} con error` : ""}.`);
    }
    setTimeout(() => setAvisoRepair(null), 8000);
  }

  return (
    <div style={{ padding: isMobile ? "20px 16px 40px" : "32px 48px 60px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", marginBottom: isMobile ? 20 : 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>Cartera de crédito</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
            {creditos.filter(c => c.estatus !== "borrador").length} crédito{creditos.filter(c => c.estatus !== "borrador").length === 1 ? "" : "s"} en cartera
            {creditos.filter(c => c.estatus === "borrador").length > 0 && (
              <span style={{ color: "var(--amber)" }}> · {creditos.filter(c => c.estatus === "borrador").length} por revisar</span>
            )}
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rol === "super_admin" && (
              <button className="btn btn-ghost" onClick={repararAmortizacion} disabled={reparando} style={{ fontSize: 12.5, padding: "8px 14px", color: "var(--amber)" }}>{reparando ? "Reparando…" : "Reparar amortización"}</button>
            )}
            <button className="btn btn-ghost" onClick={descargarPlantilla} style={{ fontSize: 12.5, padding: "8px 14px" }}><Download size={14} strokeWidth={1.75} /> Plantilla</button>
            <button className="btn btn-ghost" onClick={() => setMostrarImport(true)} style={{ fontSize: 12.5, padding: "8px 14px" }}><Upload size={14} strokeWidth={1.75} /> Importar</button>
            <button className="btn btn-primary" onClick={() => setMostrarAlta(true)}>+ Originar crédito</button>
          </div>
        )}
      </header>

      {avisoRepair && (
        <div style={{ background: "var(--amber-soft)", color: "var(--amber)", padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18 }}>{avisoRepair}</div>
      )}
      {avisoImport && (
        <div style={{ background: "var(--green-soft)", color: "var(--green)", padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18 }}>{avisoImport}</div>
      )}
      {avisoElim && (
        <div style={{ background: "var(--green-soft)", color: "var(--green)", padding: "11px 16px", borderRadius: 6, fontSize: 13.5, marginBottom: 18 }}>{avisoElim}</div>
      )}

      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>Cargando…</div>
        ) : creditos.length === 0 ? (
          <div style={{ padding: "80px 40px", textAlign: "center" }}>
            <Briefcase size={36} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginTop: 14 }}>Cartera vacía</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, maxWidth: 320, margin: "4px auto 0" }}>Origina tu primer crédito.</p>
            {!readOnly && (
              <button className="btn btn-primary" onClick={() => setMostrarAlta(true)} style={{ marginTop: 20, fontSize: 13, padding: "9px 18px" }}>
                <Plus size={14} strokeWidth={1.75} /> Originar crédito
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Producto</th>
                <th>Acreditado</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th>Tasa</th>
                <th>Garantía</th>
                <th>Gracia</th>
                <th>Disp.</th>
                <th>Estatus</th>
                {showTableDelete && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {creditos.map((c) => (
                <tr key={c.id} onClick={() => setDetalle(c)} style={{ cursor: "pointer" }}>
                  <td className="mono" style={{ color: "var(--amber)" }}>{c.folio}</td>
                  <td><span className="badge" style={{ background: c.tipo_producto === "factoraje" ? "#ede9fe" : c.tipo_producto === "linea_revolvente" ? "#ecfdf5" : c.tipo_producto?.startsWith("arrendamiento") ? "#e0f2fe" : "#f0f2f5", color: c.tipo_producto === "factoraje" ? "#7c3aed" : c.tipo_producto === "linea_revolvente" ? "#059669" : c.tipo_producto?.startsWith("arrendamiento") ? "#0284c7" : "#64748b", fontSize: 11 }}>{TIPO_PRODUCTO_LABEL[c.tipo_producto] ?? "Crédito"}</span></td>
                  <td>{c.acreditado}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{c.tipo_producto === "linea_revolvente" ? `${mxn(saldosRev[c.id] ?? 0)} / ${mxn(Number(c.limite_linea ?? 0))}` : mxn(Number(c.monto))}</td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)", fontSize: 12.5 }}>{c.tipo_producto === "linea_revolvente" ? "—" : c.estatus === "borrador" ? "—" : saldosInsolutos[c.id] != null ? mxn(saldosInsolutos[c.id]) : mxn(Number(c.monto))}</td>
                  <td style={{ fontSize: 12.5 }}>{tasaLabel(c)}</td>
                  <td><span className="badge" style={{ background: "#f0f2f5", color: "#64748b" }}>{GARANTIA_LABEL[c.tipo_garantia] ?? c.tipo_garantia}</span></td>
                  <td style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{graciaLabel(c)}</td>
                  <td style={{ fontSize: 12.5 }}>{c.tipo_disposicion === "multiple" ? "Múltiple" : "Única"}</td>
                  <td><span className={`badge badge-${c.estatus}`}>{labelEstatus[c.estatus]}</span></td>
                  {showTableDelete && (
                    <td style={{ textAlign: "right" }}>
                      <button title="Eliminar crédito" aria-label={`Eliminar crédito ${c.folio}`}
                        onClick={(e) => { e.stopPropagation(); setElimDesdeTabla(c); }}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 5, background: "transparent", border: "none", borderRadius: 4, color: "var(--red)", cursor: "pointer", transition: "background 0.12s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(181,72,72,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      ><Trash2 size={14} strokeWidth={1.75} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {mostrarAlta && <ModalAlta isMobile={isMobile} onClose={() => setMostrarAlta(false)} onSaved={() => { setMostrarAlta(false); cargar(); }} />}
      {mostrarImport && <ModalImportar isMobile={isMobile} onClose={() => setMostrarImport(false)} onDone={(msg) => { setMostrarImport(false); cargar(); setAvisoImport(msg); setTimeout(() => setAvisoImport(null), 8000); }} />}
      {detalle && <ModalDetalle credito={detalle} rol={rol} isMobile={isMobile} onClose={() => setDetalle(null)} onChanged={cargar} onDeleted={(f) => { setDetalle(null); cargar(); setAvisoElim(`Crédito ${f} eliminado.`); setTimeout(() => setAvisoElim(null), 6000); }} />}
      {elimDesdeTabla && <ModalConfirmarEliminacion credito={elimDesdeTabla} onClose={() => setElimDesdeTabla(null)} onDeleted={(f) => { setElimDesdeTabla(null); cargar(); setAvisoElim(`Crédito ${f} eliminado.`); setTimeout(() => setAvisoElim(null), 6000); }} />}
    </div>
  );
}

// =====================================================================
// Descargar plantilla Excel
// =====================================================================
function descargarPlantilla() {
  import("xlsx").then((XLSX) => {
    const headers = [
      "folio","tipo_producto","acreditado","rfc","fecha_origen","monto","tipo_tasa",
      "tasa_anual_pct","tasa_referencia","valor_referencia_pct","spread_pp","plazo_meses",
      "frecuencia","metodo_amort","tipo_garantia","periodo_gracia_meses","tipo_gracia",
      "valor_bien","enganche","valor_residual","deudor","monto_factura","aforo_pct",
      "tasa_descuento_pct","comision_pct","fecha_vencimiento",
    ];
    const ejemplos = [
      {
        folio: "EJEMPLO-CS", tipo_producto: "credito_simple", acreditado: "Empresa Demo SA", rfc: "EDE010101AAA",
        fecha_origen: "2026-01-15", monto: 500000, tipo_tasa: "fija", tasa_anual_pct: 24, tasa_referencia: "",
        valor_referencia_pct: "", spread_pp: "", plazo_meses: 12, frecuencia: "mensual", metodo_amort: "frances",
        tipo_garantia: "quirografaria", periodo_gracia_meses: 0, tipo_gracia: "ninguna",
        valor_bien: "", enganche: "", valor_residual: "", deudor: "", monto_factura: "", aforo_pct: "",
        tasa_descuento_pct: "", comision_pct: "", fecha_vencimiento: "",
      },
      {
        folio: "EJEMPLO-AF", tipo_producto: "arrendamiento_financiero", acreditado: "Arrendadora MX",
        rfc: "AMX020202BBB", fecha_origen: "2026-02-01", monto: "", tipo_tasa: "fija", tasa_anual_pct: 18,
        tasa_referencia: "", valor_referencia_pct: "", spread_pp: "", plazo_meses: 36, frecuencia: "mensual",
        metodo_amort: "frances", tipo_garantia: "bien_arrendado", periodo_gracia_meses: 0, tipo_gracia: "ninguna",
        valor_bien: 800000, enganche: 80000, valor_residual: 8000, deudor: "", monto_factura: "",
        aforo_pct: "", tasa_descuento_pct: "", comision_pct: "", fecha_vencimiento: "",
      },
      {
        folio: "EJEMPLO-FA", tipo_producto: "factoraje", acreditado: "Cedente SA de CV", rfc: "CSA030303CCC",
        fecha_origen: "2026-03-01", monto: "", tipo_tasa: "", tasa_anual_pct: "", tasa_referencia: "",
        valor_referencia_pct: "", spread_pp: "", plazo_meses: "", frecuencia: "", metodo_amort: "",
        tipo_garantia: "", periodo_gracia_meses: "", tipo_gracia: "", valor_bien: "", enganche: "",
        valor_residual: "", deudor: "Pagador Industries", monto_factura: 1000000, aforo_pct: 80,
        tasa_descuento_pct: 24, comision_pct: 2, fecha_vencimiento: "2026-06-01",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(ejemplos, { header: headers });
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cartera");
    XLSX.writeFile(wb, "CapiProm_Machote_Cartera.xlsx");
  });
}

// =====================================================================
// MODAL: Importar cartera desde Excel
// =====================================================================
interface FilaImport {
  idx: number;
  input: InputOperacion;
  valida: boolean;
  error?: string;
}

function ModalImportar({ isMobile, onClose, onDone }: { isMobile?: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [resultado, setResultado] = useState<{ ok: number; fail: number; errores: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validas = filas.filter((f) => f.valida);
  const invalidas = filas.filter((f) => !f.valida);

  function parseDateValue(v: any): string {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return s;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setParseError(null);
    setFilas([]);
    setResultado(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const sheetName = wb.SheetNames.includes("Cartera") ? "Cartera" : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) { setParseError("El archivo no contiene filas de datos."); return; }

      // Normalize headers
      const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");

      const parsed: FilaImport[] = [];
      let idx = 0;

      for (const raw of rows) {
        const row: Record<string, any> = {};
        for (const [k, v] of Object.entries(raw)) {
          row[normalize(k)] = v;
        }

        // Skip example rows and empty rows
        const folioVal = String(row.folio ?? "").trim().toUpperCase();
        if (folioVal.includes("EJEMPLO")) continue;
        const acreditado = String(row.acreditado ?? "").trim();
        if (!acreditado && !row.monto && !row.monto_factura) continue;

        idx++;
        const tp = String(row.tipo_producto ?? "credito_simple").trim() as TipoProducto;

        const input: InputOperacion = {
          tipo_producto: tp,
          folio: row.folio ? String(row.folio).trim() : undefined,
          acreditado,
          rfc: row.rfc ? String(row.rfc).trim() : undefined,
          fecha_origen: parseDateValue(row.fecha_origen) || new Date().toISOString().slice(0, 10),
          monto: Number(row.monto) || 0,
          tipo_tasa: String(row.tipo_tasa || "fija").trim() as "fija" | "variable",
          tasa_anual_pct: Number(row.tasa_anual_pct) || 0,
          tasa_referencia: row.tasa_referencia ? String(row.tasa_referencia).trim() : undefined,
          valor_referencia_pct: Number(row.valor_referencia_pct) || 0,
          spread_pp: Number(row.spread_pp) || 0,
          plazo_meses: Number(row.plazo_meses) || 0,
          frecuencia: (String(row.frecuencia || "mensual").trim() as Frecuencia),
          metodo_amort: (String(row.metodo_amort || "frances").trim() as MetodoAmort),
          tipo_garantia: row.tipo_garantia ? String(row.tipo_garantia).trim() : undefined,
          periodo_gracia_meses: Number(row.periodo_gracia_meses) || 0,
          tipo_gracia: (String(row.tipo_gracia || "ninguna").trim() as TipoGracia),
          tipo_disposicion: "unica",
          valor_bien: Number(row.valor_bien) || 0,
          enganche: Number(row.enganche) || 0,
          valor_residual: Number(row.valor_residual) || 0,
          deudor: row.deudor ? String(row.deudor).trim() : undefined,
          monto_factura: Number(row.monto_factura) || 0,
          aforo_pct: Number(row.aforo_pct) || 80,
          tasa_descuento_pct: Number(row.tasa_descuento_pct) || 0,
          comision_pct: Number(row.comision_pct) || 0,
          fecha_vencimiento: parseDateValue(row.fecha_vencimiento) || undefined,
        };

        // Validate
        const validTipos: TipoProducto[] = ["credito_simple", "arrendamiento_financiero", "arrendamiento_puro", "factoraje"];
        if (!validTipos.includes(tp)) {
          parsed.push({ idx, input, valida: false, error: `tipo_producto inválido: "${tp}"` });
          continue;
        }
        if (!acreditado) {
          parsed.push({ idx, input, valida: false, error: "acreditado vacío" });
          continue;
        }
        if (!input.fecha_origen || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_origen)) {
          parsed.push({ idx, input, valida: false, error: "fecha_origen inválida" });
          continue;
        }

        try {
          construirOperacion(input);
          parsed.push({ idx, input, valida: true });
        } catch (err: any) {
          parsed.push({ idx, input, valida: false, error: err.message });
        }
      }

      if (parsed.length === 0) { setParseError("No se encontraron filas válidas (se omitieron filas de ejemplo y vacías)."); return; }
      setFilas(parsed);
    } catch (err: any) {
      setParseError("Error al leer el archivo: " + err.message);
    }

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  }

  async function importar() {
    setImportando(true);
    setResultado(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    let ok = 0;
    let fail = 0;
    const errores: string[] = [];

    for (let i = 0; i < validas.length; i++) {
      setProgreso({ actual: i + 1, total: validas.length });
      const fila = validas[i];
      try {
        // Match or create client
        const nombreCli = fila.input.acreditado.trim();
        const rfcCli = fila.input.rfc?.trim() || null;
        let clienteId: string | undefined;
        const { data: existentes } = await supabase.from("clientes").select("id, nombre").ilike("nombre", nombreCli).limit(1);
        if (existentes && existentes.length > 0) {
          clienteId = existentes[0].id;
        } else {
          const { data: nuevo } = await supabase.from("clientes").insert({ tipo_persona: "moral", nombre: nombreCli, rfc: rfcCli }).select("id").single();
          if (nuevo) clienteId = nuevo.id;
        }
        fila.input.cliente_id = clienteId;

        const { creditoRow, cupones, disposicionMonto } = construirOperacion(fila.input);

        // Force unica for imports
        creditoRow.tipo_disposicion = "unica";

        const { data: credito, error: errCred } = await supabase.from("creditos").insert(creditoRow).select().single();
        if (errCred || !credito) throw new Error("creditos: " + (errCred?.message ?? "Error"));

        const { error: errDisp } = await supabase.from("disposiciones").insert({ credito_id: credito.id, numero: 1, monto: disposicionMonto, fecha: creditoRow.fecha_origen });
        if (errDisp) throw new Error("disposiciones: " + errDisp.message);

        if (cupones.length > 0) {
          const { error: errAmort } = await supabase.from("amortizacion").insert(cupones.map((c) => ({
            credito_id: credito.id, numero_cupon: c.numero_cupon, fecha_pago: c.fecha_pago,
            saldo_inicial: c.saldo_inicial, capital: c.capital, interes: c.interes,
            pago_total: c.pago_total, saldo_final: c.saldo_final,
            ...(c.valor_referencia != null ? { valor_referencia: c.valor_referencia } : {}),
            ...(c.tasa_aplicada != null ? { tasa_aplicada: c.tasa_aplicada } : {}),
          })));
          if (errAmort) throw new Error("amortizacion: " + errAmort.message);
        }

        const { error: errBit } = await supabase.from("bitacora").insert({
          entidad: "credito", entidad_id: credito.id, accion: "creado",
          detalle: { origen: "import", folio: creditoRow.folio, tipo: creditoRow.tipo_producto },
          usuario: operador,
        });
        if (errBit) throw new Error("bitacora: " + errBit.message);

        ok++;
      } catch (err: any) {
        fail++;
        errores.push(`Fila ${fila.idx} (${fila.input.acreditado}): ${err.message}`);
      }
    }

    setImportando(false);
    setResultado({ ok, fail, errores });
    if (ok > 0 && fail === 0) {
      setTimeout(() => onDone(`${ok} crédito${ok === 1 ? "" : "s"} importado${ok === 1 ? "" : "s"} exitosamente.`), 1200);
    }
  }

  return (
    <Overlay onClose={importando ? () => {} : onClose} wide>
      <div style={{ padding: isMobile ? "20px 16px" : "28px 32px", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0a1628" }}>Importar cartera</h2>
          {!importando && <button className="btn btn-ghost" onClick={onClose} style={{ padding: "8px 14px" }}>✕</button>}
        </div>

        {/* File picker */}
        {filas.length === 0 && !resultado && (
          <div style={{ border: "2px dashed var(--line)", borderRadius: 10, padding: isMobile ? "32px 16px" : "48px 40px", textAlign: "center" }}>
            <Upload size={32} strokeWidth={1.5} color="#94a3b8" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "#475569", marginBottom: 4 }}>Selecciona un archivo .xlsx</p>
            <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 16 }}>Usa la plantilla descargable para llenar la cartera. Las filas de ejemplo se omiten automáticamente.</p>
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 16 }}>Todas las filas se importan con disposición única. No se soportan disposiciones múltiples en import.</p>
            <label className="btn btn-primary" style={{ cursor: "pointer", display: "inline-flex" }}>
              Seleccionar archivo
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {parseError && (
          <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "12px 16px", borderRadius: 6, fontSize: 13, marginTop: 12 }}>{parseError}</div>
        )}

        {/* Preview table */}
        {filas.length > 0 && !resultado && (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "var(--green)", fontWeight: 600 }}>{validas.length}</span> válida{validas.length === 1 ? "" : "s"}
              </div>
              {invalidas.length > 0 && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: "var(--red)", fontWeight: 600 }}>{invalidas.length}</span> con error
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Solo se importarán las filas válidas.</div>
            </div>

            <div className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Producto</th>
                      <th>Acreditado</th>
                      <th style={{ textAlign: "right" }}>Monto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => {
                      const montoDisplay = f.input.tipo_producto === "factoraje"
                        ? f.input.monto_factura ?? 0
                        : (f.input.tipo_producto === "arrendamiento_financiero" || f.input.tipo_producto === "arrendamiento_puro")
                          ? (f.input.valor_bien ?? 0) - (f.input.enganche ?? 0)
                          : f.input.monto ?? 0;
                      return (
                        <tr key={f.idx} style={{ background: f.valida ? undefined : "rgba(181,72,72,0.04)" }}>
                          <td className="mono">{f.idx}</td>
                          <td>
                            <span className="badge" style={{ background: f.input.tipo_producto === "factoraje" ? "#ede9fe" : f.input.tipo_producto.startsWith("arrendamiento") ? "#e0f2fe" : "#f0f2f5", color: f.input.tipo_producto === "factoraje" ? "#7c3aed" : f.input.tipo_producto.startsWith("arrendamiento") ? "#0284c7" : "#64748b", fontSize: 11 }}>
                              {TIPO_PRODUCTO_LABEL[f.input.tipo_producto] ?? f.input.tipo_producto}
                            </span>
                          </td>
                          <td>{f.input.acreditado}</td>
                          <td className="mono" style={{ textAlign: "right" }}>{mxn(montoDisplay)}</td>
                          <td>
                            {f.valida
                              ? <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 500 }}>Válida</span>
                              : <span style={{ color: "var(--red)", fontSize: 12 }} title={f.error}>{f.error}</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Progress bar during import */}
            {importando && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>
                  Importando {progreso.actual} de {progreso.total}…
                </div>
                <div style={{ background: "var(--line-soft)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ background: "var(--amber)", height: "100%", borderRadius: 4, width: `${(progreso.actual / progreso.total) * 100}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-ghost" onClick={() => { setFilas([]); setParseError(null); }} disabled={importando} style={{ flex: 1 }}>Volver</button>
              <button className="btn btn-primary" onClick={importar} disabled={importando || validas.length === 0} style={{ flex: 1 }}>
                {importando ? "Importando…" : `Importar ${validas.length} crédito${validas.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {/* Result */}
        {resultado && (
          <div style={{ marginTop: 12 }}>
            <div style={{ background: resultado.fail === 0 ? "var(--green-soft)" : "var(--amber-soft)", padding: "16px 20px", borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: resultado.fail === 0 ? "var(--green)" : "var(--amber)" }}>
                {resultado.ok} importado{resultado.ok === 1 ? "" : "s"}{resultado.fail > 0 ? `, ${resultado.fail} fallido${resultado.fail === 1 ? "" : "s"}` : ""}
              </div>
            </div>
            {resultado.errores.length > 0 && (
              <div className="panel" style={{ padding: "12px 16px", maxHeight: 200, overflowY: "auto", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--red)" }}>Errores:</div>
                {resultado.errores.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>{e}</div>
                ))}
              </div>
            )}
            <button className="btn btn-primary" onClick={() => onDone(`${resultado.ok} crédito${resultado.ok === 1 ? "" : "s"} importado${resultado.ok === 1 ? "" : "s"}.`)} style={{ width: "100%" }}>Cerrar</button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

// =====================================================================
// MODAL: Alta / Originar crédito — Wizard 3 pasos
// =====================================================================
const STEPS = ["Producto", "Condiciones", "Revisar"] as const;

function StepIndicator({ current, isMobile }: { current: number; isMobile?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, marginBottom: isMobile ? 16 : 20 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: isMobile ? 22 : 26, height: isMobile ? 22 : 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: isMobile ? 11 : 12, fontWeight: 600, background: active ? "var(--amber)" : done ? "#0a1628" : "var(--line-soft)", color: active || done ? "#fff" : "var(--text-faint)", transition: "all 0.2s" }}>
                {done ? "✓" : i + 1}
              </div>
              {!isMobile && <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? "#0a1628" : "var(--text-dim)" }}>{label}</span>}
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: done ? "#0a1628" : "var(--line)", minWidth: isMobile ? 16 : 24 }} />}
          </div>
        );
      })}
    </div>
  );
}

function ModalAlta({ onClose, onSaved, isMobile }: { onClose: () => void; onSaved: () => void; isMobile?: boolean }) {
  const [step, setStep] = useState(0);
  const [tipoProducto, setTipoProducto] = useState<TipoProducto>("credito_simple");
  const esArrendamiento = tipoProducto === "arrendamiento_financiero" || tipoProducto === "arrendamiento_puro";
  const esFactoraje = tipoProducto === "factoraje";
  const esRevolvente = tipoProducto === "linea_revolvente";

  // Client selector state
  const [clientesBusq, setClientesBusq] = useState<{ id: string; nombre: string; rfc: string | null }[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteSel, setClienteSel] = useState<{ id: string; nombre: string } | null>(null);
  const [mostrarAltaCliente, setMostrarAltaCliente] = useState(false);

  // Search clients on query change
  useEffect(() => {
    if (!clienteQuery || clienteQuery.length < 2) { setClientesBusq([]); return; }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from("clientes").select("id, nombre, rfc").or(`nombre.ilike.%${clienteQuery}%,rfc.ilike.%${clienteQuery}%`).limit(8);
      setClientesBusq((data ?? []) as any[]);
    }, 250);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  const [form, setForm] = useState({
    acreditado: "", rfc: "",
    monto: "", plazo_meses: "", frecuencia: "mensual" as Frecuencia,
    tipo_tasa: "fija" as "fija" | "variable",
    tasa_anual: "", tasa_referencia: "TIIE_28", valor_referencia: "", spread_pp: "",
    metodo_amort: "frances" as MetodoAmort,
    crecimiento: "5",
    tipo_garantia: "quirografaria",
    periodo_gracia_meses: "0", tipo_gracia: "ninguna" as TipoGracia,
    tipo_disposicion: "unica" as "unica" | "multiple",
    fecha_origen: new Date().toISOString().slice(0, 10),
    valor_bien: "", enganche: "", valor_residual: "",
    deudor: "", monto_factura: "", aforo: "80", tasa_descuento: "", comision_pct: "2",
    fecha_vencimiento: "",
    // Revolvente
    limite_linea: "", disposicion_inicial: "",
  });
  const [disposiciones, setDisposiciones] = useState<{ monto: string; fecha: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function cambiarProducto(tp: TipoProducto) {
    setTipoProducto(tp);
    if (tp === "arrendamiento_financiero" || tp === "arrendamiento_puro") {
      set("tipo_garantia", "bien_arrendado");
      set("metodo_amort", "frances");
    } else if (tp === "credito_simple") {
      set("tipo_garantia", "quirografaria");
    }
    setError(null);
  }

  const tasaEfectiva = form.tipo_tasa === "variable"
    ? (Number(form.valor_referencia) || 0) + (Number(form.spread_pp) || 0)
    : Number(form.tasa_anual) || 0;
  const graciaNum = Number(form.periodo_gracia_meses) || 0;
  const montoFinanciado = esArrendamiento ? (Number(form.valor_bien) || 0) - (Number(form.enganche) || 0) : 0;
  const capitalBase = esArrendamiento ? montoFinanciado
    : form.tipo_disposicion === "multiple" && disposiciones.length > 0
      ? disposiciones.reduce((s, d) => s + (Number(d.monto) || 0), 0)
      : Number(form.monto) || 0;
  const vrNum = esArrendamiento ? (Number(form.valor_residual) || 0) : 0;

  // Preview
  const puedePrevisualizar = !esFactoraje && capitalBase > 0 && tasaEfectiva > 0 && Number(form.plazo_meses) > 0;
  let preview: ReturnType<typeof generarTablaAmortizacion> = [];
  let previewErr: string | null = null;
  if (puedePrevisualizar) {
    try {
      const freq = form.frecuencia as Frecuencia;
      preview = generarTablaAmortizacion({ monto: capitalBase, tasaAnual: tasaEfectiva / 100, plazoMeses: Number(form.plazo_meses), frecuencia: freq, metodo: form.metodo_amort, fechaOrigen: form.fecha_origen, crecimientoPeriodo: form.metodo_amort === "creciente" ? Number(form.crecimiento) / 100 : undefined, graciaPeridos: graciaNum > 0 ? calcularGraciaPeridos(graciaNum, freq) : 0, tipoGracia: graciaNum > 0 ? form.tipo_gracia : "ninguna", valorResidual: vrNum });
    } catch (e: any) { previewErr = e.message; }
  }
  let previewFact: DesgloseFactoraje | null = null;
  let previewFactErr: string | null = null;
  if (esFactoraje && Number(form.monto_factura) > 0 && Number(form.tasa_descuento) > 0 && form.fecha_vencimiento) {
    try {
      previewFact = calcularFactoraje({ montoFactura: Number(form.monto_factura), aforo: Number(form.aforo) || 80, tasaDescuento: Number(form.tasa_descuento), comisionPct: Number(form.comision_pct) || 0, fechaOrigen: form.fecha_origen, fechaVencimiento: form.fecha_vencimiento });
    } catch (e: any) { previewFactErr = e.message; }
  }

  // Validation per step
  function validarPaso(s: number): string | null {
    if (s === 0) {
      if (!clienteSel) return "Selecciona un cliente.";
      if (esFactoraje && !form.deudor) return "Ingresa el deudor.";
    }
    if (s === 1) {
      if (esRevolvente) {
        if (!form.limite_linea || Number(form.limite_linea) <= 0) return "Ingresa el límite de la línea.";
        if (tasaEfectiva <= 0) return "La tasa debe ser mayor a 0.";
        if (!form.plazo_meses) return "Ingresa la vigencia (meses).";
        const di = Number(form.disposicion_inicial) || 0;
        if (di > Number(form.limite_linea)) return "La disposición inicial no puede exceder el límite.";
      } else if (esFactoraje) {
        if (!form.monto_factura || Number(form.monto_factura) <= 0) return "Ingresa el monto de la factura.";
        if (!form.tasa_descuento || Number(form.tasa_descuento) <= 0) return "Ingresa la tasa de descuento.";
        if (!form.fecha_vencimiento) return "Ingresa la fecha de vencimiento.";
        const aforoN = Number(form.aforo) || 0;
        if (aforoN < 1 || aforoN > 100) return "El aforo debe estar entre 1% y 100%.";
      } else if (esArrendamiento) {
        if (!form.valor_bien || Number(form.valor_bien) <= 0) return "Ingresa el valor del bien.";
        if (montoFinanciado <= 0) return "El monto a financiar debe ser positivo.";
        if (tasaEfectiva <= 0) return "La tasa debe ser mayor a 0.";
        if (!form.plazo_meses) return "Ingresa el plazo.";
        if (vrNum >= montoFinanciado) return "El valor residual debe ser menor al monto financiado.";
      } else {
        if (!form.monto) return "Ingresa el monto.";
        if (tasaEfectiva <= 0) return "La tasa debe ser mayor a 0.";
        if (!form.plazo_meses) return "Ingresa el plazo.";
        if (graciaNum >= Number(form.plazo_meses)) return "La gracia debe ser menor al plazo.";
        if (form.tipo_disposicion === "multiple") {
          const sumDisp = disposiciones.reduce((s, d) => s + (Number(d.monto) || 0), 0);
          if (sumDisp > Number(form.monto)) return "La suma de disposiciones excede el monto autorizado.";
        }
      }
    }
    return null;
  }

  function siguiente() {
    const err = validarPaso(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep(step + 1);
  }

  async function guardar() {
    setError(null);
    const input: InputOperacion = {
      tipo_producto: tipoProducto, acreditado: clienteSel?.nombre ?? form.acreditado, cliente_id: clienteSel?.id, rfc: form.rfc || undefined, fecha_origen: form.fecha_origen,
      monto: Number(form.monto) || 0, tipo_tasa: form.tipo_tasa, tasa_anual_pct: Number(form.tasa_anual) || 0,
      tasa_referencia: form.tasa_referencia, valor_referencia_pct: Number(form.valor_referencia) || 0, spread_pp: Number(form.spread_pp) || 0,
      plazo_meses: Number(form.plazo_meses) || 0, frecuencia: form.frecuencia, metodo_amort: form.metodo_amort,
      crecimiento_pct: Number(form.crecimiento) || 5, tipo_garantia: form.tipo_garantia, periodo_gracia_meses: graciaNum,
      tipo_gracia: form.tipo_gracia, tipo_disposicion: esArrendamiento ? "unica" : form.tipo_disposicion as "unica" | "multiple",
      valor_bien: Number(form.valor_bien) || 0, enganche: Number(form.enganche) || 0, valor_residual: Number(form.valor_residual) || 0,
      deudor: form.deudor || undefined, monto_factura: Number(form.monto_factura) || 0, aforo_pct: Number(form.aforo) || 80,
      tasa_descuento_pct: Number(form.tasa_descuento) || 0, comision_pct: Number(form.comision_pct) || 0,
      fecha_vencimiento: form.fecha_vencimiento || undefined,
      limite_linea: Number(form.limite_linea) || 0,
      disposicion_inicial: Number(form.disposicion_inicial) || 0,
    };
    let resultado: ResultadoOperacion;
    try { resultado = construirOperacion(input); } catch (e: any) { setError(e.message); return; }

    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";
    const { creditoRow, cupones, disposicionMonto } = resultado;

    const { data: credito, error: errCred } = await supabase.from("creditos").insert(creditoRow).select().single();
    if (errCred || !credito) { setGuardando(false); setError("Error: " + (errCred?.message ?? "")); return; }

    if (esRevolvente) {
      // No disposiciones nor amortizacion for revolvente
      if (resultado.movimientoInicial) {
        await supabase.from("movimientos_linea").insert({ credito_id: credito.id, fecha: resultado.movimientoInicial.fecha, tipo: resultado.movimientoInicial.tipo, monto: resultado.movimientoInicial.monto, nota: "Disposición inicial" });
      }
    } else {
      if (tipoProducto === "credito_simple" && form.tipo_disposicion === "multiple" && disposiciones.length > 0) {
        await supabase.from("disposiciones").insert(disposiciones.map((d, i) => ({ credito_id: credito.id, numero: i + 1, monto: Number(d.monto), fecha: d.fecha })));
      } else {
        await supabase.from("disposiciones").insert({ credito_id: credito.id, numero: 1, monto: disposicionMonto, fecha: form.fecha_origen });
      }
      await supabase.from("amortizacion").insert(cupones.map((c) => ({ credito_id: credito.id, numero_cupon: c.numero_cupon, fecha_pago: c.fecha_pago, saldo_inicial: c.saldo_inicial, capital: c.capital, interes: c.interes, pago_total: c.pago_total, saldo_final: c.saldo_final, ...(c.valor_referencia != null ? { valor_referencia: c.valor_referencia } : {}), ...(c.tasa_aplicada != null ? { tasa_aplicada: c.tasa_aplicada } : {}) })));
    }
    await supabase.from("bitacora").insert({ entidad: "credito", entidad_id: credito.id, accion: "creado", detalle: { folio: creditoRow.folio, tipo: tipoProducto, monto: creditoRow.monto ?? creditoRow.limite_linea, cupones: cupones.length }, usuario: operador });
    setGuardando(false);
    onSaved();
  }

  const sectionTitle = (t: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)", marginBottom: 12, marginTop: 8, borderBottom: "1px solid var(--line-soft)", paddingBottom: 6 }}>{t}</div>
  );

  // ── Shared tasa fields ──
  const tasaFields = (
    <>
      <div className="field">
        <label>Tipo de tasa</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["fija", "variable"] as const).map((t) => (
            <button key={t} onClick={() => set("tipo_tasa", t)} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontFamily: "inherit", fontWeight: form.tipo_tasa === t ? 600 : 400, border: form.tipo_tasa === t ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: form.tipo_tasa === t ? "var(--amber-soft)" : "transparent", color: form.tipo_tasa === t ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
              {t === "fija" ? "Fija" : "Variable"}
            </button>
          ))}
        </div>
      </div>
      {form.tipo_tasa === "fija" ? (
        <div className="field"><label>Tasa anual (%) *</label><input className="input mono" type="number" value={form.tasa_anual} onChange={(e) => set("tasa_anual", e.target.value)} placeholder="24" /></div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div className="field"><label>Referencia</label><select className="select" value={form.tasa_referencia} onChange={(e) => set("tasa_referencia", e.target.value)}><option value="TIIE_28">TIIE 28d</option><option value="TIIE_FONDEO">TIIE Fondeo</option><option value="TIIE_91">TIIE 91d</option><option value="TIIE_182">TIIE 182d</option></select></div>
            <div className="field"><label>Valor ref (%)</label><input className="input mono" type="number" value={form.valor_referencia} onChange={(e) => set("valor_referencia", e.target.value)} placeholder="10.50" /></div>
            <div className="field"><label>Spread (pp)</label><input className="input mono" type="number" value={form.spread_pp} onChange={(e) => set("spread_pp", e.target.value)} placeholder="4.50" /></div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--amber-soft)", padding: "6px 10px", borderRadius: 6 }}>Tasa efectiva: <strong className="mono">{tasaEfectiva.toFixed(2)}%</strong></div>
        </>
      )}
    </>
  );

  const graciaFields = (
    <div style={{ display: "grid", gridTemplateColumns: graciaNum > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
      <div className="field"><label>Periodo de gracia (meses)</label><input className="input mono" type="number" min="0" value={form.periodo_gracia_meses} onChange={(e) => set("periodo_gracia_meses", e.target.value)} /></div>
      {graciaNum > 0 && (
        <div className="field"><label>Tipo de gracia</label><select className="select" value={form.tipo_gracia} onChange={(e) => set("tipo_gracia", e.target.value as TipoGracia)}><option value="capital">Solo interés (capital)</option><option value="total">Sin pagos (total)</option></select></div>
      )}
    </div>
  );

  // ── Preview component (reused in step 3) ──
  const previewPanel = (
    <div style={{ background: "#f4f6f8", borderRadius: 8, padding: isMobile ? "16px" : "20px 22px" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0a1628", marginBottom: 8 }}>Vista previa</h3>
      {esFactoraje ? (
        previewFactErr ? <p style={{ color: "var(--red)", fontSize: 13 }}>{previewFactErr}</p>
        : !previewFact ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Datos insuficientes para el desglose.</p>
        : (
          <div className="panel" style={{ padding: "16px 18px", marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Desglose de la operación</div>
            <div style={{ display: "grid", gap: 8 }}>
              <DesgloseRow label="Monto factura" valor={mxn(Number(form.monto_factura))} />
              <DesgloseRow label={`Anticipo (${form.aforo}%)`} valor={mxn(previewFact.anticipo)} />
              <DesgloseRow label={`Descuento (${previewFact.dias}d)`} valor={`- ${mxn(previewFact.descuento)}`} dim />
              <DesgloseRow label={`Comisión (${form.comision_pct}%)`} valor={`- ${mxn(previewFact.comision)}`} dim />
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }} />
              <DesgloseRow label="Desembolso al cedente" valor={mxn(previewFact.desembolso)} bold />
              <DesgloseRow label="Reserva" valor={mxn(previewFact.reserva)} dim />
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }} />
              <DesgloseRow label="Ingreso CapiProm" valor={mxn(previewFact.ingresoFactor)} bold amber />
              <DesgloseRow label="Días al vencimiento" valor={String(previewFact.dias)} dim />
            </div>
          </div>
        )
      ) : (
        previewErr ? <p style={{ color: "var(--red)", fontSize: 13 }}>{previewErr}</p>
        : preview.length === 0 ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>Datos insuficientes para la tabla.</p>
        : (
          <>
            <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 10 }}>
              {preview.length} cupones{vrNum > 0 ? " (incl. opción de compra)" : ""}{graciaNum > 0 ? ` · ${graciaNum}m gracia` : ""}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead><tr><th>#</th><th>Fecha</th><th style={{ textAlign: "right" }}>Capital</th><th style={{ textAlign: "right" }}>Interés</th><th style={{ textAlign: "right" }}>Pago</th></tr></thead>
                <tbody>
                  {preview.map((c, idx) => {
                    const esOC = vrNum > 0 && idx === preview.length - 1;
                    return (
                      <tr key={c.numero_cupon} style={esOC ? { background: "var(--amber-soft)" } : undefined}>
                        <td className="mono">{esOC ? "OC" : c.numero_cupon}</td>
                        <td style={{ fontSize: 11.5 }}>{fecha(c.fecha_pago)}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{mxn(c.capital)}</td>
                        <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(c.interes)}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{mxn(c.pago_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );

  return (
    <Overlay onClose={onClose} wide={step === 2}>
      <div style={{ padding: isMobile ? "24px 20px" : "30px 32px", maxHeight: "90vh", overflowY: "auto" }}>
        <StepIndicator current={step} isMobile={isMobile} />

        {/* ═══════ PASO 1: Producto y partes ═══════ */}
        {step === 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {sectionTitle("Tipo de producto")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["credito_simple", "arrendamiento_financiero", "arrendamiento_puro", "factoraje", "linea_revolvente"] as TipoProducto[]).map((tp) => (
                <button key={tp} onClick={() => cambiarProducto(tp)} style={{ padding: "9px 6px", fontSize: 12.5, fontFamily: "inherit", fontWeight: tipoProducto === tp ? 600 : 400, border: tipoProducto === tp ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: tipoProducto === tp ? "var(--amber-soft)" : "transparent", color: tipoProducto === tp ? "var(--amber)" : "var(--text-dim)", cursor: "pointer", lineHeight: 1.3 }}>
                  {TIPO_PRODUCTO_FULL[tp]}
                </button>
              ))}
            </div>

            {sectionTitle(esFactoraje ? "Cedente" : "Cliente")}
            {clienteSel ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--amber-soft)", borderRadius: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{clienteSel.nombre}</span>
                <button className="btn btn-ghost" onClick={() => { setClienteSel(null); setClienteQuery(""); }} style={{ padding: "4px 10px", fontSize: 12 }}>Cambiar</button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div className="field"><label>{esFactoraje ? "Buscar cedente *" : "Buscar cliente *"}</label><input className="input" value={clienteQuery} onChange={(e) => setClienteQuery(e.target.value)} placeholder="Nombre o RFC…" /></div>
                {clientesBusq.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 6, boxShadow: "var(--shadow-md)", maxHeight: 200, overflowY: "auto" }}>
                    {clientesBusq.map((c) => (
                      <button key={c.id} onClick={() => { setClienteSel({ id: c.id, nombre: c.nombre }); setClienteQuery(""); setClientesBusq([]); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, background: "transparent", border: "none", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                        {c.rfc && <span style={{ color: "var(--text-faint)", fontSize: 11.5, marginLeft: 8 }}>{c.rfc}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn btn-ghost" onClick={() => setMostrarAltaCliente(true)} style={{ marginTop: 6, fontSize: 12, padding: "6px 12px" }}><Plus size={12} strokeWidth={1.75} /> Nuevo cliente</button>
              </div>
            )}
            {esFactoraje && (
              <div className="field"><label>Deudor (quién paga la factura) *</label><input className="input" value={form.deudor} onChange={(e) => set("deudor", e.target.value)} /></div>
            )}

            {mostrarAltaCliente && <ModalAltaCliente isMobile={isMobile} onClose={() => setMostrarAltaCliente(false)} onSaved={() => setMostrarAltaCliente(false)} onCreated={(c: any) => { setClienteSel({ id: c.id, nombre: c.nombre }); setMostrarAltaCliente(false); }} />}
          </div>
        )}

        {/* ═══════ PASO 2: Condiciones ═══════ */}
        {step === 1 && (
          <div style={{ display: "grid", gap: 12 }}>

            {/* CRÉDITO SIMPLE */}
            {tipoProducto === "credito_simple" && (<>
              {sectionTitle("Estructura financiera")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>{form.tipo_disposicion === "multiple" ? "Monto de línea autorizada *" : "Monto (MXN) *"}</label><input className="input mono" type="number" value={form.monto} onChange={(e) => set("monto", e.target.value)} placeholder="100000" /></div>
                <div className="field"><label>Plazo (meses) *</label><input className="input mono" type="number" value={form.plazo_meses} onChange={(e) => set("plazo_meses", e.target.value)} placeholder="12" /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Frecuencia</label><select className="select" value={form.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option><option value="semanal">Semanal</option></select></div>
                <div className="field"><label>Fecha de origen</label><input className="input mono" type="date" value={form.fecha_origen} onChange={(e) => set("fecha_origen", e.target.value)} /></div>
              </div>
              {tasaFields}
              <div className="field">
                <label>Método de amortización</label>
                <select className="select" value={form.metodo_amort} onChange={(e) => set("metodo_amort", e.target.value)}>
                  <option value="frances">Francés (cuota fija)</option><option value="lineal">Lineal (capital constante)</option><option value="bullet">Bullet (capital al final)</option><option value="creciente">Creciente</option>
                </select>
              </div>
              {form.metodo_amort === "creciente" && (
                <div className="field"><label>Crecimiento por periodo (%)</label><input className="input mono" type="number" value={form.crecimiento} onChange={(e) => set("crecimiento", e.target.value)} placeholder="5" style={{ maxWidth: 160 }} /></div>
              )}
              {sectionTitle("Estructura de la línea")}
              <div className="field"><label>Tipo de garantía</label><select className="select" value={form.tipo_garantia} onChange={(e) => set("tipo_garantia", e.target.value)}><option value="quirografaria">Quirografaria</option><option value="fideicomiso_flujo">Fideicomiso de flujo</option><option value="derecho_cobro">Cesión de derecho de cobro</option></select></div>
              {graciaFields}
              <div className="field">
                <label>Tipo de disposición</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["unica", "multiple"] as const).map((t) => (
                    <button key={t} onClick={() => { set("tipo_disposicion", t); if (t === "unica") setDisposiciones([]); }} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontFamily: "inherit", fontWeight: form.tipo_disposicion === t ? 600 : 400, border: form.tipo_disposicion === t ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: form.tipo_disposicion === t ? "var(--amber-soft)" : "transparent", color: form.tipo_disposicion === t ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
                      {t === "unica" ? "Única" : "Múltiple"}
                    </button>
                  ))}
                </div>
              </div>
              {form.tipo_disposicion === "multiple" && (
                <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
                  {disposiciones.map((d, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                      <div className="field"><label>Monto #{i + 1}</label><input className="input mono" type="number" value={d.monto} onChange={(e) => { const n = [...disposiciones]; n[i] = { ...n[i], monto: e.target.value }; setDisposiciones(n); }} /></div>
                      <div className="field"><label>Fecha</label><input className="input mono" type="date" value={d.fecha} onChange={(e) => { const n = [...disposiciones]; n[i] = { ...n[i], fecha: e.target.value }; setDisposiciones(n); }} /></div>
                      <button className="btn btn-ghost" onClick={() => setDisposiciones(disposiciones.filter((_, j) => j !== i))} style={{ padding: "8px", marginBottom: 1 }}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-ghost" onClick={() => setDisposiciones([...disposiciones, { monto: "", fecha: form.fecha_origen }])} style={{ fontSize: 12, padding: "6px 12px" }}>+ Agregar disposición</button>
                  {disposiciones.length > 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>Dispuesto: <span className="mono">{mxn(disposiciones.reduce((s, d) => s + (Number(d.monto) || 0), 0))}</span> de {mxn(Number(form.monto) || 0)} autorizado</div>}
                </div>
              )}
            </>)}

            {/* ARRENDAMIENTO */}
            {esArrendamiento && (<>
              {sectionTitle("Bien arrendado")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Valor del bien (MXN) *</label><input className="input mono" type="number" value={form.valor_bien} onChange={(e) => set("valor_bien", e.target.value)} placeholder="500000" /></div>
                <div className="field"><label>Enganche (MXN)</label><input className="input mono" type="number" value={form.enganche} onChange={(e) => set("enganche", e.target.value)} placeholder="0" /></div>
              </div>
              {montoFinanciado > 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--amber-soft)", padding: "6px 10px", borderRadius: 6 }}>Monto a financiar: <strong className="mono">{mxn(montoFinanciado)}</strong></div>}
              {sectionTitle("Términos")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Plazo (meses) *</label><input className="input mono" type="number" value={form.plazo_meses} onChange={(e) => set("plazo_meses", e.target.value)} placeholder="36" /></div>
                <div className="field"><label>Frecuencia</label><select className="select" value={form.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option><option value="semanal">Semanal</option></select></div>
              </div>
              <div className="field"><label>Fecha de origen</label><input className="input mono" type="date" value={form.fecha_origen} onChange={(e) => set("fecha_origen", e.target.value)} /></div>
              {tasaFields}
              <div className="field"><label>Método de amortización</label><select className="select" value={form.metodo_amort} onChange={(e) => set("metodo_amort", e.target.value)}><option value="frances">Francés (cuota fija)</option><option value="lineal">Lineal (capital constante)</option></select></div>
              <div className="field">
                <label>Valor residual / Opción de compra (MXN)</label>
                <input className="input mono" type="number" value={form.valor_residual} onChange={(e) => set("valor_residual", e.target.value)} placeholder={tipoProducto === "arrendamiento_financiero" ? String(Math.round((Number(form.valor_bien) || 0) * 0.01)) || "1% del bien" : String(Math.round((Number(form.valor_bien) || 0) * 0.25)) || "20-40% del bien"} />
                {Number(form.valor_bien) > 0 && vrNum > 0 && <span style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, display: "block" }}>{((vrNum / Number(form.valor_bien)) * 100).toFixed(1)}% del valor del bien</span>}
              </div>
              {sectionTitle("Garantía")}
              <div className="field"><label>Tipo de garantía</label><select className="select" value={form.tipo_garantia} onChange={(e) => set("tipo_garantia", e.target.value)}><option value="bien_arrendado">Bien arrendado</option><option value="quirografaria">Quirografaria</option><option value="fideicomiso_flujo">Fideicomiso de flujo</option><option value="derecho_cobro">Cesión de derecho de cobro</option></select></div>
              {graciaFields}
            </>)}

            {/* FACTORAJE */}
            {esFactoraje && (<>
              {sectionTitle("Factura")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Monto de la factura (MXN) *</label><input className="input mono" type="number" value={form.monto_factura} onChange={(e) => set("monto_factura", e.target.value)} placeholder="500000" /></div>
                <div className="field"><label>Aforo (%) *</label><input className="input mono" type="number" value={form.aforo} onChange={(e) => set("aforo", e.target.value)} placeholder="80" /></div>
              </div>
              {sectionTitle("Condiciones")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Tasa de descuento anual (%) *</label><input className="input mono" type="number" value={form.tasa_descuento} onChange={(e) => set("tasa_descuento", e.target.value)} placeholder="24" /></div>
                <div className="field"><label>Comisión (%)</label><input className="input mono" type="number" value={form.comision_pct} onChange={(e) => set("comision_pct", e.target.value)} placeholder="2" /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Fecha de origen</label><input className="input mono" type="date" value={form.fecha_origen} onChange={(e) => set("fecha_origen", e.target.value)} /></div>
                <div className="field"><label>Fecha de vencimiento *</label><input className="input mono" type="date" value={form.fecha_vencimiento} onChange={(e) => set("fecha_vencimiento", e.target.value)} /></div>
              </div>
            </>)}

            {/* LÍNEA REVOLVENTE */}
            {esRevolvente && (<>
              {sectionTitle("Línea")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Límite de la línea (MXN) *</label><input className="input mono" type="number" value={form.limite_linea} onChange={(e) => set("limite_linea", e.target.value)} placeholder="1000000" /></div>
                <div className="field"><label>Vigencia (meses) *</label><input className="input mono" type="number" value={form.plazo_meses} onChange={(e) => set("plazo_meses", e.target.value)} placeholder="12" /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Frecuencia de corte</label><select className="select" value={form.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option></select></div>
                <div className="field"><label>Fecha de origen</label><input className="input mono" type="date" value={form.fecha_origen} onChange={(e) => set("fecha_origen", e.target.value)} /></div>
              </div>
              {tasaFields}
              {sectionTitle("Garantía")}
              <div className="field"><label>Tipo de garantía</label><select className="select" value={form.tipo_garantia} onChange={(e) => set("tipo_garantia", e.target.value)}><option value="quirografaria">Quirografaria</option><option value="fideicomiso_flujo">Fideicomiso de flujo</option><option value="derecho_cobro">Cesión de derecho de cobro</option></select></div>
              {sectionTitle("Disposición inicial (opcional)")}
              <div className="field"><label>Monto a disponer</label><input className="input mono" type="number" value={form.disposicion_inicial} onChange={(e) => set("disposicion_inicial", e.target.value)} placeholder="0" /></div>
              {Number(form.disposicion_inicial) > 0 && Number(form.limite_linea) > 0 && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--amber-soft)", padding: "6px 10px", borderRadius: 6 }}>
                  Disponible después de disposición: <strong className="mono">{mxn(Number(form.limite_linea) - Number(form.disposicion_inicial))}</strong>
                </div>
              )}
            </>)}
          </div>
        )}

        {/* ═══════ PASO 3: Revisar ═══════ */}
        {step === 2 && (
          <div>
            {esRevolvente ? (
              <div style={{ background: "#f4f6f8", borderRadius: 8, padding: isMobile ? "16px" : "20px 22px" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Resumen de la línea</h3>
                <div className="panel" style={{ padding: "16px 18px" }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <DesgloseRow label="Límite" valor={mxn(Number(form.limite_linea))} bold />
                    <DesgloseRow label="Disposición inicial" valor={Number(form.disposicion_inicial) > 0 ? mxn(Number(form.disposicion_inicial)) : "—"} />
                    <DesgloseRow label="Disponible" valor={mxn(Number(form.limite_linea) - (Number(form.disposicion_inicial) || 0))} bold amber />
                    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }} />
                    <DesgloseRow label="Tasa" valor={tasaEfectiva.toFixed(2) + "% anual"} />
                    <DesgloseRow label="Vigencia" valor={form.plazo_meses + " meses"} dim />
                    <DesgloseRow label="Garantía" valor={GARANTIA_LABEL[form.tipo_garantia] ?? form.tipo_garantia} dim />
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10 }}>La línea revolvente no genera tabla de amortización. El interés se calcula sobre el saldo dispuesto.</p>
              </div>
            ) : previewPanel}
          </div>
        )}

        {/* Error + navigation */}
        {error && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13.5, marginTop: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {step === 0
            ? <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
            : <button className="btn btn-ghost" onClick={() => { setStep(step - 1); setError(null); }} style={{ flex: 1 }}>Atrás</button>
          }
          {step < 2
            ? <button className="btn btn-primary" onClick={siguiente} style={{ flex: 1 }}>Siguiente</button>
            : <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ flex: 1 }}>{guardando ? "Guardando…" : "Originar"}</button>
          }
        </div>
      </div>
    </Overlay>
  );
}

function DesgloseRow({ label, valor, bold, dim, amber }: { label: string; valor: string; bold?: boolean; dim?: boolean; amber?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
      <span style={{ color: dim ? "var(--text-faint)" : "var(--text-dim)" }}>{label}</span>
      <span className="mono" style={{ fontWeight: bold ? 700 : 400, color: amber ? "var(--amber)" : dim ? "var(--text-faint)" : "#0a1628" }}>{valor}</span>
    </div>
  );
}

// =====================================================================
// MODAL: Detalle
// =====================================================================
function ModalDetalle({ credito, rol, isMobile, onClose, onChanged, onDeleted }: { credito: Credito; rol: Rol | null; isMobile?: boolean; onClose: () => void; onChanged: () => void; onDeleted: (folio: string) => void }) {
  const readOnly = rol ? esSoloLectura(rol) : false;
  const canDelete = rol ? puedeEliminar(rol) : false;
  const [amort, setAmort] = useState<any[]>([]);
  const [bitacora, setBitacora] = useState<any[]>([]);
  const [disps, setDisps] = useState<Disposicion[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [estatus, setEstatus] = useState(credito.estatus);
  const [guardando, setGuardando] = useState(false);
  const [mostrarConfirmElim, setMostrarConfirmElim] = useState(false);
  const [mostrarRevisarTasas, setMostrarRevisarTasas] = useState(false);
  const [mostrarReestructura, setMostrarReestructura] = useState(false);
  // Revolvente: forms for new movements
  const [movForm, setMovForm] = useState({ tipo: "disposicion" as "disposicion" | "pago", monto: "", fecha: new Date().toISOString().slice(0, 10), nota: "" });
  const [movError, setMovError] = useState<string | null>(null);
  const [movGuardando, setMovGuardando] = useState(false);

  const esRev = credito.tipo_producto === "linea_revolvente";

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [a, b, d] = await Promise.all([
      supabase.from("amortizacion").select("*").eq("credito_id", credito.id).order("numero_cupon"),
      supabase.from("bitacora").select("*").eq("entidad", "credito").eq("entidad_id", credito.id).order("created_at", { ascending: false }),
      supabase.from("disposiciones").select("*").eq("credito_id", credito.id).order("numero"),
    ]);
    setAmort(a.data ?? []);
    setBitacora(b.data ?? []);
    setDisps((d.data ?? []) as Disposicion[]);
    if (esRev) {
      const { data: movs } = await supabase.from("movimientos_linea").select("*").eq("credito_id", credito.id).order("fecha").order("created_at");
      setMovimientos(movs ?? []);
    }
  }, [credito.id, esRev]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstatus() {
    if (estatus === credito.estatus) return;
    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";
    await supabase.from("creditos").update({ estatus }).eq("id", credito.id);
    await supabase.from("bitacora").insert({ entidad: "credito", entidad_id: credito.id, accion: "cambio_estatus", detalle: { de: credito.estatus, a: estatus }, usuario: operador });
    setGuardando(false);
    onChanged();
    cargar();
  }

  async function marcarPagado(cuponId: string, pagado: boolean) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("amortizacion").update({ pagado, fecha_pago_real: pagado ? new Date().toISOString().slice(0, 10) : null }).eq("id", cuponId);
    await supabase.from("bitacora").insert({ entidad: "credito", entidad_id: credito.id, accion: pagado ? "pago_registrado" : "pago_revertido", detalle: { cupon: cuponId }, usuario: userData.user?.email ?? "sistema" });
    cargar(); onChanged();
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
    <Overlay onClose={onClose} wide>
      <div style={{ padding: isMobile ? "20px 16px" : "28px 32px", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 8 }}>
          <div>
            <span className="mono" style={{ color: "var(--amber)", fontSize: 13 }}>{credito.folio}</span>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: "#0a1628", marginTop: 4 }}>{credito.acreditado}</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!readOnly && !esRev && ["vigente", "en_mora"].includes(credito.estatus) && (
              <button className="btn btn-ghost" onClick={() => setMostrarReestructura(true)} style={{ padding: "8px 14px", fontSize: 12.5, color: "var(--amber)" }}>Reestructurar</button>
            )}
            {canDelete && <button className="btn btn-danger" onClick={() => setMostrarConfirmElim(true)} style={{ padding: "8px 14px", fontSize: 12.5 }}><Trash2 size={14} strokeWidth={1.75} /> Eliminar</button>}
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: "8px 14px" }}>✕</button>
          </div>
        </div>

        {/* Origen de reestructura */}
        {credito.credito_origen_id && (
          <div style={{ fontSize: 12.5, color: "var(--amber)", marginBottom: 8 }}>Reestructura de crédito anterior</div>
        )}

        {/* Parametrización */}
        <div style={{ marginBottom: 6 }}>
          <span className="badge" style={{ background: credito.tipo_producto === "factoraje" ? "#ede9fe" : credito.tipo_producto === "linea_revolvente" ? "#ecfdf5" : credito.tipo_producto?.startsWith("arrendamiento") ? "#e0f2fe" : "#f0f2f5", color: credito.tipo_producto === "factoraje" ? "#7c3aed" : credito.tipo_producto === "linea_revolvente" ? "#059669" : credito.tipo_producto?.startsWith("arrendamiento") ? "#0284c7" : "#64748b", fontSize: 11.5, marginBottom: 8, display: "inline-block" }}>{TIPO_PRODUCTO_FULL[credito.tipo_producto] ?? "Crédito Simple"}</span>
        </div>

        {/* Arrendamiento: info del bien */}
        {(credito.tipo_producto === "arrendamiento_financiero" || credito.tipo_producto === "arrendamiento_puro") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 12, background: "#f0f9ff", padding: "12px 14px", borderRadius: 8 }}>
            <Dato label="Valor del bien" valor={mxn(Number(credito.valor_bien ?? 0))} />
            <Dato label="Enganche" valor={mxn(Number(credito.enganche ?? 0))} />
            <Dato label="Monto financiado" valor={mxn(Number(credito.monto))} />
            <Dato label="Valor residual" valor={mxn(Number(credito.valor_residual ?? 0))} />
          </div>
        )}

        {/* Factoraje: desglose */}
        {credito.tipo_producto === "factoraje" && credito.monto_factura ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 12, background: "#faf5ff", padding: "12px 14px", borderRadius: 8 }}>
              <Dato label="Deudor" valor={credito.deudor ?? "—"} />
              <Dato label="Monto factura" valor={mxn(Number(credito.monto_factura))} />
              <Dato label={`Aforo (${credito.aforo ?? 0}%)`} valor={mxn(Number(credito.monto))} />
              <Dato label="Vencimiento" valor={credito.fecha_vencimiento ? fecha(credito.fecha_vencimiento) : "—"} />
            </div>
            {(() => {
              try {
                const desg = calcularFactoraje({
                  montoFactura: Number(credito.monto_factura),
                  aforo: Number(credito.aforo ?? 80),
                  tasaDescuento: Number(credito.tasa_descuento ?? 0),
                  comisionPct: Number(credito.comision_pct ?? 0),
                  fechaOrigen: credito.fecha_origen,
                  fechaVencimiento: credito.fecha_vencimiento ?? credito.fecha_origen,
                });
                return (
                  <div className="panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Liquidación</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <DesgloseRow label={`Anticipo (${credito.aforo}%)`} valor={mxn(desg.anticipo)} />
                      <DesgloseRow label={`Descuento (${desg.dias}d)`} valor={`- ${mxn(desg.descuento)}`} dim />
                      <DesgloseRow label={`Comisión (${credito.comision_pct}%)`} valor={`- ${mxn(desg.comision)}`} dim />
                      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }} />
                      <DesgloseRow label="Desembolso al cedente" valor={mxn(desg.desembolso)} bold />
                      <DesgloseRow label="Reserva" valor={mxn(desg.reserva)} dim />
                      <DesgloseRow label="Ingreso CapiProm" valor={mxn(desg.ingresoFactor)} bold amber />
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </>
        ) : esRev ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 20 }}>
            <Dato label="Límite" valor={mxn(Number(credito.limite_linea ?? 0))} />
            <Dato label="Tasa" valor={tasaLabel(credito)} />
            <Dato label="Vigencia" valor={`${credito.plazo_meses}m`} />
            <Dato label="Garantía" valor={GARANTIA_LABEL[credito.tipo_garantia] ?? credito.tipo_garantia} />
            <Dato label="Origen" valor={fecha(credito.fecha_origen)} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 20 }}>
            <Dato label="Monto" valor={mxn(Number(credito.monto))} />
            <Dato label="Tasa" valor={tasaLabel(credito)} />
            <Dato label="Plazo" valor={`${credito.plazo_meses}m`} />
            <Dato label="Método" valor={credito.metodo_amort} />
            <Dato label="Garantía" valor={GARANTIA_LABEL[credito.tipo_garantia] ?? credito.tipo_garantia} />
            <Dato label="Gracia" valor={graciaLabel(credito)} />
            <Dato label="Disposición" valor={credito.tipo_disposicion === "multiple" ? `Múltiple (${disps.length})` : "Única"} />
            <Dato label="Origen" valor={fecha(credito.fecha_origen)} />
          </div>
        )}

        {/* Disposiciones table (if multiple) */}
        {credito.tipo_disposicion === "multiple" && disps.length > 0 && (
          <div className="panel" style={{ marginBottom: 20, overflow: "hidden" }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead><tr><th>#</th><th>Fecha</th><th style={{ textAlign: "right" }}>Monto</th></tr></thead>
              <tbody>{disps.map((d) => (
                <tr key={d.id}><td className="mono">{d.numero}</td><td>{fecha(d.fecha)}</td><td className="mono" style={{ textAlign: "right" }}>{mxn(Number(d.monto))}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* Borrador: banner de activación */}
        {credito.estatus === "borrador" && !readOnly && (
          <WizardActivar credito={credito} onActivated={() => { onChanged(); cargar(); }} isMobile={isMobile} />
        )}

        {!readOnly && credito.estatus !== "borrador" && <div className="panel" style={{ padding: "16px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>Estatus:</span>
          <select className="select" value={estatus} onChange={(e) => setEstatus(e.target.value)} style={{ width: "auto", minWidth: 160 }}>{ESTATUS_CREDITO.filter(s => s !== "borrador").map((s) => <option key={s} value={s}>{labelEstatus[s]}</option>)}</select>
          <button className="btn btn-primary" onClick={cambiarEstatus} disabled={estatus === credito.estatus || guardando} style={{ padding: "9px 16px", fontSize: 13, opacity: estatus === credito.estatus ? 0.5 : 1 }}>{guardando ? "Guardando…" : "Actualizar"}</button>
        </div>}

        {/* Revolvente: estado de cuenta */}
        {esRev && (() => {
          const limite = Number(credito.limite_linea ?? 0);
          const tasaAnual = Number(credito.tasa_anual);
          const hoyStr = new Date().toISOString().slice(0, 10);
          const estado = calcularEstadoLinea(movimientos as Movimiento[], tasaAnual, hoyStr);
          const disponible = Math.max(0, limite - estado.saldoDispuesto);

          // Compute running balance for the table
          let saldoAcum = 0;
          const movConSaldo = movimientos.map((m: any) => {
            saldoAcum += m.tipo === "disposicion" ? Number(m.monto) : -Number(m.monto);
            return { ...m, saldoResultante: Math.max(0, Math.round(saldoAcum * 100) / 100) };
          });

          async function registrarMovimiento() {
            setMovError(null);
            const montoMov = Number(movForm.monto) || 0;
            if (montoMov <= 0) { setMovError("Ingresa un monto mayor a 0."); return; }
            if (movForm.tipo === "disposicion" && montoMov > disponible) { setMovError(`Monto excede disponible (${mxn(disponible)}).`); return; }
            if (movForm.tipo === "pago" && montoMov > estado.saldoDispuesto) { setMovError(`Monto excede saldo dispuesto (${mxn(estado.saldoDispuesto)}).`); return; }

            setMovGuardando(true);
            const supabase = createClient();
            const { data: userData } = await supabase.auth.getUser();
            const operador = userData.user?.email ?? "sistema";

            const { error: errMov } = await supabase.from("movimientos_linea").insert({ credito_id: credito.id, fecha: movForm.fecha, tipo: movForm.tipo, monto: montoMov, nota: movForm.nota || null });
            if (errMov) { setMovGuardando(false); setMovError("Error: " + errMov.message); return; }

            await supabase.from("bitacora").insert({ entidad: "credito", entidad_id: credito.id, accion: movForm.tipo === "disposicion" ? "disposicion_revolvente" : "pago_revolvente", detalle: { monto: montoMov, fecha: movForm.fecha }, usuario: operador });

            setMovForm({ tipo: "disposicion", monto: "", fecha: new Date().toISOString().slice(0, 10), nota: "" });
            setMovGuardando(false);
            cargar();
            onChanged();
          }

          return (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
                <Dato label="Límite" valor={mxn(limite)} />
                <Dato label="Saldo dispuesto" valor={mxn(estado.saldoDispuesto)} />
                <Dato label="Disponible" valor={mxn(disponible)} />
                <Dato label="Interés devengado" valor={mxn(estado.interesDevengado)} />
                <Dato label="Tasa" valor={tasaLabel(credito)} />
              </div>

              {/* Register movement (admin only) */}
              {!readOnly && (
                <div className="panel" style={{ padding: "16px 18px", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Registrar movimiento</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                    <div className="field"><label>Tipo</label><select className="select" value={movForm.tipo} onChange={(e) => setMovForm(f => ({ ...f, tipo: e.target.value as "disposicion" | "pago" }))} style={{ minWidth: 120 }}><option value="disposicion">Disposición</option><option value="pago">Pago</option></select></div>
                    <div className="field"><label>Monto *</label><input className="input mono" type="number" value={movForm.monto} onChange={(e) => setMovForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" /></div>
                    <div className="field"><label>Fecha</label><input className="input mono" type="date" value={movForm.fecha} onChange={(e) => setMovForm(f => ({ ...f, fecha: e.target.value }))} /></div>
                    <div className="field"><label>Nota</label><input className="input" value={movForm.nota} onChange={(e) => setMovForm(f => ({ ...f, nota: e.target.value }))} placeholder="Opcional" /></div>
                    <button className="btn btn-primary" onClick={registrarMovimiento} disabled={movGuardando} style={{ padding: "9px 16px", fontSize: 13 }}>{movGuardando ? "…" : "Registrar"}</button>
                  </div>
                  {movError && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "8px 12px", borderRadius: 6, fontSize: 12.5, marginTop: 8 }}>{movError}</div>}
                </div>
              )}

              {/* Movements table */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 16 : 24 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Estado de cuenta</h3>
                  <div className="panel" style={{ overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
                    <table className="table" style={{ fontSize: 12.5 }}>
                      <thead><tr><th>Fecha</th><th>Tipo</th><th style={{ textAlign: "right" }}>Monto</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
                      <tbody>
                        {movConSaldo.length === 0 ? (
                          <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>Sin movimientos</td></tr>
                        ) : movConSaldo.map((m: any, i: number) => (
                          <tr key={m.id ?? i}>
                            <td>{fecha(m.fecha)}</td>
                            <td><span className="badge" style={{ background: m.tipo === "disposicion" ? "#e0f2fe" : "#e8f3ed", color: m.tipo === "disposicion" ? "#0284c7" : "var(--green)", fontSize: 11 }}>{m.tipo === "disposicion" ? "Disposición" : "Pago"}</span></td>
                            <td className="mono" style={{ textAlign: "right", color: m.tipo === "pago" ? "var(--green)" : "inherit" }}>{m.tipo === "pago" ? "- " : ""}{mxn(Number(m.monto))}</td>
                            <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(m.saldoResultante)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <TrazabilidadPanel bitacora={bitacora} />
              </div>
            </>
          );
        })()}

        {/* Non-revolvente: amortization + trazabilidad */}
        {!esRev && (() => {
          const esVariable = credito.tipo_tasa === "variable";
          const spreadDec = Number(credito.spread_pp ?? 0);
          return (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 16 : 24 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628" }}>{credito.tipo_producto === "factoraje" ? "Cupón de liquidación" : "Tabla de amortización"}</h3>
              {esVariable && !readOnly && (
                <button className="btn btn-ghost" onClick={() => setMostrarRevisarTasas(true)} style={{ fontSize: 12, padding: "6px 12px", color: "var(--amber)" }}>Revisar tasas</button>
              )}
            </div>
            <div className="panel" style={{ overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
              <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead><tr><th>#</th><th>Fecha</th>{esVariable && <><th style={{ textAlign: "right" }}>TIIE %</th><th style={{ textAlign: "right" }}>Tasa %</th></>}<th style={{ textAlign: "right" }}>Pago</th><th style={{ textAlign: "right" }}>Saldo</th>{!readOnly && <th></th>}</tr></thead>
                <tbody>{amort.map((c: any) => {
                  const vencido = !c.pagado && c.fecha_pago < hoy;
                  return (
                    <tr key={c.id} style={{ opacity: c.pagado ? 0.55 : 1 }}>
                      <td className="mono">{c.numero_cupon}</td>
                      <td style={{ color: vencido ? "var(--red)" : "inherit" }}>{fecha(c.fecha_pago)}</td>
                      {esVariable && <>
                        <td className="mono" style={{ textAlign: "right", fontSize: 11.5, color: "var(--text-dim)" }}>{c.valor_referencia != null ? (Number(c.valor_referencia) * 100).toFixed(2) : "—"}</td>
                        <td className="mono" style={{ textAlign: "right", fontSize: 11.5 }}>{c.tasa_aplicada != null ? (Number(c.tasa_aplicada) * 100).toFixed(2) : "—"}</td>
                      </>}
                      <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.pago_total))}</td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(Number(c.saldo_final))}</td>
                      {!readOnly && <td style={{ textAlign: "right" }}><button onClick={() => marcarPagado(c.id, !c.pagado)} className="btn btn-ghost" style={{ padding: "4px 9px", fontSize: 11 }}>{c.pagado ? "✓ Pagado" : "Marcar"}</button></td>}
                    </tr>
                  );
                })}</tbody>
              </table>
              </div>
            </div>
          </div>
          {/* NPV — for active non-revolvente credits with amortization */}
          {!esRev && amort.length > 0 && ["vigente", "en_mora"].includes(credito.estatus) && (
            <NpvPanel amort={amort} tasaCredito={Number(credito.tasa_anual) || 0} />
          )}
          <TrazabilidadPanel bitacora={bitacora} />
        </div>);
        })()}
      </div>
    </Overlay>
    {mostrarConfirmElim && <ModalConfirmarEliminacion credito={credito} onClose={() => setMostrarConfirmElim(false)} onDeleted={onDeleted} />}
    {mostrarRevisarTasas && <ModalRevisarTasas credito={credito} amort={amort} isMobile={isMobile} onClose={() => setMostrarRevisarTasas(false)} onSaved={() => { setMostrarRevisarTasas(false); cargar(); onChanged(); }} />}
    {mostrarReestructura && <ModalReestructura credito={credito} amort={amort} isMobile={isMobile} onClose={() => setMostrarReestructura(false)} onDone={() => { setMostrarReestructura(false); onClose(); onChanged(); }} />}
    </>
  );
}

// =====================================================================
// MODAL: Reestructura
// =====================================================================
function ModalReestructura({ credito, amort, isMobile, onClose, onDone }: { credito: Credito; amort: any[]; isMobile?: boolean; onClose: () => void; onDone: () => void }) {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const [fechaReest, setFechaReest] = useState(hoyStr);
  const [capitalizar, setCapitalizar] = useState(false);
  const [form, setForm] = useState({
    tipo_tasa: credito.tipo_tasa as "fija" | "variable",
    tasa_anual: ((Number(credito.tasa_anual) || 0) * 100).toFixed(2),
    tasa_referencia: credito.tasa_referencia ?? "TIIE_28",
    valor_referencia: credito.valor_referencia != null ? (Number(credito.valor_referencia) * 100).toFixed(2) : "",
    spread_pp: credito.spread_pp != null ? (Number(credito.spread_pp) * 100).toFixed(2) : "",
    plazo_meses: "",
    frecuencia: (credito.frecuencia || "mensual") as Frecuencia,
    metodo_amort: (credito.metodo_amort || "frances") as MetodoAmort,
    tipo_garantia: credito.tipo_garantia || "quirografaria",
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Calculate saldo at restructure date
  const cuponesOrdenados = [...amort].sort((a: any, b: any) => a.numero_cupon - b.numero_cupon);
  let saldoBase = 0;
  const primerCuponFuturo = cuponesOrdenados.find((c: any) => c.fecha_pago >= fechaReest);
  if (primerCuponFuturo) {
    saldoBase = Number(primerCuponFuturo.saldo_inicial);
  } else if (cuponesOrdenados.length > 0) {
    saldoBase = Number(cuponesOrdenados[cuponesOrdenados.length - 1].saldo_final);
  }

  // Capitalize overdue unpaid interest
  let interesesVencidos = 0;
  if (capitalizar) {
    cuponesOrdenados.forEach((c: any) => {
      if (c.fecha_pago < fechaReest && !c.pagado) {
        interesesVencidos += Number(c.interes);
      }
    });
  }
  interesesVencidos = Math.round(interesesVencidos * 100) / 100;
  const saldoTotal = Math.round((saldoBase + interesesVencidos) * 100) / 100;

  // Preview
  const tasaEfectiva = form.tipo_tasa === "variable"
    ? (Number(form.valor_referencia) || 0) + (Number(form.spread_pp) || 0)
    : Number(form.tasa_anual) || 0;

  let preview: ReturnType<typeof generarTablaAmortizacion> = [];
  let previewErr: string | null = null;
  if (saldoTotal > 0 && tasaEfectiva > 0 && Number(form.plazo_meses) > 0) {
    try {
      preview = generarTablaAmortizacion({
        monto: saldoTotal,
        tasaAnual: tasaEfectiva / 100,
        plazoMeses: Number(form.plazo_meses),
        frecuencia: form.frecuencia,
        metodo: form.metodo_amort,
        fechaOrigen: fechaReest,
      });
    } catch (e: any) { previewErr = e.message; }
  }

  async function confirmar() {
    setError(null);
    if (saldoTotal <= 0) { setError("No hay saldo para reestructurar."); return; }
    if (tasaEfectiva <= 0) { setError("La tasa debe ser mayor a 0."); return; }
    if (!form.plazo_meses || Number(form.plazo_meses) <= 0) { setError("Ingresa el nuevo plazo."); return; }

    const input: InputOperacion = {
      tipo_producto: credito.tipo_producto,
      folio: credito.folio + "-R",
      acreditado: credito.acreditado,
      rfc: credito.rfc ?? undefined,
      fecha_origen: fechaReest,
      monto: saldoTotal,
      tipo_tasa: form.tipo_tasa,
      tasa_anual_pct: form.tipo_tasa === "fija" ? Number(form.tasa_anual) : 0,
      tasa_referencia: form.tipo_tasa === "variable" ? form.tasa_referencia : undefined,
      valor_referencia_pct: form.tipo_tasa === "variable" ? Number(form.valor_referencia) : 0,
      spread_pp: form.tipo_tasa === "variable" ? Number(form.spread_pp) : 0,
      plazo_meses: Number(form.plazo_meses),
      frecuencia: form.frecuencia,
      metodo_amort: form.metodo_amort,
      tipo_garantia: form.tipo_garantia,
      periodo_gracia_meses: 0,
      tipo_gracia: "ninguna",
      tipo_disposicion: "unica",
    };

    let resultado: ResultadoOperacion;
    try { resultado = construirOperacion(input); } catch (e: any) { setError(e.message); return; }

    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    // Set credito_origen_id on the new credit
    resultado.creditoRow.credito_origen_id = credito.id;

    const { data: nuevo, error: errIns } = await supabase.from("creditos").insert(resultado.creditoRow).select().single();
    if (errIns || !nuevo) { setGuardando(false); setError("Error al crear crédito: " + (errIns?.message ?? "")); return; }

    // Disposición
    await supabase.from("disposiciones").insert({ credito_id: nuevo.id, numero: 1, monto: saldoTotal, fecha: fechaReest });

    // Amortización
    if (resultado.cupones.length > 0) {
      await supabase.from("amortizacion").insert(resultado.cupones.map((c) => ({
        credito_id: nuevo.id, numero_cupon: c.numero_cupon, fecha_pago: c.fecha_pago,
        saldo_inicial: c.saldo_inicial, capital: c.capital, interes: c.interes,
        pago_total: c.pago_total, saldo_final: c.saldo_final,
        ...(c.valor_referencia != null ? { valor_referencia: c.valor_referencia } : {}),
        ...(c.tasa_aplicada != null ? { tasa_aplicada: c.tasa_aplicada } : {}),
      })));
    }

    // Update old credit
    await supabase.from("creditos").update({ estatus: "reestructurado" }).eq("id", credito.id);

    // Bitácora
    await supabase.from("bitacora").insert([
      { entidad: "credito", entidad_id: credito.id, accion: "reestructurado", detalle: { nuevo_folio: resultado.creditoRow.folio, saldo: saldoTotal, intereses_capitalizados: interesesVencidos }, usuario: operador },
      { entidad: "credito", entidad_id: nuevo.id, accion: "creado", detalle: { origen: "reestructura", folio_origen: credito.folio, monto: saldoTotal }, usuario: operador },
    ]);

    setGuardando(false);
    onDone();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 200, padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 720, padding: isMobile ? "20px 16px" : "28px 28px", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0a1628", marginBottom: 4 }}>Reestructurar crédito</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
          Se creará un crédito nuevo con el saldo insoluto y los términos que definas. El crédito original quedará en estatus "Reestructurado".
        </p>

        {/* Saldo */}
        <div style={{ background: "var(--amber-soft)", padding: "14px 18px", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 10 }}>
            <div className="field"><label>Fecha de reestructura</label><input className="input mono" type="date" value={fechaReest} onChange={(e) => setFechaReest(e.target.value)} /></div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Saldo a reestructurar</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)", marginTop: 2 }}>{mxn(saldoTotal)}</div>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={capitalizar} onChange={(e) => setCapitalizar(e.target.checked)} />
            Capitalizar intereses vencidos no pagados {capitalizar && interesesVencidos > 0 && <span className="mono" style={{ color: "var(--text-dim)" }}>+{mxn(interesesVencidos)}</span>}
          </label>
        </div>

        {/* Nuevos términos */}
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>Nuevo plazo (meses) *</label><input className="input mono" type="number" value={form.plazo_meses} onChange={(e) => set("plazo_meses", e.target.value)} placeholder="12" /></div>
            <div className="field"><label>Frecuencia</label><select className="select" value={form.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option><option value="semanal">Semanal</option></select></div>
          </div>

          <div className="field">
            <label>Tipo de tasa</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["fija", "variable"] as const).map((t) => (
                <button key={t} onClick={() => set("tipo_tasa", t)} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontFamily: "inherit", fontWeight: form.tipo_tasa === t ? 600 : 400, border: form.tipo_tasa === t ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: form.tipo_tasa === t ? "var(--amber-soft)" : "transparent", color: form.tipo_tasa === t ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
                  {t === "fija" ? "Fija" : "Variable"}
                </button>
              ))}
            </div>
          </div>
          {form.tipo_tasa === "fija" ? (
            <div className="field"><label>Tasa anual (%) *</label><input className="input mono" type="number" value={form.tasa_anual} onChange={(e) => set("tasa_anual", e.target.value)} placeholder="24" /></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div className="field"><label>Referencia</label><select className="select" value={form.tasa_referencia} onChange={(e) => set("tasa_referencia", e.target.value)}><option value="TIIE_28">TIIE 28d</option><option value="TIIE_FONDEO">TIIE Fondeo</option><option value="TIIE_91">TIIE 91d</option><option value="TIIE_182">TIIE 182d</option></select></div>
              <div className="field"><label>Valor ref (%)</label><input className="input mono" type="number" value={form.valor_referencia} onChange={(e) => set("valor_referencia", e.target.value)} placeholder="10.50" /></div>
              <div className="field"><label>Spread (pp)</label><input className="input mono" type="number" value={form.spread_pp} onChange={(e) => set("spread_pp", e.target.value)} placeholder="4.50" /></div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>Método</label><select className="select" value={form.metodo_amort} onChange={(e) => set("metodo_amort", e.target.value)}><option value="frances">Francés</option><option value="lineal">Lineal</option><option value="bullet">Bullet</option></select></div>
            <div className="field"><label>Garantía</label><select className="select" value={form.tipo_garantia} onChange={(e) => set("tipo_garantia", e.target.value)}><option value="quirografaria">Quirografaria</option><option value="fideicomiso_flujo">Fideicomiso</option><option value="derecho_cobro">Der. cobro</option><option value="bien_arrendado">Bien arrendado</option></select></div>
          </div>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ background: "#f4f6f8", borderRadius: 8, padding: "14px 16px", marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{preview.length} cupones · primer pago {mxn(preview[0].pago_total)}</div>
            <table className="table" style={{ fontSize: 11.5 }}>
              <thead><tr><th>#</th><th>Fecha</th><th style={{ textAlign: "right" }}>Pago</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
              <tbody>{preview.map((c) => (
                <tr key={c.numero_cupon}><td className="mono">{c.numero_cupon}</td><td>{fecha(c.fecha_pago)}</td><td className="mono" style={{ textAlign: "right" }}>{mxn(c.pago_total)}</td><td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(c.saldo_final)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {previewErr && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{previewErr}</div>}

        {error && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={guardando || saldoTotal <= 0}>{guardando ? "Reestructurando…" : "Confirmar reestructura"}</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MODAL: Revisar tasas (variable)
// =====================================================================
function ModalRevisarTasas({ credito, amort, isMobile, onClose, onSaved }: { credito: Credito; amort: any[]; isMobile?: boolean; onClose: () => void; onSaved: () => void }) {
  const spreadDec = Number(credito.spread_pp ?? 0); // decimal e.g. 0.045
  const ppa = ({ mensual: 12, quincenal: 24, semanal: 52 } as Record<string, number>)[credito.frecuencia] ?? 12;

  // State: editable TIIE% for each period (as percentage string, e.g. "10.50")
  const [tasas, setTasas] = useState<string[]>(() =>
    amort.map((c: any) => c.valor_referencia != null ? (Number(c.valor_referencia) * 100).toFixed(2) : ((Number(credito.tasa_anual) - spreadDec) * 100).toFixed(2))
  );
  const [desdeIdx, setDesdeIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function aplicarDesde(idx: number, valor: string) {
    const nueva = [...tasas];
    for (let i = idx; i < nueva.length; i++) nueva[i] = valor;
    setTasas(nueva);
    setDesdeIdx(idx);
  }

  async function guardar() {
    setError(null);
    // Validate
    for (let i = 0; i < tasas.length; i++) {
      const v = Number(tasas[i]);
      if (isNaN(v) || v < 0) { setError(`Periodo ${i + 1}: TIIE inválida.`); return; }
    }

    // Build tasasAnualesPorPeriodo (TIIE% + spread in decimal) for the motor
    const tasasAnuales = tasas.map(t => (Number(t) / 100) + spreadDec);

    // Use the motor to regenerate the full schedule
    const esArr = credito.tipo_producto === "arrendamiento_financiero" || credito.tipo_producto === "arrendamiento_puro";
    const graciaNum = Number(credito.periodo_gracia_meses) || 0;
    const freq = (credito.frecuencia || "mensual") as Frecuencia;
    const metodo = (credito.metodo_amort || "frances") as MetodoAmort;
    const vrNum = esArr ? Number(credito.valor_residual ?? 0) : 0;

    let nuevos: import("@/lib/amortizacion").Cupon[];
    try {
      nuevos = generarTablaAmortizacion({
        monto: Number(credito.monto),
        tasaAnual: tasasAnuales[0], // fallback
        plazoMeses: Number(credito.plazo_meses),
        frecuencia: freq,
        metodo,
        fechaOrigen: credito.fecha_origen,
        graciaPeridos: graciaNum > 0 ? calcularGraciaPeridos(graciaNum, freq) : 0,
        tipoGracia: graciaNum > 0 ? (credito.tipo_gracia as TipoGracia) : "ninguna",
        valorResidual: vrNum,
        tasasAnualesPorPeriodo: tasasAnuales,
      });
    } catch (e: any) {
      setError("Error al recalcular: " + e.message);
      return;
    }

    // Stamp valor_referencia and tasa_aplicada on each new cupon
    for (let i = 0; i < nuevos.length; i++) {
      nuevos[i].valor_referencia = Number(tasas[i] ?? tasas[tasas.length - 1]) / 100;
      nuevos[i].tasa_aplicada = (Number(tasas[i] ?? tasas[tasas.length - 1]) / 100) + spreadDec;
    }

    // Match new cupones to existing amort rows by numero_cupon
    setGuardando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    let updated = 0;
    for (const nc of nuevos) {
      const existing = amort.find((a: any) => a.numero_cupon === nc.numero_cupon);
      if (!existing) continue;
      const { error: errUpd } = await supabase.from("amortizacion").update({
        saldo_inicial: nc.saldo_inicial, capital: nc.capital, interes: nc.interes,
        pago_total: nc.pago_total, saldo_final: nc.saldo_final,
        valor_referencia: nc.valor_referencia, tasa_aplicada: nc.tasa_aplicada,
      }).eq("id", existing.id);
      if (!errUpd) updated++;
    }

    await supabase.from("bitacora").insert({
      entidad: "credito", entidad_id: credito.id, accion: "revision_tasa",
      detalle: { cupones_actualizados: updated, desde_periodo: (desdeIdx ?? 0) + 1 },
      usuario: operador,
    });

    setGuardando(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 200, padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 620, padding: isMobile ? "20px 16px" : "28px 28px", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0a1628", marginBottom: 4 }}>Revisar tasas</h3>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
          Edita la TIIE de un periodo. Usa "Aplicar desde aquí" para cambiar ese periodo y todos los siguientes. Spread: <strong className="mono">{(spreadDec * 100).toFixed(2)}pp</strong>
        </p>

        <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 16 }}>
          <table className="table" style={{ fontSize: 12.5 }}>
            <thead><tr><th>#</th><th>Fecha</th><th style={{ textAlign: "right" }}>TIIE %</th><th style={{ textAlign: "right" }}>Tasa %</th><th></th></tr></thead>
            <tbody>
              {amort.map((c: any, i: number) => {
                const tiieVal = Number(tasas[i] ?? 0);
                const tasaApl = tiieVal + (spreadDec * 100);
                return (
                  <tr key={c.id}>
                    <td className="mono">{c.numero_cupon}</td>
                    <td style={{ fontSize: 11.5 }}>{fecha(c.fecha_pago)}</td>
                    <td style={{ textAlign: "right" }}>
                      <input className="input mono" type="number" step="0.01" value={tasas[i]} onChange={(e) => { const n = [...tasas]; n[i] = e.target.value; setTasas(n); }} style={{ width: 80, padding: "4px 6px", fontSize: 12, textAlign: "right" }} />
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontSize: 11.5, color: "var(--text-dim)" }}>{tasaApl.toFixed(2)}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => aplicarDesde(i, tasas[i])} style={{ padding: "3px 8px", fontSize: 10.5, whiteSpace: "nowrap" }}>Desde aquí ↓</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? "Recalculando…" : "Guardar y recalcular"}</button>
        </div>
      </div>
    </div>
  );
}

function TrazabilidadPanel({ bitacora }: { bitacora: any[] }) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Trazabilidad</h3>
      <div className="panel" style={{ padding: "8px 0", maxHeight: 420, overflowY: "auto" }}>
        {bitacora.length === 0 ? <p style={{ padding: 20, color: "var(--text-faint)", fontSize: 13 }}>Sin movimientos.</p> : bitacora.map((b) => (
          <div key={b.id} style={{ padding: "11px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{accionLabel(b.accion)}</div>
            {b.detalle?.de && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{labelEstatus[b.detalle.de]} → {labelEstatus[b.detalle.a]}</div>}
            {b.detalle?.monto && !b.detalle?.de && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{mxn(Number(b.detalle.monto))}</div>}
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>{new Date(b.created_at).toLocaleString("es-MX")} · {b.usuario}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function accionLabel(a: string) {
  return ({ creado: "Crédito originado", cambio_estatus: "Cambio de estatus", pago_registrado: "Pago registrado", pago_revertido: "Pago revertido", credito_eliminado: "Crédito eliminado", disposicion_revolvente: "Disposición", pago_revolvente: "Pago de capital" } as Record<string, string>)[a] ?? a;
}

function ModalConfirmarEliminacion({ credito, onClose, onDeleted }: { credito: Credito; onClose: () => void; onDeleted: (folio: string) => void }) {
  const [folioInput, setFolioInput] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const ok = folioInput.trim() === credito.folio && motivo.trim().length >= 10 && !eliminando;

  async function confirmar() {
    setError(null); setEliminando(true);
    try {
      const res = await fetch("/api/creditos/eliminar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credito_id: credito.id, motivo: motivo.trim() }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); setEliminando(false); return; }
      onDeleted(credito.folio);
    } catch { setError("Error de conexión"); setEliminando(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 200, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 500, padding: "32px 28px" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "#0a1628", marginBottom: 16 }}>Eliminar crédito {credito.folio}</h3>
        <div style={{ background: "var(--red-soft)", border: "1px solid rgba(181,72,72,0.2)", borderRadius: 8, padding: "14px 16px", marginBottom: 20, fontSize: 13, lineHeight: 1.55, color: "var(--red)" }}>Esta acción es irreversible. Se eliminarán el crédito y su tabla de amortización. La bitácora se conserva.</div>
        <div className="field" style={{ marginBottom: 16 }}><label style={{ fontSize: 12 }}>Escribe el folio: <strong className="mono">{credito.folio}</strong></label><input className="input mono" value={folioInput} onChange={(e) => setFolioInput(e.target.value)} style={{ borderColor: folioInput && folioInput.trim() !== credito.folio ? "var(--red)" : undefined }} /></div>
        <div className="field" style={{ marginBottom: 16 }}><label style={{ fontSize: 12 }}>Motivo (min 10 caracteres)</label><textarea className="textarea" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        {error && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-danger" onClick={confirmar} disabled={!ok} style={{ opacity: ok ? 1 : 0.45 }}>{eliminando ? "Eliminando…" : "Eliminar definitivamente"}</button></div>
      </div>
    </div>
  );
}


function NpvPanel({ amort, tasaCredito }: { amort: any[]; tasaCredito: number }) {
  const [tasaDesc, setTasaDesc] = useState(((tasaCredito || 0.24) * 100).toFixed(2));
  const hoy = new Date().toISOString().slice(0, 10);

  const cupones: CuponSchedule[] = amort.map((a: any) => ({
    numero: a.numero_cupon,
    fecha: a.fecha_pago,
    saldoInicial: Number(a.saldo_inicial),
    capital: Number(a.capital),
    interes: Number(a.interes),
    iva: 0,
    pagoTotal: Number(a.pago_total),
    saldoFinal: Number(a.saldo_final),
    tasaAplicada: Number(a.tasa_aplicada ?? tasaCredito),
    tiieReferencia: a.valor_referencia != null ? Number(a.valor_referencia) : null,
    diasPeriodo: 30,
  }));

  const tasa = (Number(tasaDesc) || 0) / 100;
  const npvVal = calcularNPV(cupones, tasa, hoy);
  // Saldo insoluto = first unpaid coupon's saldo_inicial
  const unpaid = amort.filter((a: any) => !a.pagado).sort((a: any, b: any) => a.numero_cupon - b.numero_cupon);
  const saldo = unpaid.length > 0 ? Number(unpaid[0].saldo_inicial) : 0;
  const diff = npvVal - saldo;

  return (
    <div className="panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Valor Presente Neto (flujos restantes)</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Tasa de descuento (%)</span>
        <input className="input mono" type="number" step="0.01" value={tasaDesc} onChange={(e) => setTasaDesc(e.target.value)} style={{ width: 100, padding: "5px 8px", fontSize: 13 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div><div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>NPV</div><div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{mxn(npvVal)}</div></div>
        <div><div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>Saldo insoluto</div><div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{mxn(saldo)}</div></div>
        <div><div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>{diff >= 0 ? "Premio" : "Descuento"}</div><div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: diff >= 0 ? "var(--green)" : "var(--red)" }}>{diff >= 0 ? "+" : ""}{mxn(diff)}</div></div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
        A la tasa del crédito, NPV ≈ saldo insoluto. A tasa de mercado distinta refleja premio/descuento.
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (<div><div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div><div className="mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{valor}</div></div>);
}

function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.4)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: "24px max(8px, env(safe-area-inset-left))", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: wide ? 940 : 760, boxShadow: "var(--shadow-md)", overflow: "hidden", maxHeight: "95vh", overflowY: "auto" }}>{children}</div>
    </div>
  );
}
