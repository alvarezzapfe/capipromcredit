// =====================================================================
// CapiProm — Motor de amortización
// Métodos: Lineal, Bullet, Creciente (gradiente aritmético)
// =====================================================================

export type Frecuencia = "mensual" | "quincenal" | "semanal";
export type MetodoAmort = "lineal" | "bullet" | "creciente";

export interface Cupon {
  numero_cupon: number;
  fecha_pago: string; // ISO yyyy-mm-dd
  saldo_inicial: number;
  capital: number;
  interes: number;
  pago_total: number;
  saldo_final: number;
}

export interface ParamsCredito {
  monto: number;
  tasaAnual: number; // 0.24 = 24%
  plazoMeses: number;
  frecuencia: Frecuencia;
  metodo: MetodoAmort;
  fechaOrigen: string; // ISO yyyy-mm-dd
  crecimientoPeriodo?: number; // solo para creciente, default 0.05
}

const PERIODOS_POR_ANIO: Record<Frecuencia, number> = {
  mensual: 12,
  quincenal: 24,
  semanal: 52,
};

function rd(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaCupon(origen: string, frecuencia: Frecuencia, periodo: number): string {
  const d = new Date(origen + "T00:00:00");
  if (frecuencia === "mensual") {
    d.setMonth(d.getMonth() + periodo);
  } else if (frecuencia === "quincenal") {
    d.setDate(d.getDate() + 15 * periodo);
  } else {
    d.setDate(d.getDate() + 7 * periodo);
  }
  return d.toISOString().slice(0, 10);
}

function numeroCupones(plazoMeses: number, frecuencia: Frecuencia): number {
  if (frecuencia === "mensual") return plazoMeses;
  if (frecuencia === "quincenal") return plazoMeses * 2;
  return Math.round((plazoMeses * 52) / 12);
}

export function generarTablaAmortizacion(p: ParamsCredito): Cupon[] {
  const n = numeroCupones(p.plazoMeses, p.frecuencia);
  const tasaPeriodo = p.tasaAnual / PERIODOS_POR_ANIO[p.frecuencia];

  if (p.metodo === "lineal") return generarLineal(p, n, tasaPeriodo);
  if (p.metodo === "bullet") return generarBullet(p, n, tasaPeriodo);
  return generarCreciente(p, n, tasaPeriodo);
}

// -----------------------------------------------------------------
// LINEAL: capital constante, interés sobre saldo decreciente
// -----------------------------------------------------------------
function generarLineal(p: ParamsCredito, n: number, tasaPeriodo: number): Cupon[] {
  const cupones: Cupon[] = [];
  const capitalFijo = p.monto / n; // sin redondear en intermedio
  let saldo = p.monto;

  for (let i = 1; i <= n; i++) {
    const interes = rd(saldo * tasaPeriodo);
    const capital = i === n ? rd(saldo) : rd(capitalFijo);
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({
      numero_cupon: i,
      fecha_pago: fechaCupon(p.fechaOrigen, p.frecuencia, i),
      saldo_inicial: rd(saldo),
      capital,
      interes,
      pago_total: rd(capital + interes),
      saldo_final: saldoFinal,
    });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// BULLET: solo interés cada periodo, capital al final
// -----------------------------------------------------------------
function generarBullet(p: ParamsCredito, n: number, tasaPeriodo: number): Cupon[] {
  const cupones: Cupon[] = [];
  let saldo = p.monto;

  for (let i = 1; i <= n; i++) {
    const interes = rd(saldo * tasaPeriodo);
    const capital = i === n ? rd(saldo) : 0;
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({
      numero_cupon: i,
      fecha_pago: fechaCupon(p.fechaOrigen, p.frecuencia, i),
      saldo_inicial: rd(saldo),
      capital,
      interes,
      pago_total: rd(capital + interes),
      saldo_final: saldoFinal,
    });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// CRECIENTE: gradiente aritmético, cuotas crecen g% por periodo
// pago_1 = monto / Σ_{k=0}^{n-1} (1+g)^k / (1+i)^{k+1}
// -----------------------------------------------------------------
function generarCreciente(p: ParamsCredito, n: number, tasaPeriodo: number): Cupon[] {
  const g = p.crecimientoPeriodo ?? 0.05;
  const i = tasaPeriodo;

  // Factor de anualidad creciente
  let sumFactor = 0;
  for (let k = 0; k < n; k++) {
    sumFactor += Math.pow(1 + g, k) / Math.pow(1 + i, k + 1);
  }

  const pago1 = p.monto / sumFactor; // sin redondear

  const cupones: Cupon[] = [];
  let saldo = p.monto;

  for (let k = 1; k <= n; k++) {
    const pagoTotal = pago1 * Math.pow(1 + g, k - 1);
    const interes = saldo * i; // sin redondear en intermedio
    let capital = pagoTotal - interes;

    if (capital < 0 && k < n) {
      throw new Error(
        `Creciente: en el periodo ${k} el capital es negativo ($${rd(capital)}). ` +
          `La tasa periódica (${rd(i * 100)}%) supera la cuota. ` +
          `Aumenta el crecimiento por periodo o reduce la tasa.`
      );
    }

    // Último periodo: ajusta para liquidar saldo exactamente
    if (k === n) {
      capital = saldo;
    }

    const saldoFinal = Math.max(0, saldo - capital);

    cupones.push({
      numero_cupon: k,
      fecha_pago: fechaCupon(p.fechaOrigen, p.frecuencia, k),
      saldo_inicial: rd(saldo),
      capital: rd(capital),
      interes: rd(interes),
      pago_total: k === n ? rd(capital + interes) : rd(pagoTotal),
      saldo_final: rd(saldoFinal),
    });

    saldo = saldoFinal;
  }

  return cupones;
}

// -----------------------------------------------------------------
// Helpers de resumen (sin cambios funcionales)
// -----------------------------------------------------------------
export interface ResumenCredito {
  saldoInsoluto: number;
  proximoCupon: Cupon | null;
  diasAlProximoCupon: number | null;
  cuponesVencidos: number;
  interesTotal: number;
}

export function resumirCredito(cupones: Cupon[]): ResumenCredito {
  const hoy = new Date().toISOString().slice(0, 10);
  const proximo = cupones.find((c) => c.fecha_pago >= hoy) ?? null;
  const vencidos = cupones.filter((c) => c.fecha_pago < hoy).length;
  const interesTotal = rd(cupones.reduce((s, c) => s + c.interes, 0));
  const saldoInsoluto = cupones.length ? cupones[0].saldo_inicial : 0;

  let dias: number | null = null;
  if (proximo) {
    const ms =
      new Date(proximo.fecha_pago + "T00:00:00").getTime() -
      new Date(hoy + "T00:00:00").getTime();
    dias = Math.round(ms / (1000 * 60 * 60 * 24));
  }

  return { saldoInsoluto, proximoCupon: proximo, diasAlProximoCupon: dias, cuponesVencidos: vencidos, interesTotal };
}
