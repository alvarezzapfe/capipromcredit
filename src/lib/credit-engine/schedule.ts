// =====================================================================
// CapiProm — Motor de schedule institucional
// Day count exacto (ACT/360, ACT/365, 30E/360), tasa revisable vía
// accrual.ts, gracia (3 tipos), IVA, cuadre al centavo.
// NO toca amortizacion.ts — motor paralelo para el wizard.
// =====================================================================

import {
  type RateCatalogRow,
  type CreditRateConfig,
  tasaAnual as lookupTasaAnual,
} from "./accrual";

// ── Types ─────────────────────────────────────────────

export type ConvencionDias = "ACT/360" | "ACT/365" | "30E/360";

export type FrecuenciaWizard =
  | "mensual" | "bimestral" | "trimestral"
  | "cuatrimestral" | "semestral" | "anual";

export type TipoGraciaWizard =
  | "sin_pago" | "solo_interes" | "capitaliza_interes";

/** Presets de esquema: int_capdif mapea a frances + solo_interes grace */
export type EsquemaPreset =
  | "frances" | "lineal" | "bullet" | "creciente" | "int_capdif";

const IVA = 0.16;

export const MESES_POR_PERIODO: Record<FrecuenciaWizard, number> = {
  mensual: 1, bimestral: 2, trimestral: 3,
  cuatrimestral: 4, semestral: 6, anual: 12,
};

// ── Params ────────────────────────────────────────────

export interface ParamsSchedule {
  monto: number;
  fechaDisposicion: string;   // YYYY-MM-DD
  fechaPrimerPago: string;    // YYYY-MM-DD
  plazoMeses: number;
  frecuencia: FrecuenciaWizard;
  esquema: EsquemaPreset;

  rateType: string | null;    // null = fija
  spread: number | null;      // decimal 0.06 = 6%
  fixedRate: number | null;   // decimal 0.15 = 15%
  convencionDias: ConvencionDias;
  /** Cada cuántos meses se relee la TIIE y se re-amortiza (solo French revisable).
   *  null = cada cupón. */
  frecuenciaRevision: number | null;

  graciaMeses: number;
  tipoGracia: TipoGraciaWizard;

  crecimientoPct?: number;    // 5 = 5% growth per period
  valorResidual?: number;

  comisionApertura: number;   // absolute amount
  comisionIva: boolean;
  ivaIntereses: boolean;
}

// ── Coupon ─────────────────────────────────────────────

export interface CuponSchedule {
  numero: number;
  fecha: string;
  saldoInicial: number;
  capital: number;
  interes: number;
  iva: number;
  pagoTotal: number;
  saldoFinal: number;
  tasaAplicada: number;
  tiieReferencia: number | null;
  diasPeriodo: number;
}

// ── Result ─────────────────────────────────────────────

export interface ResultadoSchedule {
  cupones: CuponSchedule[];
  totalCapital: number;
  totalInteres: number;
  totalIva: number;
  totalComisiones: number;
  totalPagar: number;
  comisionAperturaMonto: number;
  comisionAperturaConIva: number;
}

// ── Day count (exported for testing) ───────────────────

export function diffDiasACT(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000,
  );
}

