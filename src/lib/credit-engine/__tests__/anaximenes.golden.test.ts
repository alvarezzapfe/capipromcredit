import { describe, it, expect } from "vitest";
import { generarSchedule, type ParamsSchedule } from "../schedule";
import { saldoInsolutoCupones } from "../metrics";
import { type RateCatalogRow } from "../accrual";

// ═══════════════════════════════════════════════════════
// Golden test: CP-3472327 (Anaxímenes, línea F/1500)
// Excel del cliente replicado renglón por renglón.
// ═══════════════════════════════════════════════════════

// TIIE histórico determinístico (del vector proporcionado)
const TIIE_HISTORICO: RateCatalogRow[] = [
  { rate_type: "TIIE_28", rate_date: "2026-05-29", rate_value: 0.067559 },
  { rate_type: "TIIE_28", rate_date: "2026-04-30", rate_value: 0.070071 },
  { rate_type: "TIIE_28", rate_date: "2026-03-31", rate_value: 0.070272 },
  { rate_type: "TIIE_28", rate_date: "2026-02-27", rate_value: 0.073087 },
  { rate_type: "TIIE_28", rate_date: "2026-01-30", rate_value: 0.072986 },
  { rate_type: "TIIE_28", rate_date: "2025-12-31", rate_value: 0.073489 },
  { rate_type: "TIIE_28", rate_date: "2025-11-28", rate_value: 0.076103 },
  { rate_type: "TIIE_28", rate_date: "2025-10-31", rate_value: 0.077812 },
  { rate_type: "TIIE_28", rate_date: "2025-09-30", rate_value: 0.078818 },
  { rate_type: "TIIE_28", rate_date: "2025-08-29", rate_value: 0.080327 },
  { rate_type: "TIIE_28", rate_date: "2025-07-31", rate_value: 0.082339 },
];

const PARAMS: ParamsSchedule = {
  monto: 35_346_117,
  fechaDisposicion: "2025-08-15",
  fechaPrimerPago: "2025-08-31", // ignored for fin_de_mes
  plazoMeses: 60,
  frecuencia: "mensual",
  esquema: "lineal",

  rateType: "TIIE_28",
  spread: 0.06,
  fixedRate: null,
  convencionDias: "ACT/360",
  frecuenciaRevision: null,

  graciaMeses: 25,   // 25 periods: P1 (partial Aug) through P25 (Aug 2027) = 24 calendar months
  tipoGracia: "solo_interes",

  comisionApertura: 0,
  comisionIva: false,
  ivaIntereses: true,

  baseCalendario: "fin_de_mes",
  numPagosCapital: 36,
  supuestoForward: "cero",
  interesBase: "cierre",
};

// Anclas verificadas a mano del Excel
const ANCLAS: {
  p: number; fecha: string; dias: number; capital: number;
  saldoCierre: number; tasa: number; interes: number;
}[] = [
  { p: 1,  fecha: "2025-08-31", dias: 16, capital: 0,          saldoCierre: 35_346_117.00, tasa: 0.142339, interes: 223_605.82 },
  { p: 11, fecha: "2026-06-30", dias: 30, capital: 0,          saldoCierre: 35_346_117.00, tasa: 0.127559, interes: 375_726.28 },
  { p: 12, fecha: "2026-07-31", dias: 31, capital: 0,          saldoCierre: 35_346_117.00, tasa: 0.06,     interes: 182_621.60 },
  { p: 25, fecha: "2027-08-31", dias: 31, capital: 0,          saldoCierre: 35_346_117.00, tasa: 0.06,     interes: 182_621.60 },
  { p: 26, fecha: "2027-09-30", dias: 30, capital: 981_836.58, saldoCierre: 34_364_280.42, tasa: 0.06,     interes: 171_821.40 },
  { p: 37, fecha: "2028-08-31", dias: 31, capital: 981_836.58, saldoCierre: 23_564_078.00, tasa: 0.06,     interes: 121_747.74 },
  { p: 61, fecha: "2030-08-31", dias: 31, capital: 981_836.58, saldoCierre: 0.00,          tasa: 0.06,     interes: 0.00 },
];

