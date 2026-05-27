import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import type { CreditoRow, AmortRow } from "./reportes";
import { calcularSaldoInsoluto, proximoCupon } from "./reportes";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 9, color: "#1a2230" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  headerRight: { fontSize: 8, color: "#94a3b8" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#94a3b8" },
  title: { fontSize: 28, fontFamily: "Helvetica-Bold", color: "#0a1628", marginBottom: 6 },
  subtitle: { fontSize: 12, color: "#5b6b80", marginBottom: 24 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8, color: "#0a1628" },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  kpiBox: { flex: 1, border: "1px solid #e4e8ee", borderRadius: 6, padding: "10 12" },
  kpiLabel: { fontSize: 7, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 4 },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0a1628" },
  table: { width: "100%" },
  tableHeader: { flexDirection: "row", backgroundColor: "#0a1628", padding: "6 0" },
  tableHeaderCell: { color: "#ffffff", fontSize: 7, fontFamily: "Helvetica-Bold", paddingHorizontal: 6 },
  tableRow: { flexDirection: "row", borderBottom: "0.5px solid #e4e8ee", padding: "5 0" },
  tableRowAlt: { flexDirection: "row", borderBottom: "0.5px solid #e4e8ee", padding: "5 0", backgroundColor: "#f9fafc" },
  tableCell: { fontSize: 8, paddingHorizontal: 6 },
  filtroRow: { flexDirection: "row", marginBottom: 4 },
  filtroLabel: { width: 100, fontSize: 8, color: "#94a3b8" },
  filtroValue: { fontSize: 8, color: "#0a1628" },
});

interface Filtros {
  desde: string;
  hasta: string;
  estatus: string[];
  metodos: string[];
  acreditado: string;
}
interface KPIs {
  saldoInsoluto: number;
  interesDevengado: number;
  porCobrar30: number;
  morosidad: number;
}