export function diffDias30E360(a: string, b: string): number {
  const [y1, m1, d1r] = a.split("-").map(Number);
  const [y2, m2, d2r] = b.split("-").map(Number);
  const d1 = Math.min(d1r, 30);
  const d2 = Math.min(d2r, 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

export function contarDias(a: string, b: string, conv: ConvencionDias): number {
  return conv === "30E/360" ? diffDias30E360(a, b) : diffDiasACT(a, b);
}

export function baseDias(conv: ConvencionDias): number {
  return conv === "ACT/365" ? 365 : 360;
}

// ── Date util ──────────────────────────────────────────

function addMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, maxDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// ── Rounding ───────────────────────────────────────────

function rd(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main ───────────────────────────────────────────────

export function generarSchedule(
  params: ParamsSchedule,
  catalog: RateCatalogRow[] = [],
): ResultadoSchedule {
  const mpp = MESES_POR_PERIODO[params.frecuencia];
  const numCupones = Math.round(params.plazoMeses / mpp);
  if (numCupones <= 0) throw new Error("Plazo debe generar al menos 1 cupón");

  const numGracia = params.graciaMeses > 0
    ? Math.round(params.graciaMeses / mpp) : 0;
  if (numGracia >= numCupones) throw new Error("Gracia debe ser menor al plazo");

  // ── Resolve preset ──
  let esquema: "frances" | "lineal" | "bullet" | "creciente" = "frances";
  let tipoGracia = params.tipoGracia;
  switch (params.esquema) {
    case "lineal":   esquema = "lineal"; break;
    case "bullet":   esquema = "bullet"; break;
    case "creciente": esquema = "creciente"; break;
    case "int_capdif":
      esquema = "frances";
      tipoGracia = "solo_interes";
      if (numGracia === 0) throw new Error("INT_CAPDIF requiere período de gracia > 0");
      break;
  }

  // ── Coupon dates ──
  const fechas: string[] = [];
  for (let i = 0; i < numCupones; i++) {
    fechas.push(addMeses(params.fechaPrimerPago, i * mpp));
  }

  const conv = params.convencionDias;
  const b = baseDias(conv);
  const vr = params.valorResidual ?? 0;

  // ── Rate config for lookups ──
  const rateCfg: CreditRateConfig = {
    rate_type: params.rateType,
    spread: params.spread,
    fixed_rate: params.fixedRate,
    day_count_base: b,
  };

  // ── Revision schedule (French revisable) ──
  // How many coupons between re-amortizations
  const revCadaCupones = (params.frecuenciaRevision != null && params.rateType)
    ? Math.max(1, Math.round(params.frecuenciaRevision / mpp))
    : null; // null = not variable or revision every coupon

  // ── Build coupons ──
  const cupones: CuponSchedule[] = [];
  let saldo = params.monto;
  let currentPMT = 0;
  let capitalFijoLineal = 0;
  let pago1Creciente = 0;
  const numAmort = numCupones - numGracia;

  for (let i = 0; i < numCupones; i++) {
    const fecha = fechas[i];
    const fechaAnt = i === 0 ? params.fechaDisposicion : fechas[i - 1];
    const dias = contarDias(fechaAnt, fecha, conv);

    // Rate lookup
    const tasa = lookupTasaAnual(rateCfg, catalog, fecha);
    const tiieRef = params.rateType ? tasa - (params.spread ?? 0) : null;

    const saldoInicial = rd(saldo);
    const interes = rd(saldo * tasa * dias / b);
    const iva = params.ivaIntereses ? rd(interes * IVA) : 0;

    let capital = 0;
    let pago = 0;

    if (i < numGracia) {
      // ── Grace ──
      switch (tipoGracia) {
        case "solo_interes":
          pago = rd(interes + iva);
          break;
        case "sin_pago":
          pago = 0; // accrues as vencido, saldo unchanged
          break;
        case "capitaliza_interes":
          saldo = rd(saldo + interes);
          pago = 0;
          break;
      }
    } else {
      // ── Amortization ──
      const idx = i - numGracia; // 0-based within amort period
      const remaining = numAmort - idx;

      // Nominal period rate for PMT (mpp×30 / base approximation)
      const iNom = tasa * mpp * 30 / b;

      switch (esquema) {
        case "frances": {
          // Re-amortize at revision points
          const needsRevision = idx === 0
            || (revCadaCupones != null && idx % revCadaCupones === 0);
          if (needsRevision) {
            if (iNom === 0) {
              currentPMT = (saldo - vr) / remaining;
            } else {
              const vrPV = vr * Math.pow(1 + iNom, -remaining);
              currentPMT = (saldo - vrPV) * iNom / (1 - Math.pow(1 + iNom, -remaining));
            }
          }
          if (i === numCupones - 1) {
            capital = rd(saldo - vr);
          } else {
            capital = rd(currentPMT - interes);
            if (capital < 0) capital = 0;
          }
          pago = rd(capital + interes + iva);
          break;
        }

        case "lineal": {
          if (idx === 0) capitalFijoLineal = rd((saldo - vr) / numAmort);
          capital = (i === numCupones - 1) ? rd(saldo - vr) : capitalFijoLineal;
          pago = rd(capital + interes + iva);
          break;
        }

        case "bullet": {
          capital = (i === numCupones - 1) ? rd(saldo) : 0;
          pago = rd(capital + interes + iva);
          break;
        }

        case "creciente": {
          const g = (params.crecimientoPct ?? 5) / 100;
          if (idx === 0) {
            let sumF = 0;
            for (let k = 0; k < numAmort; k++) {
              sumF += Math.pow(1 + g, k) / Math.pow(1 + iNom, k + 1);
            }
            pago1Creciente = saldo / sumF;
          }
          const pagoK = pago1Creciente * Math.pow(1 + g, idx);
          if (i === numCupones - 1) {
            capital = rd(saldo);
            pago = rd(capital + interes + iva);
          } else {
            capital = rd(pagoK - interes);
            if (capital < 0) capital = 0;
            pago = rd(pagoK + iva);
          }
          break;
        }
      }
    }

    saldo = rd(saldo - capital);

    cupones.push({
      numero: i + 1, fecha, saldoInicial, capital, interes, iva,
      pagoTotal: pago, saldoFinal: saldo,
      tasaAplicada: tasa, tiieReferencia: tiieRef, diasPeriodo: dias,
    });
  }

  // ── Cuadre: adjust last amort coupon so saldo_final = VR exactly ──
  if (cupones.length > 0) {
    const last = cupones[cupones.length - 1];
    const delta = rd(last.saldoFinal - vr);
    if (delta !== 0) {
      last.capital = rd(last.capital + delta);
      last.saldoFinal = rd(vr);
      last.pagoTotal = rd(last.capital + last.interes + last.iva);
    }
  }

  // Validate: no coupon with negative interest
  for (const c of cupones) {
    if (c.interes < 0) throw new Error(`Cupón ${c.numero}: interés negativo (${c.interes})`);
  }

  // ── Commission ──
  const comMonto = params.comisionApertura;
  const comConIva = params.comisionIva ? rd(comMonto * (1 + IVA)) : comMonto;

  const totalCapital = rd(cupones.reduce((s, c) => s + c.capital, 0));
  const totalInteres = rd(cupones.reduce((s, c) => s + c.interes, 0));
  const totalIva = rd(cupones.reduce((s, c) => s + c.iva, 0));
  const totalPagos = rd(cupones.reduce((s, c) => s + c.pagoTotal, 0));

  return {
    cupones,
    totalCapital,
    totalInteres,
    totalIva,
    totalComisiones: comConIva,
    totalPagar: rd(totalPagos + comConIva),
    comisionAperturaMonto: comMonto,
    comisionAperturaConIva: comConIva,
  };
}
