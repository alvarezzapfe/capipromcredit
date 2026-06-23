"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn } from "@/lib/format";
import {
  FRECUENCIA_WIZARD_LABEL,
  ESQUEMA_LABEL,
  CONVENCION_LABEL,
  GRACIA_WIZARD_LABEL,
} from "@/lib/format";
import {
  generarSchedule,
  calcularCAT,
  calcularTIR,
  calcularDuracion,
  calcularNPV,
  saldoInsolutoCupones,
  type ParamsSchedule,
  type ResultadoSchedule,
  type RateCatalogRow,
  type FrecuenciaWizard,
  type EsquemaPreset,
  type TipoGraciaWizard,
  type ConvencionDias,
  type BaseCalendario,
  type InteresBase,
  type SupuestoForward,
} from "@/lib/credit-engine";
import { rateLabel, fmtPct } from "@/lib/credit-engine/rate-label";
import { ConfirmModal } from "@/components/ConfirmModal";

// ── Props ─────────────────────────────────────────────

interface Props {
  credito: any; // Credito from cartera page
  onActivated: () => void;
  isMobile?: boolean;
}

// ── Helpers ───────────────────────────────────────────

function addMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, maxDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

const FRECUENCIAS = Object.keys(FRECUENCIA_WIZARD_LABEL) as FrecuenciaWizard[];
const ESQUEMAS = Object.keys(ESQUEMA_LABEL) as EsquemaPreset[];
const CONVENCIONES = Object.keys(CONVENCION_LABEL) as ConvencionDias[];
const GRACIAS = Object.keys(GRACIA_WIZARD_LABEL) as TipoGraciaWizard[];

// ── Component ─────────────────────────────────────────

