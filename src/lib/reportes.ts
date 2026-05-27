import { format, startOfMonth, addMonths, isBefore, parseISO } from "date-fns";

export interface CreditoRow {
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

export interface AmortRow {
  id: string;
  credito_id: string;
  numero_cupon: number;
  fecha_pago: string;
  saldo_inicial: number;
  capital: number;
  interes: number;
  pago_total: number;
  saldo_final: number;
  pagado: boolean;
}

export function calcularSaldoInsoluto(
  creditoId: string,
  amortizaciones: AmortRow[]
): number {
  const cupones = amortizaciones
    .filter((a) => a.credito_id === creditoId)
    .sort((a, b) => a.numero_cupon - b.numero_cupon);
  const primerNoPagado = cupones.find((c) => !c.pagado);
  if (primerNoPagado) return Number(primerNoPagado.saldo_inicial);
  // All paid — saldo is 0
  return 0;
}

export function calcularInteresDevengado(
  amortizaciones: AmortRow[],
  desde: Date,
  hasta: Date
): number {
  const desdeStr = format(desde, "yyyy-MM-dd");
  const hastaStr = format(hasta, "yyyy-MM-dd");
  return amortizaciones
    .filter((a) => a.fecha_pago >= desdeStr && a.fecha_pago <= hastaStr)
    .reduce((sum, a) => sum + Number(a.interes), 0);
}

export function calcularPorCobrarProx30Dias(amortizaciones: AmortRow[]): { monto: number; cupones: number } {
  const hoy = format(new Date(), "yyyy-MM-dd");
  const en30 = format(addMonths(new Date(), 1), "yyyy-MM-dd");
  const pendientes = amortizaciones.filter(
    (a) => !a.pagado && a.fecha_pago >= hoy && a.fecha_pago <= en30
  );
  return {
    monto: pendientes.reduce((s, a) => s + Number(a.pago_total), 0),
    cupones: pendientes.length,
  };
}

export function calcularPlazoRestante(
  creditoId: string,
  amortizaciones: AmortRow[]
): number {
  const pendientes = amortizaciones.filter(
    (a) => a.credito_id === creditoId && !a.pagado
  );
  return pendientes.length;
}

export function diasVencido(
  creditoId: string,
  amortizaciones: AmortRow[]
): number {
  const hoy = new Date();
  const hoyStr = format(hoy, "yyyy-MM-dd");
  const vencidos = amortizaciones.filter(
    (a) => a.credito_id === creditoId && !a.pagado && a.fecha_pago < hoyStr
  );
  if (vencidos.length === 0) return 0;
  const masViejo = vencidos.sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago))[0];
  const diff = hoy.getTime() - parseISO(masViejo.fecha_pago).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function agruparOriginacionPorMes(
  creditos: CreditoRow[]
): { mes: string; valor: number }[] {
  const map = new Map<string, number>();
  for (const c of creditos) {
    const key = c.fecha_origen.slice(0, 7); // yyyy-MM
    map.set(key, (map.get(key) ?? 0) + Number(c.monto));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, valor]) => ({ mes, valor }));
}

export function proyectarSaldoMensual(
  creditos: CreditoRow[],
  amortizaciones: AmortRow[],
  desde: Date,
  hasta: Date
): { mes: string; saldo: number }[] {
  const resultado: { mes: string; saldo: number }[] = [];
  let current = startOfMonth(desde);
  const end = startOfMonth(hasta);

  while (!isBefore(end, current)) {
    const mesStr = format(current, "yyyy-MM-dd");
    let saldoTotal = 0;
    for (const c of creditos) {
      const cupones = amortizaciones
        .filter((a) => a.credito_id === c.id)
        .sort((a, b) => a.numero_cupon - b.numero_cupon);
      // Find last cupon with fecha_pago <= fin de este mes
      const relevantes = cupones.filter((a) => a.fecha_pago <= mesStr);
      if (relevantes.length > 0) {
        saldoTotal += Number(relevantes[relevantes.length - 1].saldo_final);
      } else if (cupones.length > 0) {
        saldoTotal += Number(cupones[0].saldo_inicial);
      }
    }
    resultado.push({ mes: format(current, "yyyy-MM"), saldo: saldoTotal });
    current = addMonths(current, 1);
  }
  return resultado;
}

export function topAcreditados(
  creditos: CreditoRow[],
  amortizaciones: AmortRow[],
  n: number
): { acreditado: string; saldo: number }[] {
  const map = new Map<string, number>();
  for (const c of creditos) {
    const saldo = calcularSaldoInsoluto(c.id, amortizaciones);
    map.set(c.acreditado, (map.get(c.acreditado) ?? 0) + saldo);
  }
  return Array.from(map.entries())
    .map(([acreditado, saldo]) => ({ acreditado, saldo }))
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, n);
}

export function proximoCupon(
  creditoId: string,
  amortizaciones: AmortRow[]
): AmortRow | null {
  const hoy = format(new Date(), "yyyy-MM-dd");
  return (
    amortizaciones.find(
      (a) => a.credito_id === creditoId && !a.pagado && a.fecha_pago >= hoy
    ) ?? null
  );
}
