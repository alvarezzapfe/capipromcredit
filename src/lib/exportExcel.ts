import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { CreditoRow, AmortRow } from "./reportes";
import { calcularSaldoInsoluto, proximoCupon, diasVencido } from "./reportes";

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

export function generarExcelReporte(
  filtros: Filtros,
  creditos: CreditoRow[],
  amortizaciones: AmortRow[],
  kpis: KPIs,
  userEmail: string
): Blob {
  const wb = XLSX.utils.book_new();

  // --- HOJA 1: Resumen ---
  const resumen: (string | number)[][] = [
    ["REPORTE DE CARTERA CAPIPROM"],
    [`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")} · Por: ${userEmail}`],
    [],
    ["FILTROS APLICADOS"],
    ["Rango de fechas:", `${filtros.desde} al ${filtros.hasta}`],
    ["Estatus:", filtros.estatus.join(", ") || "Todos"],
    ["Métodos:", filtros.metodos.join(", ") || "Todos"],
    ["Acreditado:", filtros.acreditado || "Todos"],
    [],
    ["KPIs"],
    ["Saldo insoluto total", kpis.saldoInsoluto],
    ["Interés devengado en rango", kpis.interesDevengado],
    ["Por cobrar próx 30 días", kpis.porCobrar30],
    ["Índice de morosidad (%)", kpis.morosidad],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 28 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  // --- HOJA 2: Cartera ---
  const carteraHeader = [
    "Folio", "Acreditado", "RFC", "Monto", "Saldo Insoluto",
    "Tasa Anual", "Plazo (meses)", "Frecuencia", "Método",
    "Fecha Origen", "Estatus", "Próx Cupón", "Días Vencido",
  ];
  const carteraRows = creditos.map((c) => {
    const saldo = calcularSaldoInsoluto(c.id, amortizaciones);
    const prox = proximoCupon(c.id, amortizaciones);
    const dias = diasVencido(c.id, amortizaciones);
    return [
      c.folio, c.acreditado, c.rfc ?? "", Number(c.monto), saldo,
      Number(c.tasa_anual), c.plazo_meses, c.frecuencia, c.metodo_amort,
      c.fecha_origen, c.estatus, prox ? prox.fecha_pago : "—", dias,
    ];
  });
  const wsCartera = XLSX.utils.aoa_to_sheet([carteraHeader, ...carteraRows]);
  wsCartera["!cols"] = [
    { wch: 12 }, { wch: 24 }, { wch: 15 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
  ];
  wsCartera["!autofilter"] = { ref: `A1:M${carteraRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, wsCartera, "Cartera");

  // --- HOJA 3: Amortización consolidada ---
  const amortHeader = [
    "Folio", "Acreditado", "# Cupón", "Fecha Pago", "Capital",
    "Interés", "Pago Total", "Saldo Final", "Pagado",
  ];
  const creditoMap = new Map(creditos.map((c) => [c.id, c]));
  const amortRows = amortizaciones
    .filter((a) => creditoMap.has(a.credito_id))
    .sort((a, b) => {
      const fa = creditoMap.get(a.credito_id)!.folio;
      const fb = creditoMap.get(b.credito_id)!.folio;
      if (fa !== fb) return fa.localeCompare(fb);
      return a.numero_cupon - b.numero_cupon;
    })
    .map((a) => {
      const c = creditoMap.get(a.credito_id)!;
      return [
        c.folio, c.acreditado, a.numero_cupon, a.fecha_pago,
        Number(a.capital), Number(a.interes), Number(a.pago_total),
        Number(a.saldo_final), a.pagado ? "Sí" : "No",
      ];
    });
  const wsAmort = XLSX.utils.aoa_to_sheet([amortHeader, ...amortRows]);
  wsAmort["!cols"] = [
    { wch: 12 }, { wch: 22 }, { wch: 8 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
  ];
  wsAmort["!autofilter"] = { ref: `A1:I${amortRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, wsAmort, "Amortización");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
