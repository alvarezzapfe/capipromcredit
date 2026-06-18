// =====================================================================
// CapiProm — Métricas institucionales: CAT, TIR, Duración
//
// CAT (Banxico): Resolver CAT tal que
//   desembolso_neto = Σ flujo_j / (1 + CAT)^(d_j/365)
//   donde CAT ya ES la tasa anual efectiva (sin elevar a 365).
//
// TIR: misma ecuación NPV = 0 con flujos netos.
//
// Solver: Newton-Raphson con fallback a bisección.
// =====================================================================

import { type CuponSchedule } from "./schedule";

// ── Helpers ────────────────────────────────────────────

function diffDias(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000,
  );
}

/** Σ flujo_j / (1+r)^(d_j/365) */
function npv(
  flujos: { monto: number; dias: number }[],
  r: number,
): number {
  let sum = 0;
  for (const f of flujos) {
    sum += f.monto / Math.pow(1 + r, f.dias / 365);
  }
  return sum;
}

/** d/dr [ Σ flujo_j / (1+r)^(d_j/365) ] */
function npvPrime(
  flujos: { monto: number; dias: number }[],
  r: number,
): number {
  let sum = 0;
  for (const f of flujos) {
    const t = f.dias / 365;
    sum += -f.monto * t / Math.pow(1 + r, t + 1);
  }
  return sum;
}

// ── Solver ─────────────────────────────────────────────

const MAX_ITER = 200;
const TOL = 1e-10;

/** Newton-Raphson + bisection fallback.
 *  Finds r such that npv(flujos, r) - target = 0.
 */
