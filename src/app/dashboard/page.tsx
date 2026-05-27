"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
import { mxn, fecha } from "@/lib/format";

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

export default function Resumen() {
  const [cargando, setCargando] = useState(true);
  const [kpis, setKpis] = useState({
    creditosActivos: 0,
    saldoTotal: 0,
    porCobrar30: 0,
    solicitudesNuevas: 0,
  });
  const [proximos, setProximos] = useState<CuponView[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      const [creditosRes, cuponesRes, solicitudesRes] = await Promise.all([
        supabase.from("creditos").select("id, monto, estatus"),
        supabase.from("v_proximos_cupones").select("*").limit(8),
        supabase.from("solicitudes").select("id").eq("estatus", "nueva"),
      ]);

      const creditos = creditosRes.data ?? [];
      const cupones = (cuponesRes.data ?? []) as CuponView[];

      const saldoPorCredito = new Map<string, number>();
      const { data: amort } = await supabase
        .from("amortizacion")
        .select("credito_id, saldo_inicial, pagado, numero_cupon")
        .eq("pagado", false)
        .order("numero_cupon", { ascending: true });
      (amort ?? []).forEach((a: any) => {
        if (!saldoPorCredito.has(a.credito_id)) {
          saldoPorCredito.set(a.credito_id, Number(a.saldo_inicial));
        }
      });
      let saldoTotal = 0;
      saldoPorCredito.forEach((v) => (saldoTotal += v));

      const porCobrar30 = cupones
        .filter((c) => c.dias_al_cupon >= 0 && c.dias_al_cupon <= 30)
        .reduce((s, c) => s + Number(c.pago_total), 0);

      setKpis({
        creditosActivos: creditos.filter((c: any) =>
          ["vigente", "en_mora"].includes(c.estatus)
        ).length,
        saldoTotal,
        porCobrar30,
        solicitudesNuevas: (solicitudesRes.data ?? []).length,
      });
      setProximos(cupones);
      setCargando(false);
    })();
  }, []);

  return (
    <div style={{ padding: "36px 40px 60px", maxWidth: 1200 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>
          Resumen de cartera
        </h1>
        <p style={{ color: "#5b6b80", fontSize: 14 }}>
          Vista general de tu operación de crédito.
        </p>
      </header>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <Kpi label="Créditos activos" cargando={cargando} valor={String(kpis.creditosActivos)} esMonto={false} />
        <Kpi label="Saldo insoluto total" cargando={cargando} valor={mxn(kpis.saldoTotal)} esMonto />
        <Kpi label="Por cobrar · 30 días" cargando={cargando} valor={mxn(kpis.porCobrar30)} esMonto />
        <Kpi label="Solicitudes nuevas" cargando={cargando} valor={String(kpis.solicitudesNuevas)} esMonto={false} />
      </div>

      {/* Próximos cupones */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e4e8ee",
          borderRadius: 10,
          boxShadow: "0 1px 2px rgba(10,22,40,0.04), 0 0 0 1px rgba(10,22,40,0.02) inset",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #e4e8ee",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", fontFamily: "var(--font-body)" }}>
            Próximos cupones por cobrar
          </h2>
          <Link
            href="/dashboard/flujos"
            style={{
              fontSize: 12.5,
              color: "#c8841f",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
          >
            Ver todos <span style={{ fontSize: 13 }}>&rarr;</span>
          </Link>
        </div>

        {cargando ? (
          <div style={{ padding: "8px 0" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 56, margin: "0 18px 0", borderRadius: 4, marginBottom: i < 2 ? 1 : 0 }} />
            ))}
            <div style={{ height: 8 }} />
          </div>
        ) : proximos.length === 0 ? (
          <div style={{ padding: "56px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>◇</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
              No hay cupones pendientes
            </div>
            <div style={{ fontSize: 12.5, color: "#b8c4d0" }}>
              Origina un crédito en Cartera para empezar.
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Acreditado</th>
                <th>Cupón</th>
                <th>Vence</th>
                <th>Días</th>
                <th style={{ textAlign: "right" }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {proximos.map((c) => (
                <tr key={c.id}>
                  <td className="mono" style={{ color: "#c8841f" }}>{c.folio}</td>
                  <td>{c.acreditado}</td>
                  <td className="mono">#{c.numero_cupon}</td>
                  <td>{fecha(c.fecha_pago)}</td>
                  <td>
                    <DiasBadge dias={c.dias_al_cupon} />
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.pago_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, cargando, valor, esMonto }: { label: string; cargando: boolean; valor: string; esMonto: boolean }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e4e8ee",
        borderRadius: 10,
        padding: "22px 24px",
        boxShadow: "0 1px 2px rgba(10,22,40,0.04), 0 0 0 1px rgba(10,22,40,0.02) inset",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#94a3b8",
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      {cargando ? (
        <div className="skeleton" style={{ width: 80, height: 24 }} />
      ) : (
        <div
          className="mono"
          style={{
            fontSize: 30,
            fontWeight: 600,
            color: "#0a1628",
            lineHeight: 1.1,
          }}
        >
          {valor}
        </div>
      )}
    </div>
  );
}

function DiasBadge({ dias }: { dias: number }) {
  if (dias < 0)
    return <span className="badge badge-vencido">Vencido {Math.abs(dias)}d</span>;
  if (dias <= 7)
    return <span className="badge badge-en_mora">{dias}d</span>;
  return <span className="badge badge-vigente">{dias}d</span>;
}
