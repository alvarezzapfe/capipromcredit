// =====================================================================
// CapiProm — Motor de schedule institucional
// Day count exacto (ACT/360, ACT/365, 30E/360), tasa revisable vía
// accrual.ts, gracia (3 tipos), IVA, cuadre al centavo.
// Soporta: calendario fin_de_mes / aniversario, interés sobre
// apertura o cierre, supuesto_forward, numPagosCapital explícito.
// NO toca amortizacion.ts — motor paralelo para el wizard.
// =====================================================================

import {
  type RateCatalogRow,
  type CreditRateConfig,
  tasaAnual as lookupTasaAnual,
  lookupRate,
  ultimoDiaMesAnterior,
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

export type BaseCalendario = "aniversario" | "fin_de_mes";
export type InteresBase = "apertura" | "cierre";
export type SupuestoForward = "ultima_conocida" | "cero" | number;

const IVA = 0.16;

export const MESES_POR_PERIODO: Record<FrecuenciaWizard, number> = {
  mensual: 1, bimestral: 2, trimestral: 3,
  cuatrimestral: 4, semestral: 6, anual: 12,
};

// ── Params ────────────────────────────────────────────

export interface ParamsSchedule {
  monto: number;
  fechaDisposicion: string;   // YYYY-MM-DD
  fechaPrimerPago: string;    // YYYY-MM-DD (ignored if baseCalendario='fin_de_mes')
  plazoMeses: number;
  frecuencia: FrecuenciaWizard;
  esquema: EsquemaPreset;

  rateType: string | null;    // null = fija
  spread: number | null;      // decimal 0.06 = 6%
  fixedRate: number | null;   // decimal 0.15 = 15%
  convencionDias: ConvencionDias;
  frecuenciaRevision: number | null;

  graciaMeses: number;
  tipoGracia: TipoGraciaWizard;

  crecimientoPct?: number;
  valorResidual?: number;

  comisionApertura: number;
  comisionIva: boolean;
  ivaIntereses: boolean;

  modalidadInteres?: "vencido" | "anticipado";

  /** 'aniversario' (default): fechas de pago = fechaPrimerPago + N×mpp meses.
   *  'fin_de_mes': fechas de pago = último día de cada mes. Primer periodo parcial. */
  baseCalendario?: BaseCalendario;

  /** Número explícito de pagos de capital. Si null, se deduce: numCupones - numGracia. */
  numPagosCapital?: number | null;

  /** 'ultima_conocida' (default): lookupRate fallback normal.
   *  'cero': TIIE = 0 cuando no hay dato → tasa = spread solo.
   *  number: TIIE = ese valor fijo cuando no hay dato. */
  supuestoForward?: SupuestoForward;

  /** 'apertura' (default): interés sobre saldo antes de capital.
   *  'cierre': interés sobre saldo después de capital (Excel Anaxímenes). */
  interesBase?: InteresBase;
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
  interesAnticipadoInicial: number;
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

/** Last day of the month containing `fecha`. */
function finDeMes(fecha: string): string {
  const [y, m] = fecha.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Last day of the month that is `offset` months from the month of `fecha`. */
function finDeMesOffset(fecha: string, offset: number): string {
  const [y, m] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

// ── Rounding ───────────────────────────────────────────

function rd(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Rate lookup with forward support ──────────────────

function lookupTasaConForward(
  rateCfg: CreditRateConfig,
  catalog: RateCatalogRow[],
  fechaCupon: string,
  supuesto: SupuestoForward,
): { tasa: number; tiieRef: number | null } {
  if (!rateCfg.rate_type) {
    return { tasa: rateCfg.fixed_rate ?? 0, tiieRef: null };
  }

  const spread = rateCfg.spread ?? 0;
  const filtered = catalog.filter((r) => r.rate_type === rateCfg.rate_type);

  if (filtered.length === 0) {
    const ref = supuesto === "cero" ? 0 : typeof supuesto === "number" ? supuesto : 0;
    return { tasa: ref + spread, tiieRef: ref };
  }

  // tope = last day of the month BEFORE the coupon's month
  const tope = ultimoDiaMesAnterior(fechaCupon);
  // topeMonthStart = first day of the tope's month (the "reference month")
  const topeMonth = tope.slice(0, 7); // "YYYY-MM"

  // Look for a catalog entry in the reference month (same month as tope)
  const inMonth = filtered.find((r) => r.rate_date.slice(0, 7) === topeMonth);
  if (inMonth) {
    return { tasa: inMonth.rate_value + spread, tiieRef: inMonth.rate_value };
  }

  // No entry in the reference month. For 'ultima_conocida', look earlier.
  if (supuesto === "ultima_conocida") {
    const earlier = filtered.find((r) => r.rate_date <= tope);
    if (earlier) {
      return { tasa: earlier.rate_value + spread, tiieRef: earlier.rate_value };
    }
    // Absolute fallback
    const ref = filtered[0].rate_value;
    return { tasa: ref + spread, tiieRef: ref };
  }

  // 'cero' or fixed number: use forward assumption
  const ref = supuesto === "cero" ? 0 : typeof supuesto === "number" ? supuesto : 0;
  return { tasa: ref + spread, tiieRef: ref };
}

// ── Main ───────────────────────────────────────────────

export function generarSchedule(
  params: ParamsSchedule,
  catalog: RateCatalogRow[] = [],
): ResultadoSchedule {
  const mpp = MESES_POR_PERIODO[params.frecuencia];
  const baseCalendario = params.baseCalendario ?? "aniversario";
  const interesBase = params.interesBase ?? "apertura";
  const supuesto = params.supuestoForward ?? "ultima_conocida";

  // ── Number of coupons ──
  const numGracia = params.graciaMeses > 0
    ? Math.round(params.graciaMeses / mpp) : 0;

  let numAmort: number;
  let numCupones: number;

  if (params.numPagosCapital != null && params.numPagosCapital > 0) {
    numAmort = params.numPagosCapital;
    numCupones = numGracia + numAmort;
  } else {
    numCupones = Math.round(params.plazoMeses / mpp);
    numAmort = numCupones - numGracia;
  }

  if (numCupones <= 0) throw new Error("Plazo debe generar al menos 1 cupón");
  if (numGracia >= numCupones) throw new Error("Gracia debe ser menor al plazo");
  if (numAmort <= 0) throw new Error("Debe haber al menos 1 periodo de amortización");

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
  if (baseCalendario === "fin_de_mes") {
    // First coupon = last day of the month of disposition
    fechas.push(finDeMes(params.fechaDisposicion));
    for (let i = 1; i < numCupones; i++) {
      fechas.push(finDeMesOffset(params.fechaDisposicion, i * mpp));
    }
  } else {
    for (let i = 0; i < numCupones; i++) {
      fechas.push(addMeses(params.fechaPrimerPago, i * mpp));
    }
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
  const revCadaCupones = (params.frecuenciaRevision != null && params.rateType)
    ? Math.max(1, Math.round(params.frecuenciaRevision / mpp))
    : null;

  // ── Lineal: capital fijo (truncated to 2 dec) ──
  const capitalFijoLineal = esquema === "lineal"
    ? Math.trunc((params.monto - vr) / numAmort * 100) / 100
    : 0;

  // ── Build coupons ──
  const cupones: CuponSchedule[] = [];
  let saldo = params.monto;
  let currentPMT = 0;
  let pago1Creciente = 0;

  for (let i = 0; i < numCupones; i++) {
    const fecha = fechas[i];
    const fechaAnt = i === 0 ? params.fechaDisposicion : fechas[i - 1];
    const dias = contarDias(fechaAnt, fecha, conv);

    // Rate lookup with forward support
    const { tasa, tiieRef } = lookupTasaConForward(rateCfg, catalog, fecha, supuesto);

    const saldoInicial = rd(saldo);

    let capital = 0;
    let interes = 0;
    let pago = 0;

    if (i < numGracia) {
      // ── Grace: no capital payment ──
      // Interest on saldo (same for apertura/cierre since capital=0)
      interes = rd(saldo * tasa * dias / b);
      switch (tipoGracia) {
        case "solo_interes":
          pago = interes;
          break;
        case "sin_pago":
          pago = 0;
          break;
        case "capitaliza_interes":
          saldo = rd(saldo + interes);
          pago = 0;
          break;
      }
    } else {
      // ── Amortization ──
      const idx = i - numGracia;
      const remaining = numAmort - idx;
      const iNom = tasa * mpp * 30 / b;

      switch (esquema) {
        case "frances": {
          if (interesBase === "cierre") {
            // French with interest on closing balance is complex;
            // for now use standard (apertura) for French
            const needsRevision = idx === 0
              || (revCadaCupones != null && idx % revCadaCupones === 0);
            if (needsRevision) {
              if (iNom === 0) currentPMT = (saldo - vr) / remaining;
              else {
                const vrPV = vr * Math.pow(1 + iNom, -remaining);
                currentPMT = (saldo - vrPV) * iNom / (1 - Math.pow(1 + iNom, -remaining));
              }
            }
            interes = rd(saldo * tasa * dias / b);
            if (i === numCupones - 1) {
              capital = rd(saldo - vr);
            } else {
              capital = rd(currentPMT - interes);
              if (capital < 0) capital = 0;
            }
          } else {
            // Standard apertura
            interes = rd(saldo * tasa * dias / b);
            const needsRevision = idx === 0
              || (revCadaCupones != null && idx % revCadaCupones === 0);
            if (needsRevision) {
              if (iNom === 0) currentPMT = (saldo - vr) / remaining;
              else {
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
          }
          pago = rd(capital + interes);
          break;
        }

        case "lineal": {
          // Capital fijo
          if (i === numCupones - 1) {
            capital = rd(saldo - vr); // absorb rounding delta
          } else {
            capital = capitalFijoLineal;
          }

          if (interesBase === "cierre") {
            // Interest on closing balance = saldo - capital
            const saldoCierre = rd(saldo - capital);
            interes = rd(saldoCierre * tasa * dias / b);
          } else {
            interes = rd(saldo * tasa * dias / b);
          }
          pago = rd(capital + interes);
          break;
        }

        case "bullet": {
          capital = (i === numCupones - 1) ? rd(saldo) : 0;
          if (interesBase === "cierre") {
            const saldoCierre = rd(saldo - capital);
            interes = rd(saldoCierre * tasa * dias / b);
          } else {
            interes = rd(saldo * tasa * dias / b);
          }
          pago = rd(capital + interes);
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
          interes = rd(saldo * tasa * dias / b);
          const pagoK = pago1Creciente * Math.pow(1 + g, idx);
          if (i === numCupones - 1) {
            capital = rd(saldo);
          } else {
            capital = rd(pagoK - interes);
            if (capital < 0) capital = 0;
          }
          pago = rd(capital + interes);
          break;
        }
      }
    }

    const iva = params.ivaIntereses ? rd(interes * IVA) : 0;
    pago = rd(pago + iva);

    if (tipoGracia !== "capitaliza_interes" || i >= numGracia) {
      saldo = rd(saldo - capital);
    }

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
      // Recalc interest on cierre if needed
      if (interesBase === "cierre" && esquema !== "frances") {
        const fechaAnt = cupones.length > 1 ? cupones[cupones.length - 2].fecha : params.fechaDisposicion;
        const dias = contarDias(fechaAnt, last.fecha, conv);
        const { tasa } = lookupTasaConForward(rateCfg, catalog, last.fecha, supuesto);
        last.interes = rd(last.saldoFinal * tasa * dias / b);
        last.iva = params.ivaIntereses ? rd(last.interes * IVA) : 0;
      }
      last.pagoTotal = rd(last.capital + last.interes + last.iva);
    }
  }

  // ── Anticipado: shift interest forward ──
  let interesAnticipadoInicial = 0;
  if (params.modalidadInteres === "anticipado" && cupones.length > 1) {
    const intereses = cupones.map((c) => c.interes);
    const ivas = cupones.map((c) => c.iva);
    interesAnticipadoInicial = intereses[0];
    for (let i = 0; i < cupones.length; i++) {
      if (i < cupones.length - 1) {
        cupones[i].interes = intereses[i + 1];
        cupones[i].iva = ivas[i + 1];
      } else {
        cupones[i].interes = 0;
        cupones[i].iva = 0;
      }
      cupones[i].pagoTotal = rd(cupones[i].capital + cupones[i].interes + cupones[i].iva);
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
  const interesEnCupones = rd(cupones.reduce((s, c) => s + c.interes, 0));
  const totalInteres = rd(interesEnCupones + interesAnticipadoInicial);
  const totalIva = rd(cupones.reduce((s, c) => s + c.iva, 0));
  const totalPagos = rd(cupones.reduce((s, c) => s + c.pagoTotal, 0));

  return {
    cupones,
    totalCapital,
    totalInteres,
    totalIva,
    totalComisiones: comConIva,
    totalPagar: rd(totalPagos + comConIva + interesAnticipadoInicial),
    comisionAperturaMonto: comMonto,
    comisionAperturaConIva: comConIva,
    interesAnticipadoInicial,
  };
}