function solve(
  flujos: { monto: number; dias: number }[],
  target: number,
  semilla: number,
): number {
  // Newton-Raphson
  let r = semilla;
  for (let i = 0; i < MAX_ITER; i++) {
    const f = npv(flujos, r) - target;
    if (Math.abs(f) < TOL) return r;
    const fp = npvPrime(flujos, r);
    if (Math.abs(fp) < 1e-15) break; // derivative too small
    const rNew = r - f / fp;
    if (rNew <= -1) break; // diverging
    if (!isFinite(rNew)) break;
    r = rNew;
  }

  // Fallback: bisection on [0, 10] (0% to 1000%)
  let lo = -0.5;
  let hi = 10;
  const fLo = npv(flujos, lo) - target;
  const fHi = npv(flujos, hi) - target;
  if (fLo * fHi > 0) {
    // Can't bracket — expand range
    hi = 50;
  }

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(flujos, mid) - target;
    if (Math.abs(fMid) < TOL || (hi - lo) < TOL) return mid;
    const fLoVal = npv(flujos, lo) - target;
    if (fLoVal * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

// ── CAT (Costo Anual Total — Banxico) ──────────────────

/**
 * Calcula el CAT según metodología Banxico.
 *
 * Ecuación: desembolso_neto = Σ flujo_j / (1+CAT)^(d_j/365)
 *
 * @param cupones     Tabla de amortización
 * @param monto       Monto dispuesto (capital original)
 * @param comisionNeta Comisión de apertura incluyendo IVA si aplica (resta del desembolso)
 * @param fechaDisposicion Fecha de disposición
 * @returns CAT como decimal (0.28 = 28%)
 */
export function calcularCAT(
  cupones: CuponSchedule[],
  monto: number,
  comisionNeta: number,
  fechaDisposicion: string,
): number {
  const desembolsoNeto = monto - comisionNeta;
  if (desembolsoNeto <= 0) return 0;

  // Flujos: pagos del acreditado (incluyen IVA si aplica)
  const flujos = cupones
    .filter((c) => c.pagoTotal > 0)
    .map((c) => ({
      monto: c.pagoTotal,
      dias: diffDias(fechaDisposicion, c.fecha),
    }));

  if (flujos.length === 0) return 0;

  // Semilla: tasa nominal del primer cupón
  const semilla = cupones[0]?.tasaAplicada ?? 0.20;

  return solve(flujos, desembolsoNeto, semilla);
}

// ── TIR (Tasa Interna de Retorno) ──────────────────────

/**
 * TIR del crédito desde perspectiva del acreedor.
 *
 * Flujo_0 = -monto (desembolso), flujos positivos = pagos recibidos.
 * Resuelve: 0 = -monto + Σ pago_j / (1+TIR)^(d_j/365)
 *
 * @returns TIR como decimal (0.24 = 24%)
 */
export function calcularTIR(
  cupones: CuponSchedule[],
  monto: number,
  fechaDisposicion: string,
): number {
  if (monto <= 0) return 0;

  const flujos = cupones
    .filter((c) => c.pagoTotal > 0)
    .map((c) => ({
      monto: c.pagoTotal,
      dias: diffDias(fechaDisposicion, c.fecha),
    }));

  if (flujos.length === 0) return 0;

  const semilla = cupones[0]?.tasaAplicada ?? 0.20;
  return solve(flujos, monto, semilla);
}

// ── Duración ───────────────────────────────────────────

export interface DuracionResult {
  macaulay: number;   // en años
  modificada: number; // en años
}

/**
 * Duración de Macaulay y duración modificada.
 *
 * D_mac = Σ(t_j × PV_j) / Σ(PV_j)
 * donde t_j = d_j/365 (tiempo en años), PV_j = flujo_j / (1+y)^t_j
 *
 * D_mod = D_mac / (1 + y)
 *
 * @param tir TIR anualizada (resultado de calcularTIR)
 */
export function calcularDuracion(
  cupones: CuponSchedule[],
  tir: number,
  fechaDisposicion: string,
): DuracionResult {
  let sumPV = 0;
  let sumTPV = 0;

  for (const c of cupones) {
    if (c.pagoTotal <= 0) continue;
    const d = diffDias(fechaDisposicion, c.fecha);
    const t = d / 365; // time in years
    const pv = c.pagoTotal / Math.pow(1 + tir, t);
    sumPV += pv;
    sumTPV += t * pv;
  }

  if (sumPV === 0) return { macaulay: 0, modificada: 0 };

  const macaulay = sumTPV / sumPV;
  const modificada = macaulay / (1 + tir);

  return {
    macaulay: Math.round(macaulay * 10000) / 10000,
    modificada: Math.round(modificada * 10000) / 10000,
  };
}

// ── Saldo insoluto a una fecha ─────────────────────────

/**
 * Saldo insoluto a `fechaCorte`: saldo_final del último cupón con fecha <= fechaCorte.
 * Si la fecha es anterior al primer cupón, devuelve el monto original.
 * Si es posterior al último, devuelve el saldo final del último cupón.
 */
export function saldoInsolutoCupones(
  cupones: CuponSchedule[],
  fechaCorte: string,
  monto: number,
): number {
  let saldo = monto;
  for (const c of cupones) {
    if (c.fecha > fechaCorte) break;
    saldo = c.saldoFinal;
  }
  return Math.round(saldo * 100) / 100;
}

// ── NPV de flujos restantes ────────────────────────────

/**
 * Valor presente neto de los flujos futuros a partir de `fechaCorte`.
 *
 * NPV = Σ pago_j / (1 + tasaDescuento)^(d_j/365)
 *
 * donde d_j = días desde fechaCorte hasta la fecha del cupón j,
 * y solo se suman cupones con fecha > fechaCorte.
 *
 * A la tasa del crédito: NPV ≈ saldo insoluto.
 * A tasa de mercado distinta: refleja premio/descuento.
 */
export function calcularNPV(
  cupones: CuponSchedule[],
  tasaDescuento: number,
  fechaCorte: string,
): number {
  let sum = 0;
  for (const c of cupones) {
    if (c.fecha <= fechaCorte) continue;
    if (c.pagoTotal <= 0) continue;
    const d = diffDias(fechaCorte, c.fecha);
    sum += c.pagoTotal / Math.pow(1 + tasaDescuento, d / 365);
  }
  return Math.round(sum * 100) / 100;
}