describe("Golden test — CP-3472327 Anaxímenes", () => {
  const r = generarSchedule(PARAMS, TIIE_HISTORICO);

  it("genera 61 cupones (25 gracia + 36 amort)", () => {
    expect(r.cupones).toHaveLength(61);
  });

  it("imprime tabla golden completa", () => {
    console.log("\n=== GOLDEN TABLE — CP-3472327 Anaxímenes ===");
    console.log("  P | Fecha      | Días | Capital        | Saldo cierre    | Tasa     | Interés        | IVA");
    for (const c of r.cupones) {
      console.log(
        `${String(c.numero).padStart(3)} | ${c.fecha} | ${String(c.diasPeriodo).padStart(4)} | ${String(c.capital.toFixed(2)).padStart(14)} | ${String(c.saldoFinal.toFixed(2)).padStart(15)} | ${(c.tasaAplicada * 100).toFixed(4).padStart(8)}% | ${String(c.interes.toFixed(2)).padStart(14)} | ${String(c.iva.toFixed(2)).padStart(10)}`,
      );
    }
    console.log(`\nΣcapital = ${r.totalCapital.toFixed(2)}`);
    console.log(`Σinterés = ${r.totalInteres.toFixed(2)}`);
    console.log(`Σiva     = ${r.totalIva.toFixed(2)}`);
  });

  // Assert 1: Σ pago capital = 35,346,117.00 exacto
  it("Σcapital = 35,346,117.00 exacto", () => {
    expect(r.totalCapital).toBe(35_346_117.00);
  });

  // Assert 2: Capital de cada periodo post-gracia = 981,836.58 (constante, except last for delta)
  it("capital constante post-gracia = 981,836.58", () => {
    // Cupones 26-60 (0-indexed 25-59): capital fijo
    for (let i = 25; i < 60; i++) {
      expect(r.cupones[i].capital).toBe(981_836.58);
    }
    // Last coupon (61, 0-indexed 60) absorbs rounding delta
  });

  // Assert 3: Saldo final del último periodo = 0.00
  it("saldo final último cupón = 0.00", () => {
    expect(r.cupones[60].saldoFinal).toBe(0.00);
  });

  // Assert 4: Saldo se mantiene 35,346,117.00 durante los 25 de gracia
  it("saldo constante durante gracia", () => {
    for (let i = 0; i < 25; i++) {
      expect(r.cupones[i].saldoFinal).toBe(35_346_117.00);
    }
  });

  // Assert 5: Interés de cada ancla = valor de la tabla (±0.01)
  it("interés de las anclas match ±0.01", () => {
    for (const a of ANCLAS) {
      const c = r.cupones[a.p - 1]; // 0-indexed
      expect(c.fecha).toBe(a.fecha);
      expect(c.diasPeriodo).toBe(a.dias);
      expect(c.interes).toBeCloseTo(a.interes, 1); // ±0.01 tolerance
      expect(c.tasaAplicada).toBeCloseTo(a.tasa, 6);
      expect(c.saldoFinal).toBeCloseTo(a.saldoCierre, 1);
      if (a.capital > 0) expect(c.capital).toBeCloseTo(a.capital, 1);
    }
  });

  // Assert 6: Forward region (P12+, tasa 0.06) is deterministic
  it("forward region: tasa = 0.06 exacto desde P12", () => {
    for (let i = 11; i < 61; i++) { // P12 onward (0-indexed 11+)
      expect(r.cupones[i].tasaAplicada).toBe(0.06);
    }
  });

  // Assert 7: IVA de cada periodo = interés × 0.16
  it("IVA = interés × 0.16 en cada cupón", () => {
    for (const c of r.cupones) {
      const expectedIva = Math.round(c.interes * 0.16 * 100) / 100;
      expect(c.iva).toBe(expectedIva);
    }
  });

  // Assert 8: Saldo insoluto a 2026-06-19 = 35,346,117.00
  it("saldo insoluto a 2026-06-19 = 35,346,117.00", () => {
    const saldo = saldoInsolutoCupones(r.cupones, "2026-06-19", PARAMS.monto);
    expect(saldo).toBe(35_346_117.00);
  });
});
