"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
import { mxn, fecha } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import { calcularSaldoMultiDisposicion, type RateCatalogRow } from "@/lib/credit-engine";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/* ── shared style tokens ── */
const PANEL: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e4e8ee",
  borderRadius: 10,
  boxShadow: "0 1px 2px rgba(10,22,40,0.04), 0 0 0 1px rgba(10,22,40,0.02) inset",
  overflow: "hidden",
};
const DONUT_COLORS = ["#0F1F3A", "#C9A961", "#3b6291", "#d4b97a", "#5b86b8", "#94a3b8"];

interface CuponView {
  id: string;
  folio: string;
  acreditado: string;
  estatus_credito: string;
  numero_cupon: number;
  fecha_pago: string;
  pago_total: number;
  dias_al_cupon: number;
}

interface AmortMin {
  credito_id: string;
  fecha_pago: string;
  pago_total: number;
  saldo_inicial: number;
  pagado: boolean;
  numero_cupon: number;
}

interface CreditoMin {
  id: string;
  acreditado: string;
  estatus: string;
  tipo_disposicion?: string;
  tipo_producto?: string;
  monto?: number;
  frecuencia?: string;
  tipo_gracia?: string;
  base_calendario?: string;
  interes_base?: string;
  supuesto_forward?: string;
  plazo_meses?: number;
  esquema?: string;
  rate_type?: string | null;
  spread?: number | null;
  fixed_rate?: number | null;
  convencion_dias?: string;
  frecuencia_revision?: number | null;
  periodo_gracia_meses?: number;
  num_pagos_capital?: number | null;
  saldo_override?: number | null;
}

