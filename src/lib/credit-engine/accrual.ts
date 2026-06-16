// =====================================================================
// CapiProm — Motor de devengo: lookup de tasa y seccionamiento
// Referencia = última hábil del MES ANTERIOR a la fecha de corte
// Fallback  = última conocida anterior; error solo si catálogo vacío
// =====================================================================

export interface RateCatalogRow {
  rate_type: string;
  rate_date: string; // YYYY-MM-DD
  rate_value: number; // decimal, e.g. 0.067559
}

export interface CreditRateConfig {
  rate_type: string | null | undefined;
  spread: number | null | undefined;       // decimal 0.06 = 6%
  fixed_rate: number | null | undefined;   // decimal 0.15 = 15%
  day_count_base?: number;                 // 360 | 365, default 360
}

export interface SeccionDevengo {
  desde: string;   // YYYY-MM-DD inclusive
  hasta: string;   // YYYY-MM-DD inclusive
  dias: number;
  tasaAnual: number;  // decimal
  base: number;       // 360 | 365
}

/**
 * Devuelve el último día del mes anterior a `fechaCorte`.
 * Ejemplo: fechaCorte = "2026-06-15" → "2026-05-31"
 */
export function ultimoDiaMesAnterior(fechaCorte: string): string {
  const [y, m] = fechaCorte.split("-").map(Number);
  // Day 0 of month m = last day of month m-1
  const d = new Date(y, m - 1, 0);
  const yy = d.getFullYear();
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Busca la tasa de referencia vigente en el catálogo.
 *
 * Regla: última entrada cuya rate_date <= últimoDíaMesAnterior(fechaCorte).
 * Fallback: última conocida anterior a fechaCorte (con warning).
 * Error: solo si el catálogo está completamente vacío para ese rate_type.
 *
 * `catalog` debe venir pre-filtrado por rate_type y ordenado por rate_date DESC.
 */
export function lookupRate(
  catalog: RateCatalogRow[],
  rateType: string,
  fechaCorte: string,
  warn?: (msg: string) => void,
): number {
  if (catalog.length === 0) {
    throw new Error(`rate_catalog vacío para ${rateType}. No se puede calcular tasa.`);
  }

  const tope = ultimoDiaMesAnterior(fechaCorte);

  // Primary: última hábil <= último día del mes anterior
  const primary = catalog.find((r) => r.rate_date <= tope);
  if (primary) return primary.rate_value;

  // Fallback: última conocida anterior a fechaCorte
  const fallback = catalog.find((r) => r.rate_date < fechaCorte);
  if (fallback) {
    (warn ?? console.warn)(
      `rate_catalog: sin dato para ${rateType} al ${tope}, usando fallback ${fallback.rate_date} (${fallback.rate_value})`,
    );
    return fallback.rate_value;
  }

  // Último recurso: el registro más reciente que exista
  (warn ?? console.warn)(
    `rate_catalog: sin dato anterior a ${fechaCorte} para ${rateType}, usando el más reciente (${catalog[0].rate_date})`,
  );
  return catalog[0].rate_value;
}

/**
 * Calcula la tasa anual efectiva para un crédito.
 *  - Variable: lookupRate(catalog, rate_type, fechaCorte) + spread
 *  - Fija: fixed_rate directamente
 */
export function tasaAnual(
  cfg: CreditRateConfig,
  catalog: RateCatalogRow[],
  fechaCorte: string,
  warn?: (msg: string) => void,
): number {
  if (!cfg.rate_type) {
    return cfg.fixed_rate ?? 0;
  }
  const ref = lookupRate(catalog, cfg.rate_type, fechaCorte, warn);
  return ref + (cfg.spread ?? 0);
}

/**
 * Diferencia en días naturales entre dos fechas YYYY-MM-DD.
 */
function diffDias(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/**
 * Primer día de cada mes entre `desde` y `hasta` (inclusive de ambas).
 * Devuelve los "cortes" mensuales para seccionar el devengo.
 */
function corteMensuales(desde: string, hasta: string): string[] {
  const cortes: string[] = [desde];
  const [y0, m0] = desde.split("-").map(Number);
  const [yf, mf] = hasta.split("-").map(Number);

  let y = y0;
  let m = m0 + 1;
  while (y < yf || (y === yf && m <= mf)) {
    if (m > 12) { m = 1; y++; }
    const primer = `${y}-${String(m).padStart(2, "0")}-01`;
    if (primer > hasta) break;
    cortes.push(primer);
    m++;
  }
  return cortes;
}

/**
 * Secciona un periodo de devengo en tramos mensuales, cada uno con su tasa vigente.
 *
 * Para tasa fija devuelve un solo tramo.
 * Para tasa variable corta en cada cambio de mes (la tasa de referencia cambia mensualmente).
 */
export function seccionar(
  cfg: CreditRateConfig,
  catalog: RateCatalogRow[],
  desde: string,
  hasta: string,
  warn?: (msg: string) => void,
): SeccionDevengo[] {
  const base = cfg.day_count_base ?? 360;

  // Tasa fija: un solo tramo
  if (!cfg.rate_type) {
    const dias = diffDias(desde, hasta);
    if (dias <= 0) return [];
    return [{ desde, hasta, dias, tasaAnual: cfg.fixed_rate ?? 0, base }];
  }

  // Tasa variable: seccionar por mes
  const cortes = corteMensuales(desde, hasta);
  const secciones: SeccionDevengo[] = [];

  for (let i = 0; i < cortes.length; i++) {
    const secDesde = cortes[i];
    const secHasta = i + 1 < cortes.length ? cortes[i + 1] : hasta;
    const dias = diffDias(secDesde, secHasta);
    if (dias <= 0) continue;

    const tasa = tasaAnual(cfg, catalog, secDesde, warn);
    secciones.push({ desde: secDesde, hasta: secHasta, dias, tasaAnual: tasa, base });
  }

  return secciones;
}