export function WizardActivar({ credito, onActivated, isMobile }: Props) {
  const c = credito;

  // ── Form state (pre-filled from borrador) ──
  const [tipoTasa, setTipoTasa] = useState<"fija" | "variable">(c.rate_type ? "variable" : "fija");
  const [rateType, setRateType] = useState(c.rate_type ?? "TIIE_28");
  const [spreadPct, setSpreadPct] = useState(c.spread != null ? (Number(c.spread) * 100).toString() : "");
  const [fixedRatePct, setFixedRatePct] = useState(c.fixed_rate != null ? (Number(c.fixed_rate) * 100).toString() : "");
  const [convencion, setConvencion] = useState<ConvencionDias>((c.convencion_dias as ConvencionDias) || "ACT/360");
  const [frecRevision, setFrecRevision] = useState(c.frecuencia_revision?.toString() ?? "");

  const [esquema, setEsquema] = useState<EsquemaPreset>((c.esquema as EsquemaPreset) || "frances");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaWizard>(
    FRECUENCIAS.includes(c.frecuencia) ? c.frecuencia : "mensual",
  );
  const [plazo, setPlazo] = useState(String(c.plazo_meses ?? 12));
  const [crecimiento, setCrecimiento] = useState("5");

  const [graciaMeses, setGraciaMeses] = useState(String(c.periodo_gracia_meses ?? 0));
  const [tipoGracia, setTipoGracia] = useState<TipoGraciaWizard>("solo_interes");

  const [fechaDisp, setFechaDisp] = useState(c.fecha_origen ?? new Date().toISOString().slice(0, 10));
  const [fechaPrimer, setFechaPrimer] = useState(c.fecha_primer_pago ?? addMeses(c.fecha_origen ?? new Date().toISOString().slice(0, 10), 1));

  const [comisionModo, setComisionModo] = useState<"monto" | "pct">("monto");
  const [comisionVal, setComisionVal] = useState(c.comision_apertura?.toString() ?? "0");
  const [comisionPctVal, setComisionPctVal] = useState(c.comision_apertura_pct ? (Number(c.comision_apertura_pct) * 100).toString() : "2");
  const [comisionIva, setComisionIva] = useState<boolean>(c.comision_iva ?? true);
  const [ivaIntereses, setIvaIntereses] = useState<boolean>(c.iva_intereses ?? false);
  const [modalidadInteres, setModalidadInteres] = useState<"vencido" | "anticipado">(c.modalidad_interes ?? "vencido");
  const [baseCalendario, setBaseCalendario] = useState<"aniversario" | "fin_de_mes">(c.base_calendario ?? "aniversario");
  const [numPagosCapital, setNumPagosCapital] = useState(c.num_pagos_capital?.toString() ?? "");
  const [supuestoForward, setSupuestoForward] = useState(c.supuesto_forward ?? "ultima_conocida");
  const [interesBase, setInteresBase] = useState<"apertura" | "cierre">(c.interes_base ?? "apertura");

  const [saldoOverride, setSaldoOverride] = useState(c.saldo_override?.toString() ?? "");

  const [catalog, setCatalog] = useState<RateCatalogRow[]>([]);
  const [activando, setActivando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch rate catalog
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data } = await sb.from("rate_catalog").select("rate_type, rate_date, rate_value").order("rate_date", { ascending: false });
      setCatalog((data ?? []) as RateCatalogRow[]);
    })();
  }, []);

  // ── Derived values ──
  const monto = Number(c.monto) || 0;
  const plazoNum = Number(plazo) || 0;
  const graciaNum = Number(graciaMeses) || 0;
  const comisionMonto = comisionModo === "pct"
    ? Math.round(monto * (Number(comisionPctVal) || 0) / 100 * 100) / 100
    : Number(comisionVal) || 0;

  // ── Build schedule params ──
  const params: ParamsSchedule | null = useMemo(() => {
    try {
      if (monto <= 0 || plazoNum <= 0) return null;
      if (tipoTasa === "fija" && !(Number(fixedRatePct) > 0)) return null;
      if (tipoTasa === "variable" && !(Number(spreadPct) >= 0)) return null;
      if (fechaDisp >= fechaPrimer) return null;

      return {
        monto,
        fechaDisposicion: fechaDisp,
        fechaPrimerPago: fechaPrimer,
        plazoMeses: plazoNum,
        frecuencia,
        esquema,
        rateType: tipoTasa === "variable" ? rateType : null,
        spread: tipoTasa === "variable" ? (Number(spreadPct) || 0) / 100 : null,
        fixedRate: tipoTasa === "fija" ? (Number(fixedRatePct) || 0) / 100 : null,
        convencionDias: convencion,
        frecuenciaRevision: tipoTasa === "variable" && frecRevision ? Number(frecRevision) : null,
        graciaMeses: graciaNum,
        tipoGracia,
        crecimientoPct: esquema === "creciente" ? Number(crecimiento) || 5 : undefined,
        comisionApertura: comisionMonto,
        comisionIva,
        ivaIntereses,
        modalidadInteres,
        baseCalendario,
        numPagosCapital: numPagosCapital ? Number(numPagosCapital) : null,
        supuestoForward: supuestoForward === "cero" ? "cero" : supuestoForward === "ultima_conocida" ? "ultima_conocida" : Number(supuestoForward) || "ultima_conocida",
        interesBase,
      };
    } catch { return null; }
  }, [monto, plazoNum, tipoTasa, fixedRatePct, spreadPct, rateType, frecRevision,
      convencion, frecuencia, esquema, fechaDisp, fechaPrimer, graciaNum, tipoGracia,
      crecimiento, comisionMonto, comisionIva, ivaIntereses, modalidadInteres,
      baseCalendario, numPagosCapital, supuestoForward, interesBase]);

  // ── Schedule + metrics (debounced) ──
  const [schedule, setSchedule] = useState<ResultadoSchedule | null>(null);
  const [metrics, setMetrics] = useState<{ cat: number; catSinCom: number; tir: number; durMac: number; durMod: number; saldoInsoluto: number } | null>(null);
  const [schedError, setSchedError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!params) { setSchedule(null); setMetrics(null); setSchedError(null); return; }
      try {
        const filteredCatalog = params.rateType
          ? catalog.filter((r) => r.rate_type === params.rateType)
          : [];
        const r = generarSchedule(params, filteredCatalog);
        setSchedule(r);
        setSchedError(null);

        const cat = calcularCAT(r.cupones, monto, r.comisionAperturaConIva, params.fechaDisposicion, r.interesAnticipadoInicial);
        const catSinCom = calcularCAT(r.cupones, monto, 0, params.fechaDisposicion, r.interesAnticipadoInicial);
        const tir = calcularTIR(r.cupones, monto, params.fechaDisposicion, r.interesAnticipadoInicial);
        const dur = calcularDuracion(r.cupones, tir, params.fechaDisposicion);
        const hoy = new Date().toISOString().slice(0, 10);
        const saldoCalc = saldoInsolutoCupones(r.cupones, hoy, monto);
        const saldoFinal = saldoOverride && Number(saldoOverride) > 0 ? Number(saldoOverride) : saldoCalc;
        setMetrics({ cat, catSinCom, tir, durMac: dur.macaulay, durMod: dur.modificada, saldoInsoluto: saldoFinal });
      } catch (e: any) {
        setSchedule(null);
        setMetrics(null);
        setSchedError(e.message);
      }
    }, 200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [params, catalog, monto, saldoOverride]);

  // ── Validations ──
  const validaciones = useMemo(() => {
    const errs: string[] = [];
    if (monto <= 0) errs.push("Monto debe ser mayor a 0");
    if (plazoNum <= 0) errs.push("Plazo debe ser mayor a 0");
    if (tipoTasa === "fija" && !(Number(fixedRatePct) > 0)) errs.push("Tasa fija debe ser mayor a 0%");
    if (tipoTasa === "variable" && !rateType) errs.push("Selecciona tipo de referencia");
    if (tipoTasa === "variable" && !(Number(spreadPct) >= 0)) errs.push("Spread debe ser ≥ 0%");
    if (fechaDisp >= fechaPrimer) errs.push("Primer pago debe ser posterior a la disposición");
    if (graciaNum >= plazoNum) errs.push("Gracia debe ser menor al plazo");
    if (esquema === "int_capdif" && graciaNum === 0) errs.push("INT_CAPDIF requiere gracia > 0");
    if (schedule) {
      if (schedule.cupones[schedule.cupones.length - 1]?.saldoFinal !== 0) errs.push("Saldo final ≠ 0 (cuadre fallido)");
      if (schedule.cupones.some((c) => c.interes < 0)) errs.push("Hay cupones con interés negativo");
    }
    if (schedError) errs.push(schedError);
    return errs;
  }, [monto, plazoNum, tipoTasa, fixedRatePct, rateType, spreadPct, fechaDisp, fechaPrimer, graciaNum, esquema, schedule, schedError]);

  const puedeActivar = validaciones.length === 0 && schedule != null && metrics != null;

  const [showConfirmActivar, setShowConfirmActivar] = useState(false);

  // ── Activate ──
  async function activar() {
    if (!puedeActivar || !schedule || !metrics || !params) return;

    setActivando(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const operador = userData.user?.email ?? "sistema";

    try {
      const tasaEfectiva = tipoTasa === "variable"
        ? (schedule.cupones[0]?.tasaAplicada ?? 0)
        : (Number(fixedRatePct) || 0) / 100;

      // Update credito with all params
      const { error: updErr } = await supabase.from("creditos").update({
        estatus: "vigente",
        tasa_anual: tasaEfectiva,
        plazo_meses: plazoNum,
        frecuencia,
        metodo_amort: esquema === "int_capdif" ? "frances" : esquema,
        fecha_origen: fechaDisp,
        tipo_tasa: tipoTasa,
        rate_type: params.rateType,
        spread: params.spread,
        fixed_rate: params.fixedRate,
        day_count_base: convencion === "ACT/365" ? 365 : 360,
        esquema,
        convencion_dias: convencion,
        frecuencia_revision: params.frecuenciaRevision,
        fecha_primer_pago: fechaPrimer,
        comision_apertura: comisionMonto,
        comision_apertura_pct: comisionModo === "pct" ? (Number(comisionPctVal) || 0) / 100 : null,
        comision_iva: comisionIva,
        iva_intereses: ivaIntereses,
        modalidad_interes: modalidadInteres,
        base_calendario: baseCalendario,
        num_pagos_capital: numPagosCapital ? Number(numPagosCapital) : null,
        supuesto_forward: supuestoForward,
        interes_base: interesBase,
        cat: Math.round(metrics.cat * 10000) / 10000,
        tir: Math.round(metrics.tir * 10000) / 10000,
        saldo_override: saldoOverride && Number(saldoOverride) > 0 ? Number(saldoOverride) : null,
        periodo_gracia_meses: graciaNum,
        tipo_gracia: tipoGracia === "solo_interes" ? "capital" : tipoGracia === "capitaliza_interes" ? "total" : "ninguna",
      }).eq("id", c.id);

      if (updErr) throw new Error(updErr.message);

      // Insert amortizacion
      if (schedule.cupones.length > 0) {
        const { error: amErr } = await supabase.from("amortizacion").insert(
          schedule.cupones.map((cup) => ({
            credito_id: c.id,
            numero_cupon: cup.numero,
            fecha_pago: cup.fecha,
            saldo_inicial: cup.saldoInicial,
            capital: cup.capital,
            interes: cup.interes,
            pago_total: cup.pagoTotal,
            saldo_final: cup.saldoFinal,
            valor_referencia: cup.tiieReferencia,
            tasa_aplicada: cup.tasaAplicada,
          })),
        );
        if (amErr) throw new Error(amErr.message);
      }

      // Insert disposicion
      await supabase.from("disposiciones").insert({
        credito_id: c.id, numero: 1, monto, fecha: fechaDisp,
      });

      // Audit trail
      await supabase.from("bitacora").insert({
        entidad: "credito",
        entidad_id: c.id,
        accion: "activado",
        detalle: {
          de: "borrador", a: "vigente",
          esquema, convencion, frecuencia,
          tasa: tasaEfectiva, cat: metrics.cat, tir: metrics.tir,
          cupones: schedule.cupones.length,
          comision: comisionMonto,
        },
        usuario: operador,
      });

      setActivando(false);
      onActivated();
    } catch (e: any) {
      setActivando(false);
      setError("Error al activar: " + e.message);
    }
  }

  // ── Render ──
  const sec = (title: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)", marginBottom: 8, marginTop: 16, borderBottom: "1px solid var(--line-soft)", paddingBottom: 6 }}>{title}</div>
  );

  return (
    <div>
      {/* ── Banner ── */}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#92400e", marginBottom: 2 }}>Wizard de activación</div>
        <div style={{ fontSize: 13, color: "#a16207" }}>
          Configura los términos del crédito <strong className="mono">{c.folio}</strong> · {c.acreditado} · {mxn(monto)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* ── LEFT: Parameters ── */}
        <div>
          {/* Tasa */}
          {sec("Tasa")}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["fija", "variable"] as const).map((t) => (
              <button key={t} onClick={() => setTipoTasa(t)} style={{ flex: 1, padding: "7px 0", fontSize: 13, fontFamily: "inherit", fontWeight: tipoTasa === t ? 600 : 400, border: tipoTasa === t ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: tipoTasa === t ? "var(--amber-soft)" : "transparent", color: tipoTasa === t ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
                {t === "fija" ? "Fija" : "Variable"}
              </button>
            ))}
          </div>
          {tipoTasa === "fija" ? (
            <div className="field"><label>Tasa anual (%)</label><input className="input mono" type="number" step="0.01" value={fixedRatePct} onChange={(e) => setFixedRatePct(e.target.value)} placeholder="24" /></div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="field"><label>Referencia</label><select className="select" value={rateType} onChange={(e) => setRateType(e.target.value)}><option value="TIIE_28">TIIE 28d</option><option value="TIIE_FONDEO">TIIE Fondeo</option></select></div>
                <div className="field"><label>Spread (%)</label><input className="input mono" type="number" step="0.01" value={spreadPct} onChange={(e) => setSpreadPct(e.target.value)} placeholder="6" /></div>
              </div>
              <div className="field"><label>Revisión cada (meses)</label><input className="input mono" type="number" value={frecRevision} onChange={(e) => setFrecRevision(e.target.value)} placeholder="Cada cupón" /></div>
            </div>
          )}
          <div className="field" style={{ marginTop: 8 }}><label>Convención de días</label><select className="select" value={convencion} onChange={(e) => setConvencion(e.target.value as ConvencionDias)}>{CONVENCIONES.map((v) => <option key={v} value={v}>{CONVENCION_LABEL[v]}</option>)}</select></div>

          {/* Esquema y Frecuencia */}
          {sec("Esquema y frecuencia")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field"><label>Esquema</label><select className="select" value={esquema} onChange={(e) => setEsquema(e.target.value as EsquemaPreset)}>{ESQUEMAS.map((v) => <option key={v} value={v}>{ESQUEMA_LABEL[v]}</option>)}</select></div>
            <div className="field"><label>Frecuencia</label><select className="select" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaWizard)}>{FRECUENCIAS.map((v) => <option key={v} value={v}>{FRECUENCIA_WIZARD_LABEL[v]}</option>)}</select></div>
          </div>
          <div className="field" style={{ marginTop: 8 }}><label>Plazo (meses)</label><input className="input mono" type="number" value={plazo} onChange={(e) => setPlazo(e.target.value)} /></div>
          {esquema === "creciente" && (
            <div className="field" style={{ marginTop: 8 }}><label>Crecimiento por periodo (%)</label><input className="input mono" type="number" value={crecimiento} onChange={(e) => setCrecimiento(e.target.value)} placeholder="5" /></div>
          )}

          {/* Gracia */}
          {sec("Gracia")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field"><label>Meses</label><input className="input mono" type="number" value={graciaMeses} onChange={(e) => setGraciaMeses(e.target.value)} placeholder="0" /></div>
            <div className="field"><label>Tipo</label><select className="select" value={tipoGracia} onChange={(e) => setTipoGracia(e.target.value as TipoGraciaWizard)}>{GRACIAS.map((v) => <option key={v} value={v}>{GRACIA_WIZARD_LABEL[v]}</option>)}</select></div>
          </div>

          {/* Fechas */}
          {sec("Fechas")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field"><label>Disposición (origen)</label><input className="input mono" type="date" value={fechaDisp} onChange={(e) => { setFechaDisp(e.target.value); if (!c.fecha_primer_pago) setFechaPrimer(addMeses(e.target.value, 1)); }} /></div>
            <div className="field"><label>Primer pago</label><input className="input mono" type="date" value={fechaPrimer} onChange={(e) => setFechaPrimer(e.target.value)} /></div>
          </div>
          {metrics && metrics.saldoInsoluto < monto && metrics.saldoInsoluto > 0 && (
            <div style={{ fontSize: 12, color: "var(--amber)", background: "var(--amber-soft)", padding: "6px 10px", borderRadius: 6, marginTop: 8 }}>
              Crédito en curso: saldo insoluto calculado a hoy = <strong className="mono">{mxn(metrics.saldoInsoluto)}</strong>
            </div>
          )}
          <div className="field" style={{ marginTop: 8 }}>
            <label>Saldo insoluto actual (override, opcional)</label>
            <input className="input mono" type="number" value={saldoOverride} onChange={(e) => setSaldoOverride(e.target.value)} placeholder="Dejar vacío para usar el calculado" />
          </div>

          {/* Comisión */}
          {sec("Comisión de apertura")}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["monto", "pct"] as const).map((m) => (
              <button key={m} onClick={() => setComisionModo(m)} style={{ padding: "5px 12px", fontSize: 12, fontFamily: "inherit", fontWeight: comisionModo === m ? 600 : 400, border: comisionModo === m ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: comisionModo === m ? "var(--amber-soft)" : "transparent", color: comisionModo === m ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
                {m === "monto" ? "Monto $" : "Porcentaje %"}
              </button>
            ))}
          </div>
          {comisionModo === "monto" ? (
            <div className="field"><label>Monto</label><input className="input mono" type="number" value={comisionVal} onChange={(e) => setComisionVal(e.target.value)} placeholder="0" /></div>
          ) : (
            <div className="field"><label>% del monto</label><input className="input mono" type="number" step="0.01" value={comisionPctVal} onChange={(e) => setComisionPctVal(e.target.value)} placeholder="2" /></div>
          )}
          {comisionMonto > 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>Comisión: {mxn(comisionMonto)}</div>}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={comisionIva} onChange={(e) => setComisionIva(e.target.checked)} /> IVA en comisión
            </label>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={ivaIntereses} onChange={(e) => setIvaIntereses(e.target.checked)} /> IVA en intereses
            </label>
          </div>

          {/* Modalidad de interés */}
          {sec("Modalidad de interés")}
          <div style={{ display: "flex", gap: 6 }}>
            {(["vencido", "anticipado"] as const).map((m) => (
              <button key={m} onClick={() => setModalidadInteres(m)} style={{ flex: 1, padding: "7px 0", fontSize: 13, fontFamily: "inherit", fontWeight: modalidadInteres === m ? 600 : 400, border: modalidadInteres === m ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: modalidadInteres === m ? "var(--amber-soft)" : "transparent", color: modalidadInteres === m ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
                {m === "vencido" ? "Vencido (al final)" : "Anticipado (al inicio)"}
              </button>
            ))}
          </div>
          {schedule && schedule.interesAnticipadoInicial > 0 && (
            <div style={{ fontSize: 12, color: "var(--amber)", background: "var(--amber-soft)", padding: "6px 10px", borderRadius: 6, marginTop: 8 }}>
              Interés del primer periodo cobrado en la disposición: <strong className="mono">{mxn(schedule.interesAnticipadoInicial)}</strong>
            </div>
          )}

          {/* Avanzado */}
          {sec("Avanzado")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field">
              <label>Calendario</label>
              <select className="select" value={baseCalendario} onChange={(e) => setBaseCalendario(e.target.value as "aniversario" | "fin_de_mes")}>
                <option value="aniversario">Aniversario</option>
                <option value="fin_de_mes">Fin de mes</option>
              </select>
            </div>
            <div className="field">
              <label>Base interés</label>
              <select className="select" value={interesBase} onChange={(e) => setInteresBase(e.target.value as "apertura" | "cierre")}>
                <option value="apertura">Saldo apertura</option>
                <option value="cierre">Saldo cierre</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div className="field">
              <label>Pagos de capital (opcional)</label>
              <input className="input mono" type="number" value={numPagosCapital} onChange={(e) => setNumPagosCapital(e.target.value)} placeholder="Auto (plazo−gracia)" />
            </div>
            <div className="field">
              <label>Supuesto forward</label>
              <select className="select" value={supuestoForward} onChange={(e) => setSupuestoForward(e.target.value)}>
                <option value="ultima_conocida">Última conocida</option>
                <option value="cero">Cero (solo spread)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Metrics ── */}
        <div>
          {sec("Métricas")}
          {metrics ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div className="panel" style={{ padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#92400e" }}>CAT</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "#92400e", marginTop: 2 }}>{(metrics.cat * 100).toFixed(2)}%</div>
                <div style={{ fontSize: 10.5, color: "#a16207", marginTop: 2 }}>Incluye comisiones e IVA</div>
              </div>
              <div className="panel" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>Tasa efectiva</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "#0a1628", marginTop: 2 }}>{(metrics.catSinCom * 100).toFixed(2)}%</div>
                <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>Sin comisión (referencia)</div>
              </div>
              <MetricBox label="TIR" value={`${(metrics.tir * 100).toFixed(2)}%`} />
              <MetricBox label="Duración Macaulay" value={`${metrics.durMac.toFixed(3)}a`} />
              <MetricBox label="Duración Modificada" value={`${metrics.durMod.toFixed(3)}a`} />
              <MetricBox label="Interés total" value={mxn(schedule?.totalInteres ?? 0)} />
              <MetricBox label="IVA total" value={mxn(schedule?.totalIva ?? 0)} />
              <MetricBox label="Comisiones" value={mxn(schedule?.totalComisiones ?? 0)} />
              <MetricBox label="Saldo insoluto (hoy)" value={mxn(metrics.saldoInsoluto)} />
              <div className="panel" style={{ padding: "12px 14px", gridColumn: "1 / -1", background: "#f0f2f5" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>Total a pagar</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "#0a1628", marginTop: 2 }}>{mxn(schedule?.totalPagar ?? 0)}</div>
              </div>
            </div>
          ) : schedError ? (
            <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{schedError}</div>
          ) : (
            <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>Completa los parámetros para previsualizar</div>
          )}

          {/* Tasa label preview */}
          {params && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--amber-soft)", padding: "6px 10px", borderRadius: 6, marginBottom: 16 }}>
              Etiqueta: <strong>{rateLabel({ rate_type: params.rateType, spread: params.spread, fixed_rate: params.fixedRate })}</strong>
              {schedule && schedule.cupones.length > 0 && (
                <span> · Tasa aplicada: <strong className="mono">{(schedule.cupones[0].tasaAplicada * 100).toFixed(4)}%</strong></span>
              )}
            </div>
          )}

          {/* Validations */}
          {validaciones.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--red)", marginBottom: 6 }}>Validaciones pendientes</div>
              {validaciones.map((v, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "var(--red)", padding: "3px 0", display: "flex", gap: 6 }}>
                  <span>•</span> {v}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabla de amortización ── */}
      {schedule && schedule.cupones.length > 0 && (
        <>
          {sec("Tabla de amortización")}
          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table className="table" style={{ fontSize: 11.5, minWidth: 800 }}>
              <thead>
                <tr>
                  <th>#</th><th>Fecha</th><th style={{ textAlign: "right" }}>Saldo ini.</th>
                  <th style={{ textAlign: "right" }}>Capital</th><th style={{ textAlign: "right" }}>Interés</th>
                  {ivaIntereses && <th style={{ textAlign: "right" }}>IVA</th>}
                  <th style={{ textAlign: "right" }}>Pago total</th><th style={{ textAlign: "right" }}>Saldo fin.</th>
                  <th>Tasa</th>
                  {tipoTasa === "variable" && <th>TIIE ref.</th>}
                  <th>Días</th>
                </tr>
              </thead>
              <tbody>
                {schedule.cupones.map((cup) => (
                  <tr key={cup.numero}>
                    <td className="mono">{cup.numero}</td>
                    <td className="mono">{cup.fecha}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{mxn(cup.saldoInicial)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{mxn(cup.capital)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{mxn(cup.interes)}</td>
                    {ivaIntereses && <td className="mono" style={{ textAlign: "right" }}>{mxn(cup.iva)}</td>}
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{mxn(cup.pagoTotal)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{mxn(cup.saldoFinal)}</td>
                    <td className="mono" style={{ fontSize: 10.5 }}>{(cup.tasaAplicada * 100).toFixed(2)}%</td>
                    {tipoTasa === "variable" && <td className="mono" style={{ fontSize: 10.5 }}>{cup.tiieReferencia != null ? (cup.tiieReferencia * 100).toFixed(4) + "%" : "—"}</td>}
                    <td className="mono" style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{cup.diasPeriodo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Actions ── */}
      {error && (
        <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-primary" onClick={() => setShowConfirmActivar(true)} disabled={!puedeActivar || activando} style={{ padding: "10px 24px", fontSize: 14, opacity: puedeActivar ? 1 : 0.5 }}>
          {activando ? "Activando…" : "Activar crédito"}
        </button>
      </div>

      {showConfirmActivar && (
        <ConfirmModal
          variante="aprobacion"
          titulo="Activar crédito"
          mensaje="Se generará la tabla de amortización y el crédito pasará a Vigente. Esta acción no se puede deshacer."
          textoConfirmar="Activar"
          onConfirm={() => { setShowConfirmActivar(false); activar(); }}
          onCancel={() => setShowConfirmActivar(false)}
        />
      )}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel" style={{ padding: "10px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: "#0a1628", marginTop: 2 }}>{value}</div>
    </div>
  );
}