export default function Resumen() {
  const m = useIsMobile();
  const [cargando, setCargando] = useState(true);
  const [kpis, setKpis] = useState({ creditosActivos: 0, saldoTotal: 0, porCobrar30: 0, solicitudesNuevas: 0 });
  const [proximos, setProximos] = useState<CuponView[]>([]);
  const [amortRows, setAmortRows] = useState<AmortMin[]>([]);
  const [creditoRows, setCreditoRows] = useState<CreditoMin[]>([]);
  const [saldoMap, setSaldoMap] = useState<Map<string, number>>(new Map());
  const [rateChip, setRateChip] = useState("");

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const [creditosRes, cuponesRes, solicitudesRes, amortRes] = await Promise.all([
        sb.from("creditos").select("*"),
        sb.from("v_proximos_cupones").select("*").limit(8),
        sb.from("solicitudes").select("id").eq("estatus", "nueva"),
        sb.from("amortizacion").select("credito_id, fecha_pago, pago_total, saldo_inicial, pagado, numero_cupon").eq("pagado", false).order("numero_cupon", { ascending: true }),
      ]);

      const creditos = (creditosRes.data ?? []) as (CreditoMin & { monto: number })[];
      const cupones = (cuponesRes.data ?? []) as CuponView[];
      const amort = (amortRes.data ?? []) as AmortMin[];

      // Only count saldo for active credits (vigente/en_mora)
      const activosSet = new Set(
        creditos.filter((c: any) => ["vigente", "en_mora"].includes(c.estatus)).map((c: any) => c.id)
      );
      const saldoPorCredito = new Map<string, number>();
      amort.forEach((a) => {
        if (!activosSet.has(a.credito_id)) return;
        if (!saldoPorCredito.has(a.credito_id)) saldoPorCredito.set(a.credito_id, Number(a.saldo_inicial));
      });
      let saldoTotal = 0;
      saldoPorCredito.forEach((v) => (saldoTotal += v));

      // Add revolvente saldo dispuesto
      const revolventes = creditos.filter((c: any) => c.tipo_producto === "linea_revolvente" && ["vigente", "en_mora"].includes(c.estatus));
      if (revolventes.length > 0) {
        const revIds = revolventes.map((c: any) => c.id);
        const { data: movs } = await sb.from("movimientos_linea").select("credito_id,tipo,monto").in("credito_id", revIds);
        for (const id of revIds) {
          let s = 0;
          (movs ?? []).filter((m: any) => m.credito_id === id).forEach((m: any) => { s += m.tipo === "disposicion" ? Number(m.monto) : -Number(m.monto); });
          saldoTotal += Math.max(0, s);
        }
      }

      // Add multi-disposition credits without amortization
      const multiNoAmort = creditos.filter(
        (c: any) => c.tipo_disposicion === "multiple"
          && ["vigente", "en_mora"].includes(c.estatus)
          && !saldoPorCredito.has(c.id),
      );
      if (multiNoAmort.length > 0) {
        const multiIds = multiNoAmort.map((c: any) => c.id);
        const [{ data: dispData }, { data: catData }] = await Promise.all([
          sb.from("disposiciones").select("*").in("credito_id", multiIds),
          sb.from("rate_catalog").select("rate_type, rate_date, rate_value").order("rate_date", { ascending: false }),
        ]);
        const hoy = new Date().toISOString().slice(0, 10);
        for (const c of multiNoAmort) {
          const disps = ((dispData ?? []) as any[]).filter((d: any) => d.credito_id === c.id);
          if (disps.length > 0) {
            const saldo = calcularSaldoMultiDisposicion(c as any, disps, (catData ?? []) as RateCatalogRow[], hoy);
            saldoPorCredito.set(c.id, saldo);
            saldoTotal += saldo;
          }
        }
      }

      setKpis({
        creditosActivos: creditos.filter((c) => ["vigente", "en_mora"].includes(c.estatus)).length,
        saldoTotal,
        porCobrar30: cupones.filter((c) => c.dias_al_cupon >= 0 && c.dias_al_cupon <= 30).reduce((s, c) => s + Number(c.pago_total), 0),
        solicitudesNuevas: (solicitudesRes.data ?? []).length,
      });
      setSaldoMap(new Map(saldoPorCredito));
      setProximos(cupones);
      setAmortRows(amort);
      setCreditoRows(creditos.map((c) => ({ id: c.id, acreditado: c.acreditado, estatus: c.estatus })));

      // Rate chip: latest rate for TIIE 28 and Fondeo
      const [{ data: tiie28 }, { data: fondeo }] = await Promise.all([
        sb.from("rate_catalog").select("rate_value").eq("rate_type", "TIIE_28").order("rate_date", { ascending: false }).limit(1),
        sb.from("rate_catalog").select("rate_value").eq("rate_type", "TIIE_FONDEO").order("rate_date", { ascending: false }).limit(1),
      ]);
      const pct4 = (v: number) => (v * 100).toFixed(4) + "%";
      const chipParts: string[] = [];
      if (tiie28?.[0]) chipParts.push(`TIIE 28d ${pct4(Number(tiie28[0].rate_value))}`);
      if (fondeo?.[0]) chipParts.push(`Fondeo ${pct4(Number(fondeo[0].rate_value))}`);
      if (chipParts.length) setRateChip(chipParts.join(" · "));

      setCargando(false);
    })();
  }, []);

  /* ── Chart A: cobranza proyectada (próx 6 meses) ── */
  const cobranzaData = useMemo(() => {
    const map = new Map<string, number>();
    amortRows.forEach((a) => {
      const key = a.fecha_pago.slice(0, 7); // yyyy-MM
      map.set(key, (map.get(key) ?? 0) + Number(a.pago_total));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 6)
      .map(([mes, valor]) => ({ mes, valor }));
  }, [amortRows]);

  /* ── Chart B: saldo por acreditado (activos) — uses saldoMap which includes multi-disp ── */
  const donutData = useMemo(() => {
    const activos = creditoRows.filter((c) => ["vigente", "en_mora"].includes(c.estatus));
    const map = new Map<string, number>();
    for (const cr of activos) {
      const saldo = saldoMap.get(cr.id);
      if (saldo != null && saldo > 0) {
        map.set(cr.acreditado, (map.get(cr.acreditado) ?? 0) + saldo);
      }
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [creditoRows, saldoMap]);

  const gap = m ? 16 : 24;

  return (
    <div style={{ padding: m ? "20px 16px 40px" : "32px 48px 60px" }}>
      {/* Header */}
      <header style={{ marginBottom: m ? 18 : 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "-0.02em", fontSize: m ? 22 : 30, color: "#0a1628" }}>
            Resumen de cartera
          </h1>
          {rateChip && (
            <span className="mono" style={{ fontSize: 11, color: "#5b6b80", background: "#f4f1eb", border: "1px solid #e4dfd5", borderRadius: 6, padding: "3px 10px", whiteSpace: "nowrap" }}>
              {rateChip}
            </span>
          )}
        </div>
        <p style={{ fontFamily: "var(--font-body)", color: "#5b6b80", fontSize: m ? 13 : 14 }}>
          Vista general de tu operación de crédito.
        </p>
      </header>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: m ? 10 : 16, marginBottom: gap }}>
        <Kpi label="Créditos activos" cargando={cargando} valor={String(kpis.creditosActivos)} compact={m} />
        <Kpi label="Saldo insoluto total" cargando={cargando} valor={mxn(kpis.saldoTotal)} compact={m} />
        <Kpi label="Por cobrar · 30 días" cargando={cargando} valor={mxn(kpis.porCobrar30)} compact={m} />
        <Kpi label="Solicitudes nuevas" cargando={cargando} valor={String(kpis.solicitudesNuevas)} compact={m} />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap, marginBottom: gap }}>
        {/* Chart A — Cobranza proyectada */}
        <div style={PANEL}>
          <div style={{ padding: m ? "14px 16px 0" : "18px 24px 0" }}>
            <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: m ? 14 : 16, color: "#0a1628" }}>Cobranza proyectada</h2>
          </div>
          {cargando ? (
            <div style={{ height: m ? 180 : 220, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13 }}>Cargando…</div>
          ) : cobranzaData.length === 0 ? (
            <div style={{ height: m ? 180 : 220, display: "grid", placeItems: "center", color: "#b8c4d0", fontSize: 13 }}>Sin cupones pendientes</div>
          ) : (
            <div style={{ padding: "8px 8px 0 0" }}>
              <ResponsiveContainer width="100%" height={m ? 180 : 220}>
                <AreaChart data={cobranzaData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f4f8" />
                  <XAxis dataKey="mes" fontSize={10} tick={{ fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tick={{ fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}k`} width={52} />
                  <Tooltip formatter={(v) => [mxn(Number(v)), "Por cobrar"]} labelStyle={{ fontSize: 11, color: "#5b6b80" }} />
                  <Area type="monotone" dataKey="valor" stroke="#0F1F3A" strokeWidth={2} fill="#0F1F3A" fillOpacity={0.08} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart B — Cartera por acreditado */}
        <div style={PANEL}>
          <div style={{ padding: m ? "14px 16px 0" : "18px 24px 0" }}>
            <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: m ? 14 : 16, color: "#0a1628" }}>Cartera por acreditado</h2>
          </div>
          {cargando ? (
            <div style={{ height: m ? 180 : 220, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 13 }}>Cargando…</div>
          ) : donutData.length === 0 ? (
            <div style={{ height: m ? 180 : 220, display: "grid", placeItems: "center", color: "#b8c4d0", fontSize: 13 }}>Sin créditos activos</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: m ? 8 : 16, padding: m ? "8px 10px 12px" : "8px 20px 16px", flexWrap: "wrap" }}>
              <ResponsiveContainer width={m ? 140 : 170} height={m ? 140 : 170}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={m ? 38 : 50} outerRadius={m ? 62 : 78} paddingAngle={2} strokeWidth={0}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [mxn(Number(v)), "Saldo"]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                {donutData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: m ? 11 : 12.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ color: "#5b6b80", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: m ? 110 : 150 }}>{d.name}</span>
                    <span className="mono" style={{ color: "#0a1628", fontWeight: 600, marginLeft: "auto", flexShrink: 0, fontSize: m ? 10.5 : 12 }}>{mxn(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Próximos cupones */}
      <div style={PANEL}>
        <div style={{ padding: m ? "14px 16px" : "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e4e8ee" }}>
          <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: m ? 14 : 16, color: "#0a1628" }}>Próximos cupones por cobrar</h2>
          <Link href="/dashboard/flujos" style={{ fontSize: 12.5, color: "#c8841f", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            Ver todos <span style={{ fontSize: 13 }}>&rarr;</span>
          </Link>
        </div>

        {cargando ? (
          <div style={{ padding: "8px 0" }}>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56, margin: "0 18px", borderRadius: 4, marginBottom: i < 2 ? 1 : 0 }} />)}
            <div style={{ height: 8 }} />
          </div>
        ) : proximos.length === 0 ? (
          <div style={{ padding: "56px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>◇</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>No hay cupones pendientes</div>
            <div style={{ fontSize: 12.5, color: "#b8c4d0" }}>Origina un crédito en Cartera para empezar.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Folio</th><th>Acreditado</th><th>Cupón</th><th>Vence</th><th>Días</th><th style={{ textAlign: "right" }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {proximos.map((c) => (
                  <tr key={c.id}>
                    <td className="mono" style={{ color: "#c8841f" }}>{c.folio}</td>
                    <td>{c.acreditado}</td>
                    <td className="mono">#{c.numero_cupon}</td>
                    <td>{fecha(c.fecha_pago)}</td>
                    <td><DiasBadge dias={c.dias_al_cupon} /></td>
                    <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.pago_total))}</td>
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

/* ── Sub-components ── */

function Kpi({ label, cargando, valor, compact }: { label: string; cargando: boolean; valor: string; compact?: boolean }) {
  return (
    <div style={{ ...PANEL, padding: compact ? "14px 14px" : "22px 24px" }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: compact ? 10 : 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#94a3b8", marginBottom: compact ? 8 : 12 }}>
        {label}
      </div>
      {cargando
        ? <div className="skeleton" style={{ width: 80, height: compact ? 18 : 24 }} />
        : <div className="mono" style={{ fontSize: compact ? 19 : 30, fontWeight: 600, color: "#0a1628", lineHeight: 1.1 }}>{valor}</div>
      }
    </div>
  );
}

function DiasBadge({ dias }: { dias: number }) {
  if (dias < 0) return <span className="badge badge-vencido">Vencido {Math.abs(dias)}d</span>;
  if (dias <= 7) return <span className="badge badge-en_mora">{dias}d</span>;
  return <span className="badge badge-vigente">{dias}d</span>;
}
