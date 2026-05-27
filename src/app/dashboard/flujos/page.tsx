"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn, fecha } from "@/lib/format";
import { CalendarClock } from "lucide-react";

interface Cupon {
  id: string;
  credito_id: string;
  folio: string;
  acreditado: string;
  estatus_credito: string;
  numero_cupon: number;
  fecha_pago: string;
  pago_total: number;
  saldo_final: number;
  dias_al_cupon: number;
}

export default function Flujos() {
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "vencidos" | "semana" | "mes">("todos");

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("v_proximos_cupones")
      .select("*")
      .limit(500);
    setCupones((data ?? []) as Cupon[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = cupones.filter((c) => {
    if (filtro === "vencidos") return c.dias_al_cupon < 0;
    if (filtro === "semana") return c.dias_al_cupon >= 0 && c.dias_al_cupon <= 7;
    if (filtro === "mes") return c.dias_al_cupon >= 0 && c.dias_al_cupon <= 30;
    return true;
  });

  const totalVencido = cupones.filter((c) => c.dias_al_cupon < 0).reduce((s, c) => s + Number(c.pago_total), 0);
  const totalSemana = cupones.filter((c) => c.dias_al_cupon >= 0 && c.dias_al_cupon <= 7).reduce((s, c) => s + Number(c.pago_total), 0);
  const totalMes = cupones.filter((c) => c.dias_al_cupon >= 0 && c.dias_al_cupon <= 30).reduce((s, c) => s + Number(c.pago_total), 0);

  return (
    <div style={{ padding: "36px 40px 60px", maxWidth: 1200 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>Flujos y cobranza</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
          Calendario de cupones por cobrar en toda la cartera.
        </p>
      </header>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 26 }}>
        <Resumen label="Vencido" valor={mxn(totalVencido)} accent="var(--red)" onClick={() => setFiltro("vencidos")} activo={filtro === "vencidos"} />
        <Resumen label="Próximos 7 días" valor={mxn(totalSemana)} accent="var(--amber)" onClick={() => setFiltro("semana")} activo={filtro === "semana"} />
        <Resumen label="Próximos 30 días" valor={mxn(totalMes)} accent="var(--blue)" onClick={() => setFiltro("mes")} activo={filtro === "mes"} />
        <Resumen label="Ver todos" valor={`${cupones.length} cupones`} accent="var(--text-dim)" onClick={() => setFiltro("todos")} activo={filtro === "todos"} />
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: "80px 40px", textAlign: "center" }}>
            <CalendarClock size={36} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginTop: 14 }}>
              Sin cupones pendientes
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4, maxWidth: 320, margin: "4px auto 0" }}>
              Cuando tengas créditos vigentes aparecerán aquí ordenados por fecha de cobro.
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Vence</th>
                <th>Días</th>
                <th>Folio</th>
                <th>Acreditado</th>
                <th>Cupón</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th style={{ textAlign: "right" }}>Saldo posterior</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td>{fecha(c.fecha_pago)}</td>
                  <td><DiasBadge dias={c.dias_al_cupon} /></td>
                  <td className="mono" style={{ color: "var(--amber)" }}>{c.folio}</td>
                  <td>{c.acreditado}</td>
                  <td className="mono">#{c.numero_cupon}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.pago_total))}</td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>{mxn(Number(c.saldo_final))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Resumen({ label, valor, accent, onClick, activo }: { label: string; valor: string; accent: string; onClick: () => void; activo: boolean }) {
  return (
    <button
      onClick={onClick}
      className="panel"
      style={{
        padding: "18px 20px",
        textAlign: "left",
        border: activo ? `1px solid ${accent}` : "1px solid var(--line)",
        background: activo ? "var(--panel-hover)" : "var(--panel)",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: accent }}>{valor}</div>
    </button>
  );
}

function DiasBadge({ dias }: { dias: number }) {
  if (dias < 0) return <span className="badge badge-vencido">Vencido {Math.abs(dias)}d</span>;
  if (dias <= 7) return <span className="badge badge-en_mora">{dias}d</span>;
  return <span className="badge badge-vigente">{dias}d</span>;
}
