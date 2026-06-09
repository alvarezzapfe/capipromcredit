"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { useRol } from "@/lib/useRol";
import { esSoloLectura, puedeCrear } from "@/lib/rbac";
import { mxn, fecha, labelEstatus, ESTATUS_CREDITO } from "@/lib/format";
import { Download, FileSpreadsheet, BarChart3 } from "lucide-react";
import { format, startOfYear, startOfMonth, subDays, subMonths } from "date-fns";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import {
  type CreditoRow, type AmortRow,
  calcularSaldoInsoluto, calcularInteresDevengado,
  calcularPorCobrarProx30Dias, calcularPlazoRestante,
  diasVencido, agruparOriginacionPorMes,
  proyectarSaldoMensual, topAcreditados, proximoCupon,
} from "@/lib/reportes";
import { useIsMobile } from "@/lib/useIsMobile";

const METODOS = ["frances", "lineal", "bullet", "creciente"] as const;
const PIE_COLORS: Record<string, string> = {
  vigente: "#16a34a", en_mora: "#f59e0b", vencido: "#dc2626",
  liquidado: "#6366f1", cancelado: "#94a3b8", reestructurado: "#8b5cf6",
};
const hoyStr = () => format(new Date(), "yyyy-MM-dd");

// ================================================================
// Main
// ================================================================
export default function Reportes() {
  const isMobile = useIsMobile();
  const rol = useRol();
  const readOnly = rol ? esSoloLectura(rol) : false;
  const canExport = rol ? puedeCrear(rol) : false;

  const [creditos, setCreditos] = useState<CreditoRow[]>([]);
  const [amort, setAmort] = useState<AmortRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState<"pdf" | "xlsx" | null>(null);

  // Filtros
  const [desde, setDesde] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(hoyStr());
  const [estatusSel, setEstatusSel] = useState<string[]>([...ESTATUS_CREDITO]);
  const [metodosSel, setMetodosSel] = useState<string[]>([...METODOS]);
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [acreditado, setAcreditado] = useState("");

  // Table
  const [sortKey, setSortKey] = useState<string>("folio");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;

  // Load data
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [cr, am] = await Promise.all([
        supabase.from("creditos").select("*").order("created_at", { ascending: false }),
        supabase.from("amortizacion").select("*"),
      ]);
      setCreditos((cr.data ?? []) as CreditoRow[]);
      setAmort((am.data ?? []) as AmortRow[]);
      setCargando(false);
    })();
  }, []);

  // Unique acreditados for autocomplete
  const acreditadosUnicos = useMemo(
    () => [...new Set(creditos.map((c) => c.acreditado))].sort(),
    [creditos]
  );

  // Filtered creditos
  const filtrados = useMemo(() => {
    if (readOnly) return creditos; // demo sees everything
    return creditos.filter((c) => {
      if (c.fecha_origen < desde || c.fecha_origen > hasta) return false;
      if (!estatusSel.includes(c.estatus)) return false;
      if (!metodosSel.includes(c.metodo_amort)) return false;
      if (montoMin && Number(c.monto) < Number(montoMin)) return false;
      if (montoMax && Number(c.monto) > Number(montoMax)) return false;
      if (acreditado && !c.acreditado.toLowerCase().includes(acreditado.toLowerCase())) return false;
      return true;
    });
  }, [creditos, desde, hasta, estatusSel, metodosSel, montoMin, montoMax, acreditado, readOnly]);

  // Amort for filtered creditos
  const filtradosIds = useMemo(() => new Set(filtrados.map((c) => c.id)), [filtrados]);
  const amortFiltrada = useMemo(() => amort.filter((a) => filtradosIds.has(a.credito_id)), [amort, filtradosIds]);

  // KPIs
  const kpis = useMemo(() => {
    const saldoInsoluto = filtrados
      .filter((c) => ["vigente", "en_mora"].includes(c.estatus))
      .reduce((s, c) => s + calcularSaldoInsoluto(c.id, amort), 0);
    const interesDevengado = calcularInteresDevengado(amortFiltrada, new Date(desde), new Date(hasta));
    const pc30 = calcularPorCobrarProx30Dias(amortFiltrada);
    const enMora = filtrados.filter((c) => c.estatus === "en_mora" || c.estatus === "vencido").length;
    const morosidad = filtrados.length ? (enMora / filtrados.length) * 100 : 0;
    return { saldoInsoluto, interesDevengado, porCobrar30: pc30.monto, cupones30: pc30.cupones, morosidad, enMora, vencidos: filtrados.filter((c) => c.estatus === "vencido").length, enMoraCount: filtrados.filter((c) => c.estatus === "en_mora").length };
  }, [filtrados, amort, amortFiltrada, desde, hasta]);

  // Chart data
  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    filtrados.forEach((c) => map.set(c.estatus, (map.get(c.estatus) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name: labelEstatus[name] ?? name, value, key: name }));
  }, [filtrados]);

  const barData = useMemo(() => agruparOriginacionPorMes(filtrados), [filtrados]);
  const lineData = useMemo(() => proyectarSaldoMensual(filtrados, amortFiltrada, new Date(desde), new Date(hasta)), [filtrados, amortFiltrada, desde, hasta]);
  const topData = useMemo(() => topAcreditados(filtrados, amort, 10), [filtrados, amort]);

  // Sorted + paginated table
  const sorted = useMemo(() => {
    const arr = [...filtrados];
    arr.sort((a, b) => {
      let va: any = (a as any)[sortKey];
      let vb: any = (b as any)[sortKey];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtrados, sortKey, sortAsc]);
  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const pageData = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  }

  function toggleChip(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  function setPreset(p: string) {
    const hoy = new Date();
    if (p === "hoy") { setDesde(hoyStr()); setHasta(hoyStr()); }
    else if (p === "7d") { setDesde(format(subDays(hoy, 7), "yyyy-MM-dd")); setHasta(hoyStr()); }
    else if (p === "mes") { setDesde(format(startOfMonth(hoy), "yyyy-MM-dd")); setHasta(hoyStr()); }
    else if (p === "mes_pasado") { const m = subMonths(hoy, 1); setDesde(format(startOfMonth(m), "yyyy-MM-dd")); setHasta(format(new Date(m.getFullYear(), m.getMonth() + 1, 0), "yyyy-MM-dd")); }
    else if (p === "ytd") { setDesde(format(startOfYear(hoy), "yyyy-MM-dd")); setHasta(hoyStr()); }
    else if (p === "12m") { setDesde(format(subMonths(hoy, 12), "yyyy-MM-dd")); setHasta(hoyStr()); }
    else {
      const oldest = creditos.length > 0
        ? creditos.reduce((min, c) => c.fecha_origen < min ? c.fecha_origen : min, creditos[0].fecha_origen)
        : format(startOfYear(new Date()), "yyyy-MM-dd");
      setDesde(oldest); setHasta(hoyStr());
    }
  }

  function limpiar() {
    setDesde(format(startOfYear(new Date()), "yyyy-MM-dd"));
    setHasta(hoyStr());
    setEstatusSel([...ESTATUS_CREDITO]);
    setMetodosSel([...METODOS]);
    setMontoMin(""); setMontoMax(""); setAcreditado("");
  }

  // Downloads
  async function descargarExcel() {
    setDescargando("xlsx");
    try {
      const { generarExcelReporte } = await import("@/lib/exportExcel");
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      const blob = generarExcelReporte(
        { desde, hasta, estatus: estatusSel, metodos: metodosSel, acreditado },
        filtrados, amortFiltrada,
        { saldoInsoluto: kpis.saldoInsoluto, interesDevengado: kpis.interesDevengado, porCobrar30: kpis.porCobrar30, morosidad: kpis.morosidad },
        u.user?.email ?? "sistema"
      );
      triggerDownload(blob, `CapiProm-Reporte-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
    } catch (e) { console.error(e); }
    setDescargando(null);
  }

  async function descargarPDF() {
    setDescargando("pdf");
    try {
      const { generarPDFReporte } = await import("@/lib/exportPDF");
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      const blob = await generarPDFReporte(
        { desde, hasta, estatus: estatusSel, metodos: metodosSel, acreditado },
        filtrados, amortFiltrada,
        { saldoInsoluto: kpis.saldoInsoluto, interesDevengado: kpis.interesDevengado, porCobrar30: kpis.porCobrar30, morosidad: kpis.morosidad },
        u.user?.email ?? "sistema"
      );
      triggerDownload(blob, `CapiProm-Reporte-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
    } catch (e) { console.error(e); alert("No se pudo generar el PDF."); }
    setDescargando(null);
  }

  if (cargando) return <div style={{ padding: "36px 40px", color: "var(--text-faint)" }}>Cargando reportes…</div>;

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", fontSize: 12, fontWeight: active ? 600 : 500, fontFamily: "inherit",
    borderRadius: 999, border: active ? "1px solid var(--amber)" : "1px solid var(--line)",
    background: active ? "var(--amber-soft)" : "transparent", color: active ? "var(--amber)" : "var(--text-dim)",
    cursor: readOnly ? "not-allowed" : "pointer", opacity: readOnly ? 0.6 : 1,
  });

  return (
    <div style={{ padding: isMobile ? "20px 16px 40px" : "32px 48px 60px" }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>Reportes</h1>
          <p style={{ color: "var(--text-dim)" }}>Análisis y exportación de la cartera al corte.</p>
        </div>
        {canExport && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={descargarPDF} disabled={descargando !== null} style={{ fontSize: 13, padding: "9px 16px" }}>
              <Download size={14} strokeWidth={1.75} /> {descargando === "pdf" ? "Generando…" : "PDF"}
            </button>
            <button className="btn btn-ghost" onClick={descargarExcel} disabled={descargando !== null} style={{ fontSize: 13, padding: "9px 16px" }}>
              <FileSpreadsheet size={14} strokeWidth={1.75} /> {descargando === "xlsx" ? "Generando…" : "Excel"}
            </button>
          </div>
        )}
      </header>

      {readOnly && (
        <div style={{ background: "var(--amber-soft)", border: "1px solid rgba(200,132,31,0.2)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "var(--amber-deep)", marginBottom: 20 }}>
          Vista de demostración: datos al corte actual, sin opción de filtrado o exportación.
        </div>
      )}

      {/* Filters */}
      <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Desde</label>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} disabled={readOnly} />
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {[["hoy", "Hoy"], ["7d", "7 días"], ["mes", "Mes actual"], ["mes_pasado", "Mes pasado"], ["ytd", "YTD"], ["12m", "12 meses"], ["todo", "Todo"]].map(([k, l]) => (
              <button key={k} onClick={() => setPreset(k)} style={{ ...chipStyle(false), cursor: "pointer", opacity: 1 }}>{l}</button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Estatus</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...ESTATUS_CREDITO].map((e) => (
              <button key={e} onClick={() => !readOnly && toggleChip(estatusSel, setEstatusSel, e)} style={chipStyle(estatusSel.includes(e))}>{labelEstatus[e]}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", display: "block", marginBottom: 6 }}>Método</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...METODOS].map((m) => (
              <button key={m} onClick={() => !readOnly && toggleChip(metodosSel, setMetodosSel, m)} style={chipStyle(metodosSel.includes(m))}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 2fr", gap: 12, marginTop: 14 }}>
          <div className="field">
            <label>Monto mín</label>
            <input className="input mono" type="number" placeholder="0" value={montoMin} onChange={(e) => setMontoMin(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Monto máx</label>
            <input className="input mono" type="number" placeholder="Sin tope" value={montoMax} onChange={(e) => setMontoMax(e.target.value)} disabled={readOnly} />
          </div>
          <div className="field">
            <label>Acreditado</label>
            <input className="input" list="acreditados" placeholder="Buscar…" value={acreditado} onChange={(e) => setAcreditado(e.target.value)} disabled={readOnly} />
            <datalist id="acreditados">{acreditadosUnicos.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={limpiar} style={{ fontSize: 13, padding: "8px 14px" }}>Limpiar</button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: 24 }}>
        <KpiCard label="Saldo insoluto total" valor={mxn(kpis.saldoInsoluto)} sub={`${filtrados.length} créditos`} />
        <KpiCard label="Interés devengado" valor={mxn(kpis.interesDevengado)} sub={`Del ${fecha(desde)} al ${fecha(hasta)}`} />
        <KpiCard label="Por cobrar · 30 días" valor={mxn(kpis.porCobrar30)} sub={`${kpis.cupones30} cupones`} />
        <KpiCard label="Morosidad" valor={`${kpis.morosidad.toFixed(1)}%`} sub={`${kpis.enMoraCount} en mora · ${kpis.vencidos} vencidos`} />
      </div>

      {/* Charts 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Distribución por estatus</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {pieData.map((d) => <Cell key={d.key} fill={PIE_COLORS[d.key] ?? "#94a3b8"} />)}
              </Pie>
              <Tooltip formatter={(v, name) => [`${v} créditos`, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: -130, position: "relative", pointerEvents: "none" }}>
            {filtrados.length}
          </div>
          <div style={{ height: 90 }} />
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Originación mensual</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f4f8" />
              <XAxis dataKey="mes" fontSize={10} tick={{ fill: "#94a3b8" }} />
              <YAxis fontSize={10} tick={{ fill: "#94a3b8" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [mxn(Number(v)), "Originado"]} />
              <Bar dataKey="valor" fill="#C9A961" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Saldo insoluto (evolución)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f4f8" />
              <XAxis dataKey="mes" fontSize={10} tick={{ fill: "#94a3b8" }} />
              <YAxis fontSize={10} tick={{ fill: "#94a3b8" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [mxn(Number(v)), "Saldo"]} />
              <Area type="monotone" dataKey="saldo" stroke="#1e3a5f" strokeWidth={2.5} fill="#1e3a5f" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Top acreditados por exposición</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f4f8" />
              <XAxis type="number" fontSize={10} tick={{ fill: "#94a3b8" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="acreditado" width={100} fontSize={10} tick={{ fill: "#5b6b80" }} />
              <Tooltip formatter={(v) => [mxn(Number(v)), "Saldo"]} />
              <Bar dataKey="saldo" fill="#1e3a5f" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Detalle de cartera filtrada</h3>
          <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{filtrados.length} créditos</span>
        </div>
        {filtrados.length === 0 ? (
          <div style={{ padding: "60px 40px", textAlign: "center" }}>
            <BarChart3 size={32} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 12 }}>Sin créditos que coincidan con los filtros.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  {[["folio", "Folio"], ["acreditado", "Acreditado"], ["monto", "Monto"], ["tasa_anual", "Tasa"], ["estatus", "Estatus"]].map(([k, l]) => (
                    <th key={k} onClick={() => toggleSort(k)} style={{ cursor: "pointer", userSelect: "none", textAlign: k === "monto" ? "right" : "left" }}>
                      {l} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Saldo insol.</th>
                  <th>Próx cupón</th>
                  <th style={{ textAlign: "right" }}>Días venc.</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((c) => {
                  const si = calcularSaldoInsoluto(c.id, amort);
                  const prox = proximoCupon(c.id, amort);
                  const dv = diasVencido(c.id, amort);
                  return (
                    <tr key={c.id}>
                      <td className="mono" style={{ color: "var(--amber)" }}>{c.folio}</td>
                      <td>{c.acreditado}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.monto))}</td>
                      <td className="mono">{(Number(c.tasa_anual) * 100).toFixed(1)}%</td>
                      <td><span className={`badge badge-${c.estatus}`}>{labelEstatus[c.estatus]}</span></td>
                      <td className="mono" style={{ textAlign: "right" }}>{mxn(si)}</td>
                      <td style={{ fontSize: 12.5 }}>{prox ? `${fecha(prox.fecha_pago)} · ${mxn(Number(prox.pago_total))}` : "—"}</td>
                      <td className="mono" style={{ textAlign: "right", color: dv > 0 ? "var(--red)" : "var(--text-faint)" }}>{dv > 0 ? dv : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {totalPages > 1 && (
              <div style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line-soft)", fontSize: 13 }}>
                <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)} style={{ padding: "6px 14px", fontSize: 12.5 }}>Anterior</button>
                <span style={{ color: "var(--text-faint)" }}>Página {page + 1} de {totalPages}</span>
                <button className="btn btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{ padding: "6px 14px", fontSize: 12.5 }}>Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Sub-components
// ================================================================
function KpiCard({ label, valor, sub }: { label: string; valor: string; sub: string }) {
  return (
    <div className="panel" style={{ padding: "22px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 10 }}>{label}</div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: "var(--text)", lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
