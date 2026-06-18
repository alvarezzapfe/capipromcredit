import { describe, it, expect } from "vitest";
import {
  generarSchedule,
  diffDiasACT,
  diffDias30E360,
  contarDias,
  baseDias,
  type ParamsSchedule,
} from "../schedule";

// ── Day count helpers ──

describe("diffDiasACT", () => {
  it("31 days Jan→Feb", () => expect(diffDiasACT("2026-01-15", "2026-02-15")).toBe(31));
  it("28 days Feb→Mar (non-leap)", () => expect(diffDiasACT("2026-02-15", "2026-03-15")).toBe(28));
  it("365 days year", () => expect(diffDiasACT("2026-01-15", "2027-01-15")).toBe(365));
  it("29 days Feb→Mar (leap)", () => expect(diffDiasACT("2024-02-15", "2024-03-15")).toBe(29));
});

describe("diffDias30E360", () => {
  it("30 days for any month", () => expect(diffDias30E360("2026-01-15", "2026-02-15")).toBe(30));
  it("360 days for a year", () => expect(diffDias30E360("2026-01-15", "2027-01-15")).toBe(360));
  it("clamps day 31 to 30", () => expect(diffDias30E360("2026-01-31", "2026-02-28")).toBe(28));
});

describe("baseDias / contarDias", () => {
  it("ACT/360 base=360", () => expect(baseDias("ACT/360")).toBe(360));
  it("ACT/365 base=365", () => expect(baseDias("ACT/365")).toBe(365));
  it("30E/360 base=360", () => expect(baseDias("30E/360")).toBe(360));
  it("contarDias routes to 30E", () => expect(contarDias("2026-01-15", "2026-02-15", "30E/360")).toBe(30));
  it("contarDias routes to ACT", () => expect(contarDias("2026-01-15", "2026-02-15", "ACT/360")).toBe(31));
});

// ── Base params ──

const BASE: ParamsSchedule = {
  monto: 100_000,
  fechaDisposicion: "2026-01-15",
  fechaPrimerPago: "2026-02-15",
  plazoMeses: 12,
  frecuencia: "mensual",
  esquema: "frances",
  rateType: null,
  spread: null,
  fixedRate: 0.24,
  convencionDias: "ACT/360",
  frecuenciaRevision: null,
  graciaMeses: 0,
  tipoGracia: "sin_pago",
  comisionApertura: 0,
  comisionIva: false,
  ivaIntereses: false,
};

// ── Francés ACT/360 ──

describe("generarSchedule — francés fija ACT/360", () => {
  const r = generarSchedule(BASE);

  it("12 cupones", () => expect(r.cupones).toHaveLength(12));

  it("primer cupón: 31 días de interés", () => {
    const c1 = r.cupones[0];
    expect(c1.diasPeriodo).toBe(31);
    // interest = 100000 × 0.24 × 31/360 = 2066.67
    expect(c1.interes).toBeCloseTo(2066.67, 1);
    expect(c1.saldoInicial).toBe(100_000);
  });

  it("Σcapital = monto exacto", () => {
    expect(r.totalCapital).toBe(100_000);
  });

  it("último cupón saldo final = 0", () => {
    expect(r.cupones[11].saldoFinal).toBe(0);
  });

  it("interés total razonable (12-15k para 100k@24%)", () => {
    expect(r.totalInteres).toBeGreaterThan(12_000);
    expect(r.totalInteres).toBeLessThan(16_000);
  });

  it("sin IVA ni comisiones", () => {
    expect(r.totalIva).toBe(0);
    expect(r.totalComisiones).toBe(0);
  });

  it("saldo siempre decreciente", () => {
    for (let i = 1; i < r.cupones.length; i++) {
      expect(r.cupones[i].saldoInicial).toBeLessThanOrEqual(r.cupones[i - 1].saldoInicial);
    }
  });

  it("ningún interés negativo", () => {
    for (const c of r.cupones) expect(c.interes).toBeGreaterThanOrEqual(0);
  });
});

// ── Francés ACT/365 ──