function mxnPdf(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ReporteDoc({
  filtros, creditos, amortizaciones, kpis, userEmail,
}: {
  filtros: Filtros;
  creditos: CreditoRow[];
  amortizaciones: AmortRow[];
  kpis: KPIs;
  userEmail: string;
}) {
  const generado = format(new Date(), "dd/MM/yyyy HH:mm");

  // Resumen por estatus
  const estatusMap = new Map<string, { count: number; saldo: number }>();
  for (const c of creditos) {
    const entry = estatusMap.get(c.estatus) ?? { count: 0, saldo: 0 };
    entry.count++;
    entry.saldo += calcularSaldoInsoluto(c.id, amortizaciones);
    estatusMap.set(c.estatus, entry);
  }

  // Column widths for detail table (percentages)
  const cols = [12, 22, 14, 14, 8, 12, 18];

  return (
    <Document>
      {/* Page 1: Portada + KPIs */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={{ fontSize: 10, color: "#c8841f", fontFamily: "Helvetica-Bold" }}>CAPIPROM CREDIT</Text>
          <Text style={s.headerRight}>Reporte de cartera · {generado}</Text>
        </View>

        <Text style={s.title}>Reporte de cartera</Text>
        <Text style={s.subtitle}>{filtros.desde} – {filtros.hasta}</Text>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Generado por</Text>
          <Text style={{ fontSize: 9 }}>{userEmail} · {generado}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Filtros aplicados</Text>
          <View style={s.filtroRow}><Text style={s.filtroLabel}>Rango:</Text><Text style={s.filtroValue}>{filtros.desde} al {filtros.hasta}</Text></View>
          <View style={s.filtroRow}><Text style={s.filtroLabel}>Estatus:</Text><Text style={s.filtroValue}>{filtros.estatus.join(", ") || "Todos"}</Text></View>
          <View style={s.filtroRow}><Text style={s.filtroLabel}>Métodos:</Text><Text style={s.filtroValue}>{filtros.metodos.join(", ") || "Todos"}</Text></View>
          <View style={s.filtroRow}><Text style={s.filtroLabel}>Acreditado:</Text><Text style={s.filtroValue}>{filtros.acreditado || "Todos"}</Text></View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>KPIs</Text>
          <View style={s.kpiRow}>
            <View style={s.kpiBox}><Text style={s.kpiLabel}>Saldo insoluto</Text><Text style={s.kpiValue}>{mxnPdf(kpis.saldoInsoluto)}</Text></View>
            <View style={s.kpiBox}><Text style={s.kpiLabel}>Interés devengado</Text><Text style={s.kpiValue}>{mxnPdf(kpis.interesDevengado)}</Text></View>
          </View>
          <View style={s.kpiRow}>
            <View style={s.kpiBox}><Text style={s.kpiLabel}>Por cobrar 30d</Text><Text style={s.kpiValue}>{mxnPdf(kpis.porCobrar30)}</Text></View>
            <View style={s.kpiBox}><Text style={s.kpiLabel}>Morosidad</Text><Text style={s.kpiValue}>{kpis.morosidad.toFixed(1)}%</Text></View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Composición por estatus</Text>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderCell, { width: "30%" }]}>Estatus</Text>
              <Text style={[s.tableHeaderCell, { width: "20%" }]}>Créditos</Text>
              <Text style={[s.tableHeaderCell, { width: "30%" }]}>Saldo insol.</Text>
              <Text style={[s.tableHeaderCell, { width: "20%" }]}>%</Text>
            </View>
            {Array.from(estatusMap.entries()).map(([est, data], i) => (
              <View key={est} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.tableCell, { width: "30%" }]}>{est}</Text>
                <Text style={[s.tableCell, { width: "20%" }]}>{data.count}</Text>
                <Text style={[s.tableCell, { width: "30%" }]}>{mxnPdf(data.saldo)}</Text>
                <Text style={[s.tableCell, { width: "20%" }]}>{creditos.length ? ((data.count / creditos.length) * 100).toFixed(1) : 0}%</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.footer}><Text>CapiProm Credit · Herramienta interna</Text></View>
      </Page>

      {/* Page 2+: Detalle */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={{ fontSize: 10, color: "#c8841f", fontFamily: "Helvetica-Bold" }}>CAPIPROM CREDIT</Text>
          <Text style={s.headerRight}>Cartera al corte · {generado}</Text>
        </View>
        <Text style={s.sectionTitle}>Cartera al corte ({creditos.length} créditos)</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { width: `${cols[0]}%` }]}>Folio</Text>
            <Text style={[s.tableHeaderCell, { width: `${cols[1]}%` }]}>Acreditado</Text>
            <Text style={[s.tableHeaderCell, { width: `${cols[2]}%` }]}>Monto</Text>
            <Text style={[s.tableHeaderCell, { width: `${cols[3]}%` }]}>Saldo insol.</Text>
            <Text style={[s.tableHeaderCell, { width: `${cols[4]}%` }]}>Tasa</Text>
            <Text style={[s.tableHeaderCell, { width: `${cols[5]}%` }]}>Estatus</Text>
            <Text style={[s.tableHeaderCell, { width: `${cols[6]}%` }]}>Próx cupón</Text>
          </View>
          {creditos.slice(0, 80).map((c, i) => {
            const saldo = calcularSaldoInsoluto(c.id, amortizaciones);
            const prox = proximoCupon(c.id, amortizaciones);
            return (
              <View key={c.id} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.tableCell, { width: `${cols[0]}%` }]}>{c.folio}</Text>
                <Text style={[s.tableCell, { width: `${cols[1]}%` }]}>{c.acreditado.slice(0, 24)}</Text>
                <Text style={[s.tableCell, { width: `${cols[2]}%` }]}>{mxnPdf(Number(c.monto))}</Text>
                <Text style={[s.tableCell, { width: `${cols[3]}%` }]}>{mxnPdf(saldo)}</Text>
                <Text style={[s.tableCell, { width: `${cols[4]}%` }]}>{(Number(c.tasa_anual) * 100).toFixed(1)}%</Text>
                <Text style={[s.tableCell, { width: `${cols[5]}%` }]}>{c.estatus}</Text>
                <Text style={[s.tableCell, { width: `${cols[6]}%` }]}>{prox ? `${prox.fecha_pago} · ${mxnPdf(Number(prox.pago_total))}` : "—"}</Text>
              </View>
            );
          })}
        </View>
        {creditos.length > 80 && <Text style={{ marginTop: 8, fontSize: 8, color: "#94a3b8" }}>Mostrando 80 de {creditos.length} créditos. Ver Excel para detalle completo.</Text>}
        <View style={s.footer}><Text>CapiProm Credit · Herramienta interna</Text></View>
      </Page>
    </Document>
  );
}

export async function generarPDFReporte(
  filtros: Filtros,
  creditos: CreditoRow[],
  amortizaciones: AmortRow[],
  kpis: KPIs,
  userEmail: string
): Promise<Blob> {
  const doc = (
    <ReporteDoc
      filtros={filtros}
      creditos={creditos}
      amortizaciones={amortizaciones}
      kpis={kpis}
      userEmail={userEmail}
    />
  );
  return await pdf(doc).toBlob();
}
