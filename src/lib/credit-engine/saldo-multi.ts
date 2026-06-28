// =====================================================================
// Saldo insoluto de líneas multi-disposición
// Genera schedule por disposición con el motor y suma saldos.
// Compartido entre Cartera y Resumen/Dashboard.
// =====================================================================

import {
  generarSchedule,
  MESES_POR_PERIODO,
  type ParamsSchedule,
  type FrecuenciaWizard,
  type EsquemaPreset,
  type ConvencionDias,
  type BaseCalendario,
  type InteresBase,
  type SupuestoForward,
} from "./schedule";
import { saldoInsolutoCupones } from "./metrics";
import { type RateCatalogRow } from "./accrual";
import { tipoGraciaBdToMotor } from "../format";

/** Minimal credit shape needed for multi-disposition saldo calculation. */
export interface CreditoMultiDisp {
  frecuencia: string;
  tipo_gracia: string;
  base_calendario?: string | null;
  interes_base?: string | null;
  supuesto_forward?: string | null;
  plazo_meses: number;
  esquema?: string | null;
  rate_type: string | null;
  spread: number | null;
  fixed_rate: number | null;
  convencion_dias?: string | null;
  frecuencia_revision?: number | null;
  periodo_gracia_meses: number;
  num_pagos_capital?: number | null;
}

export interface DisposicionMin {
  monto: number;
  fecha: string;
}

function addMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, maxDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * Saldo insoluto de una línea multi-disposición.
 * Genera generarSchedule() por cada disposición (monto + fecha de la disposición,
 * términos del crédito padre), calcula saldoInsolutoCupones() por cada una, y suma.
 */
export function calcularSaldoMultiDisposicion(
  c: CreditoMultiDisp,
  disps: DisposicionMin[],
  catalog: RateCatalogRow[],
  fechaCorte: string,
): number {
  if (disps.length === 0) return 0;

  const freq = (Object.keys(MESES_POR_PERIODO) as FrecuenciaWizard[]).includes(c.frecuencia as FrecuenciaWizard)
    ? (c.frecuencia as FrecuenciaWizard) : "mensual" as FrecuenciaWizard;
  const mpp = MESES_POR_PERIODO[freq];
  const tipoGracia = tipoGraciaBdToMotor(c.tipo_gracia);
  const baseCalendario = (c.base_calendario as BaseCalendario) ?? "aniversario";
  const interesBase = (c.interes_base as InteresBase) ?? "apertura";
  const supuesto: SupuestoForward = c.supuesto_forward === "cero" ? "cero" : "ultima_conocida";

  let total = 0;
  for (const d of disps) {
    const montoDisp = Number(d.monto);
    if (montoDisp <= 0) continue;
    try {
      const params: ParamsSchedule = {
        monto: montoDisp,
        fechaDisposicion: d.fecha,
        fechaPrimerPago: addMeses(d.fecha, mpp),
        plazoMeses: Number(c.plazo_meses) || 60,
        frecuencia: freq,
        esquema: (c.esquema as EsquemaPreset) || "frances",
        rateType: c.rate_type ?? null,
        spread: c.spread != null ? Number(c.spread) : null,
        fixedRate: c.fixed_rate != null ? Number(c.fixed_rate) : null,
        convencionDias: (c.convencion_dias as ConvencionDias) || "ACT/360",
        frecuenciaRevision: c.frecuencia_revision ?? null,
        graciaMeses: Number(c.periodo_gracia_meses) || 0,
        tipoGracia,
        comisionApertura: 0,
        comisionIva: false,
        ivaIntereses: false,
        baseCalendario,
        interesBase,
        supuestoForward: supuesto,
        numPagosCapital: c.num_pagos_capital ?? null,
      };
      const schedule = generarSchedule(params, catalog);
      total += saldoInsolutoCupones(schedule.cupones, fechaCorte, montoDisp);
    } catch {
      total += montoDisp;
    }
  }
  return Math.round(total * 100) / 100;
}