describe("generarSchedule — francés fija ACT/365", () => {
  const r = generarSchedule({ ...BASE, convencionDias: "ACT/365" });

  it("primer cupón interés = 100000×0.24×31/365", () => {
    expect(r.cupones[0].interes).toBeCloseTo(100_000 * 0.24 * 31 / 365, 1);
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── 30E/360 ──

describe("generarSchedule — francés fija 30E/360", () => {
  const r = generarSchedule({ ...BASE, convencionDias: "30E/360" });

  it("todos los cupones 30 días", () => {
    for (const c of r.cupones) expect(c.diasPeriodo).toBe(30);
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── Lineal ──

describe("generarSchedule — lineal", () => {
  const r = generarSchedule({ ...BASE, esquema: "lineal" });

  it("capital constante ≈ 100000/12", () => {
    const c1 = r.cupones[0].capital;
    const c6 = r.cupones[5].capital;
    expect(c1).toBeCloseTo(100_000 / 12, 0);
    expect(c6).toBeCloseTo(c1, 0);
  });

  it("pago decreciente", () => {
    expect(r.cupones[0].pagoTotal).toBeGreaterThan(r.cupones[10].pagoTotal);
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── Bullet ──

describe("generarSchedule — bullet", () => {
  const r = generarSchedule({ ...BASE, esquema: "bullet" });

  it("capital = 0 en cupones intermedios", () => {
    for (let i = 0; i < 11; i++) expect(r.cupones[i].capital).toBe(0);
  });

  it("todo el capital en el último", () => {
    expect(r.cupones[11].capital).toBe(100_000);
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── Creciente ──

describe("generarSchedule — creciente", () => {
  const r = generarSchedule({ ...BASE, esquema: "creciente", crecimientoPct: 5 });

  it("pagos crecientes", () => {
    const p1 = r.cupones[0].pagoTotal;
    const p12 = r.cupones[11].pagoTotal;
    expect(p12).toBeGreaterThan(p1);
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── Gracia: solo_interes ──

describe("generarSchedule — gracia solo_interes 3m", () => {
  const r = generarSchedule({ ...BASE, graciaMeses: 3, tipoGracia: "solo_interes" });

  it("12 cupones total", () => expect(r.cupones).toHaveLength(12));

  it("primeros 3 cupones: capital = 0", () => {
    for (let i = 0; i < 3; i++) expect(r.cupones[i].capital).toBe(0);
  });

  it("primeros 3 cupones: interés > 0, pago = interes", () => {
    for (let i = 0; i < 3; i++) {
      expect(r.cupones[i].interes).toBeGreaterThan(0);
      expect(r.cupones[i].pagoTotal).toBe(r.cupones[i].interes);
    }
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── Gracia: capitaliza_interes ──

describe("generarSchedule — gracia capitaliza 3m", () => {
  const r = generarSchedule({ ...BASE, graciaMeses: 3, tipoGracia: "capitaliza_interes" });

  it("saldo crece durante gracia", () => {
    expect(r.cupones[2].saldoFinal).toBeGreaterThan(100_000);
  });

  it("primeros 3: pago = 0", () => {
    for (let i = 0; i < 3; i++) expect(r.cupones[i].pagoTotal).toBe(0);
  });

  it("saldo final = 0", () => {
    expect(r.cupones[11].saldoFinal).toBe(0);
  });
});

// ── Gracia: sin_pago ──

describe("generarSchedule — gracia sin_pago 3m", () => {
  const r = generarSchedule({ ...BASE, graciaMeses: 3, tipoGracia: "sin_pago" });

  it("primeros 3: pago = 0, interes calculado", () => {
    for (let i = 0; i < 3; i++) {
      expect(r.cupones[i].pagoTotal).toBe(0);
      expect(r.cupones[i].interes).toBeGreaterThan(0);
    }
  });

  it("saldo no cambia durante gracia sin_pago", () => {
    expect(r.cupones[0].saldoFinal).toBe(100_000);
    expect(r.cupones[2].saldoFinal).toBe(100_000);
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── INT_CAPDIF preset ──

describe("generarSchedule — int_capdif", () => {
  const r = generarSchedule({
    ...BASE,
    esquema: "int_capdif",
    graciaMeses: 6,
    tipoGracia: "sin_pago", // preset overrides to solo_interes
  });

  it("primeros 6: capital = 0, pero pago = interes (solo_interes override)", () => {
    for (let i = 0; i < 6; i++) {
      expect(r.cupones[i].capital).toBe(0);
      expect(r.cupones[i].pagoTotal).toBeCloseTo(r.cupones[i].interes, 1);
    }
  });

  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
  it("saldo final = 0", () => expect(r.cupones[11].saldoFinal).toBe(0));
});

// ── IVA sobre intereses ──

describe("generarSchedule — IVA sobre intereses", () => {
  const r = generarSchedule({ ...BASE, ivaIntereses: true });

  it("IVA = 16% del interés en cada cupón", () => {
    for (const c of r.cupones) {
      expect(c.iva).toBeCloseTo(c.interes * 0.16, 1);
    }
  });

  it("totalIva > 0", () => expect(r.totalIva).toBeGreaterThan(0));
  it("pagoTotal incluye IVA", () => {
    const c = r.cupones[0];
    expect(c.pagoTotal).toBeCloseTo(c.capital + c.interes + c.iva, 1);
  });
});

// ── Comisión de apertura ──

describe("generarSchedule — comisión apertura con IVA", () => {
  const r = generarSchedule({ ...BASE, comisionApertura: 2000, comisionIva: true });

  it("comisión con IVA = 2000 * 1.16 = 2320", () => {
    expect(r.comisionAperturaConIva).toBe(2320);
  });

  it("totalPagar incluye comisión", () => {
    const sumPagos = r.cupones.reduce((s, c) => s + c.pagoTotal, 0);
    expect(r.totalPagar).toBeCloseTo(Math.round((sumPagos + 2320) * 100) / 100, 0);
  });
});

// ── Frecuencias extendidas ──

describe("generarSchedule — trimestral", () => {
  const r = generarSchedule({ ...BASE, frecuencia: "trimestral", plazoMeses: 12 });

  it("4 cupones (12 meses / 3)", () => expect(r.cupones).toHaveLength(4));
  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
  it("primer cupón: días desde disposición a primer pago", () => {
    // Jan 15 → Feb 15 = 31 days (disposición a primer pago)
    expect(r.cupones[0].diasPeriodo).toBe(31);
  });
  it("cupones 2+ ~90 días entre pagos", () => {
    // Feb 15 → May 15 = ~89 days
    expect(r.cupones[1].diasPeriodo).toBeGreaterThanOrEqual(87);
    expect(r.cupones[1].diasPeriodo).toBeLessThanOrEqual(92);
  });
});

describe("generarSchedule — semestral", () => {
  const r = generarSchedule({ ...BASE, frecuencia: "semestral", plazoMeses: 24 });

  it("4 cupones (24 meses / 6)", () => expect(r.cupones).toHaveLength(4));
  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
});

// ── Tasa variable con catálogo ──

describe("generarSchedule — tasa variable TIIE_28", () => {
  const catalog = [
    { rate_type: "TIIE_28", rate_date: "2026-05-29", rate_value: 0.067559 },
    { rate_type: "TIIE_28", rate_date: "2026-04-30", rate_value: 0.069000 },
    { rate_type: "TIIE_28", rate_date: "2026-03-31", rate_value: 0.070272 },
    { rate_type: "TIIE_28", rate_date: "2026-02-27", rate_value: 0.071000 },
    { rate_type: "TIIE_28", rate_date: "2026-01-30", rate_value: 0.072000 },
    { rate_type: "TIIE_28", rate_date: "2025-12-31", rate_value: 0.073489 },
  ];

  const r = generarSchedule({
    ...BASE,
    rateType: "TIIE_28",
    spread: 0.06,
    fixedRate: null,
    frecuenciaRevision: 3, // re-amortiza cada 3 meses
  }, catalog);

  it("12 cupones", () => expect(r.cupones).toHaveLength(12));
  it("Σcapital = monto", () => expect(r.totalCapital).toBe(100_000));
  it("saldo final = 0", () => expect(r.cupones[11].saldoFinal).toBe(0));

  it("tiieReferencia presente", () => {
    expect(r.cupones[0].tiieReferencia).not.toBeNull();
  });

  it("tasaAplicada = TIIE + spread", () => {
    const c1 = r.cupones[0];
    expect(c1.tasaAplicada).toBeCloseTo(c1.tiieReferencia! + 0.06, 4);
  });
});

// ── Validaciones ──

describe("generarSchedule — validaciones", () => {
  it("plazo 0 → error", () => {
    expect(() => generarSchedule({ ...BASE, plazoMeses: 0 })).toThrow();
  });

  it("gracia >= plazo → error", () => {
    expect(() => generarSchedule({ ...BASE, graciaMeses: 12 })).toThrow();
  });

  it("int_capdif sin gracia → error", () => {
    expect(() => generarSchedule({ ...BASE, esquema: "int_capdif", graciaMeses: 0 })).toThrow();
  });
});

// ── Modalidad de interés: anticipado vs vencido ──

describe("generarSchedule — modalidad anticipado vs vencido", () => {
  const vencido = generarSchedule({ ...BASE, comisionApertura: 2000, modalidadInteres: "vencido" });
  const anticipado = generarSchedule({ ...BASE, comisionApertura: 2000, modalidadInteres: "anticipado" });

  it("mismo número de cupones", () => {
    expect(anticipado.cupones).toHaveLength(vencido.cupones.length);
  });

  it("Σcapital idéntico en ambos", () => {
    expect(anticipado.totalCapital).toBe(vencido.totalCapital);
    expect(anticipado.totalCapital).toBe(100_000);
  });

  it("saldo final = 0 en ambos", () => {
    expect(anticipado.cupones[11].saldoFinal).toBe(0);
    expect(vencido.cupones[11].saldoFinal).toBe(0);
  });

  it("interés total IDÉNTICO (anticipado NO cambia el monto, solo el timing)", () => {
    expect(anticipado.totalInteres).toBe(vencido.totalInteres);
  });

  it("interesAnticipadoInicial = I1 del vencido (cobrado en t0)", () => {
    expect(anticipado.interesAnticipadoInicial).toBe(vencido.cupones[0].interes);
    expect(anticipado.interesAnticipadoInicial).toBeGreaterThan(0);
  });

  it("vencido interesAnticipadoInicial = 0", () => {
    expect(vencido.interesAnticipadoInicial).toBe(0);
  });

  it("anticipado: cupón[0].interes = I2 del vencido (shifted)", () => {
    expect(anticipado.cupones[0].interes).toBe(vencido.cupones[1].interes);
  });

  it("anticipado: último cupón interés = 0", () => {
    expect(anticipado.cupones[11].interes).toBe(0);
  });

  it("capital idéntico por cupón", () => {
    for (let i = 0; i < 12; i++) {
      expect(anticipado.cupones[i].capital).toBe(vencido.cupones[i].capital);
    }
  });

  it("console: print comparison for review", () => {
    console.log("\n=== VENCIDO vs ANTICIPADO (CORRECTO) — $100k / 24% / 12m / ACT/360 / com $2k ===");
    console.log(`Interés anticipado en t0 (upfront): $${anticipado.interesAnticipadoInicial}`);
    console.log("Cup | Venc.Interés | Antic.Interés | Venc.Pago   | Antic.Pago");
    for (let i = 0; i < 12; i++) {
      const v = vencido.cupones[i];
      const a = anticipado.cupones[i];
      console.log(
        `${String(i + 1).padStart(3)} | ${String(v.interes).padStart(11)} | ${String(a.interes).padStart(13)} | ${String(v.pagoTotal).padStart(11)} | ${String(a.pagoTotal).padStart(10)}`
      );
    }
    console.log(`Tot | ${String(vencido.totalInteres).padStart(11)} | ${String(anticipado.totalInteres).padStart(13)} | ${String(vencido.totalPagar).padStart(11)} | ${String(anticipado.totalPagar).padStart(10)}`);
  });
});
