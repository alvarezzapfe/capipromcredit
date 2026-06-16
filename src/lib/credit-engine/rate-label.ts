// =====================================================================
// CapiProm — Formato de etiqueta de tasa
// Regla dura: % limpio sin ceros sobrantes, derivado de rate_type+spread/fixed_rate
// =====================================================================

/** Nombres legibles para cada rate_type del catálogo */
const RATE_TYPE_LABEL: Record<string, string> = {
  TIIE_28: "TIIE 28",
  TIIE_91: "TIIE 91",
  TIIE_182: "TIIE 182",
  TIIE_FONDEO: "TIIE Fondeo",
};

/**
 * Formatea un decimal como porcentaje limpio (sin ceros sobrantes).
 *   fmtPct(0.06)   → "6%"
 *   fmtPct(0.035)  → "3.5%"
 *   fmtPct(0.005)  → "0.5%"
 *   fmtPct(0.15)   → "15%"
 */
export function fmtPct(decimal: number): string {
  const pct = decimal * 100;
  // parseFloat removes trailing zeros: "6.00" → "6", "3.50" → "3.5"
  return parseFloat(pct.toFixed(4)) + "%";
}

export interface RateLabelConfig {
  rate_type: string | null | undefined;
  spread?: number | null;
  fixed_rate?: number | null;
}

/**
 * Genera la etiqueta de tasa a partir de la configuración del crédito.
 *
 *   rateLabel({ rate_type: "TIIE_28", spread: 0.06 })       → "TIIE 28 + 6%"
 *   rateLabel({ rate_type: "TIIE_28", spread: 0.035 })      → "TIIE 28 + 3.5%"
 *   rateLabel({ rate_type: "TIIE_FONDEO", spread: 0.055 })  → "TIIE Fondeo + 5.5%"
 *   rateLabel({ rate_type: null, fixed_rate: 0.15 })         → "Fija 15%"
 */
export function rateLabel(cfg: RateLabelConfig): string {
  if (cfg.rate_type) {
    const name = RATE_TYPE_LABEL[cfg.rate_type] ?? cfg.rate_type.replace(/_/g, " ");
    const spreadPct = fmtPct(cfg.spread ?? 0);
    return `${name} + ${spreadPct}`;
  }
  return `Fija ${fmtPct(cfg.fixed_rate ?? 0)}`;
}
