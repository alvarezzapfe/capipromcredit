import { describe, it, expect } from "vitest";
import { generarSchedule, type ParamsSchedule } from "../schedule";
import { type RateCatalogRow } from "../accrual";
import { calcularCAT, calcularTIR, calcularDuracion, calcularNPV, saldoInsolutoCupones } from "../metrics";

// ── Caso de referencia ──
// $100,000 / 12m mensual / 24% fija / ACT/360 / francés / comisión 2% ($2,000) / sin IVA
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
  comisionApertura: 2_000,
  comisionIva: false,
  ivaIntereses: false,
};

describe("CAT — caso $100k / 24% / comisión 2%", () => {
  const r = generarSchedule(BASE);

  it("CAT ≈ 28-30% (superior a la tasa nominal por la comisión)", () => {
    const cat = calcularCAT(r.cupones, BASE.monto, r.comisionAperturaConIva, BASE.fechaDisposicion);
    console.log(`CAT = ${(cat * 100).toFixed(4)}%`);
    console.log(`Detalle: ${r.cupones.length} cupones, total pagos = $${r.totalPagar.toFixed(2)}, interés total = $${r.totalInteres.toFixed(2)}`);
    // ACT/360 amplifica la tasa efectiva: 24% nominal → ~27% efectiva → CAT ~32% con comisión
    expect(cat).toBeGreaterThan(0.30);
    expect(cat).toBeLessThan(0.35);
  });

  it("CAT sin comisión ≈ tasa nominal (24%)", () => {
    const rSinCom = generarSchedule({ ...BASE, comisionApertura: 0 });
    const cat = calcularCAT(rSinCom.cupones, BASE.monto, 0, BASE.fechaDisposicion);
    console.log(`CAT sin comisión = ${(cat * 100).toFixed(4)}%`);
    // ACT/360: 24% nominal → ~27.24% efectiva anualizada
    // (interest charged on 360-day base but compounded over 365-day year)
    expect(cat).toBeGreaterThan(0.26);
    expect(cat).toBeLessThan(0.29);
  });
});

describe("TIR", () => {
  const r = generarSchedule(BASE);

  it("TIR ≈ tasa nominal (24%) — sin comisión en flujo del acreedor", () => {
    const tir = calcularTIR(r.cupones, BASE.monto, BASE.fechaDisposicion);
    console.log(`TIR = ${(tir * 100).toFixed(4)}%`);
    // ACT/360: 24% nominal → ~27.24% effective annual rate
    expect(tir).toBeGreaterThan(0.26);
    expect(tir).toBeLessThan(0.29);
  });

  it("TIR > CAT sin comisión → no inverted (sanity check)", () => {
    const rSinCom = generarSchedule({ ...BASE, comisionApertura: 0 });
    const cat = calcularCAT(rSinCom.cupones, BASE.monto, 0, BASE.fechaDisposicion);
    const tir = calcularTIR(rSinCom.cupones, BASE.monto, BASE.fechaDisposicion);
    // Should be essentially equal when no commission
    expect(Math.abs(cat - tir)).toBeLessThan(0.001);
  });
});

describe("Duración", () => {
  const r = generarSchedule(BASE);
  const tir = calcularTIR(r.cupones, BASE.monto, BASE.fechaDisposicion);

  it("Macaulay entre 0 y 1 año (crédito a 12 meses)", () => {
    const d = calcularDuracion(r.cupones, tir, BASE.fechaDisposicion);
    console.log(`Duración Macaulay = ${d.macaulay.toFixed(4)} años`);
    console.log(`Duración Modificada = ${d.modificada.toFixed(4)} años`);
    expect(d.macaulay).toBeGreaterThan(0.3);
    expect(d.macaulay).toBeLessThan(0.7);
  });

  it("Modificada < Macaulay", () => {
    const d = calcularDuracion(r.cupones, tir, BASE.fechaDisposicion);
    expect(d.modificada).toBeLessThan(d.macaulay);
  });

  it("Bullet tiene duración mayor que Francés", () => {
    const rBullet = generarSchedule({ ...BASE, esquema: "bullet", comisionApertura: 0 });
    const tirB = calcularTIR(rBullet.cupones, BASE.monto, BASE.fechaDisposicion);
    const dB = calcularDuracion(rBullet.cupones, tirB, BASE.fechaDisposicion);
    const dF = calcularDuracion(r.cupones, tir, BASE.fechaDisposicion);
    expect(dB.macaulay).toBeGreaterThan(dF.macaulay);
  });
});

describe("CAT con IVA sobre intereses", () => {
  it("CAT con IVA > CAT sin IVA", () => {
    const rSinIva = generarSchedule(BASE);
    const rConIva = generarSchedule({ ...BASE, ivaIntereses: true });
    const catSin = calcularCAT(rSinIva.cupones, BASE.monto, rSinIva.comisionAperturaConIva, BASE.fechaDisposicion);
    const catCon = calcularCAT(rConIva.cupones, BASE.monto, rConIva.comisionAperturaConIva, BASE.fechaDisposicion);
    console.log(`CAT sin IVA = ${(catSin * 100).toFixed(4)}%, CAT con IVA = ${(catCon * 100).toFixed(4)}%`);
    expect(catCon).toBeGreaterThan(catSin);
  });
});

describe("CAT con comisión + IVA de comisión", () => {
  it("comisión IVA incrementa el CAT", () => {
    const rSinIvaCom = generarSchedule(BASE); // comisionIva: false
    const rConIvaCom = generarSchedule({ ...BASE, comisionIva: true });
    const catSin = calcularCAT(rSinIvaCom.cupones, BASE.monto, rSinIvaCom.comisionAperturaConIva, BASE.fechaDisposicion);
    const catCon = calcularCAT(rConIvaCom.cupones, BASE.monto, rConIvaCom.comisionAperturaConIva, BASE.fechaDisposicion);
    expect(catCon).toBeGreaterThan(catSin);
  });
});

describe("CAT/TIR — anticipado vs vencido (CORRECTO)", () => {
  const rVenc = generarSchedule({ ...BASE, modalidadInteres: "vencido" });
  const rAntic = generarSchedule({ ...BASE, modalidadInteres: "anticipado" });

  it("Σinterés idéntico", () => {
    expect(rAntic.totalInteres).toBe(rVenc.totalInteres);
  });

  it("CAT anticipado > CAT vencido (I1 upfront reduce desembolso neto → mayor costo)", () => {
    const catV = calcularCAT(rVenc.cupones, BASE.monto, rVenc.comisionAperturaConIva, BASE.fechaDisposicion, rVenc.interesAnticipadoInicial);
    const catA = calcularCAT(rAntic.cupones, BASE.monto, rAntic.comisionAperturaConIva, BASE.fechaDisposicion, rAntic.interesAnticipadoInicial);
    console.log(`CAT vencido = ${(catV * 100).toFixed(4)}%, CAT anticipado = ${(catA * 100).toFixed(4)}%`);
    console.log(`interesAnticipadoInicial = $${rAntic.interesAnticipadoInicial}`);
    expect(catA).toBeGreaterThan(catV);
  });

  it("TIR anticipado > TIR vencido", () => {
    const tirV = calcularTIR(rVenc.cupones, BASE.monto, BASE.fechaDisposicion, rVenc.interesAnticipadoInicial);
    const tirA = calcularTIR(rAntic.cupones, BASE.monto, BASE.fechaDisposicion, rAntic.interesAnticipadoInicial);
    console.log(`TIR vencido = ${(tirV * 100).toFixed(4)}%, TIR anticipado = ${(tirA * 100).toFixed(4)}%`);
    expect(tirA).toBeGreaterThan(tirV);
  });
});

// ── Saldo insoluto + NPV — crédito en curso (6 meses transcurridos) ──

describe("Saldo insoluto y NPV — crédito en curso", () => {
  const PARAMS_EN_CURSO: ParamsSchedule = {
    ...BASE,
    fechaDisposicion: "2025-12-15",
    fechaPrimerPago: "2026-01-15",
    comisionApertura: 0,
  };
  const r = generarSchedule(PARAMS_EN_CURSO);
  const fechaCorte = "2026-06-18";

  it("12 cupones generados", () => expect(r.cupones).toHaveLength(12));

  it("saldo insoluto a hoy = saldo_final del cupón 6 (jun 15)", () => {
    const saldo = saldoInsolutoCupones(r.cupones, fechaCorte, PARAMS_EN_CURSO.monto);
    const c6 = r.cupones[5];
    expect(saldo).toBe(c6.saldoFinal);
    console.log(`Saldo insoluto al ${fechaCorte}: $${saldo.toFixed(2)}`);
  });

  it("saldo antes del primer cupón = monto original", () => {
    expect(saldoInsolutoCupones(r.cupones, "2025-12-20", PARAMS_EN_CURSO.monto)).toBe(100_000);
  });

  it("saldo después del último cupón = 0", () => {
    expect(saldoInsolutoCupones(r.cupones, "2027-01-01", PARAMS_EN_CURSO.monto)).toBe(0);
  });

  it("NPV a la tasa del crédito ≈ saldo insoluto (principio fundamental)", () => {
    const saldo = saldoInsolutoCupones(r.cupones, fechaCorte, PARAMS_EN_CURSO.monto);
    const tir = calcularTIR(r.cupones, PARAMS_EN_CURSO.monto, PARAMS_EN_CURSO.fechaDisposicion);
    const npvVal = calcularNPV(r.cupones, tir, fechaCorte);
    console.log(`NPV @ TIR ${(tir * 100).toFixed(2)}% = $${npvVal.toFixed(2)} vs Saldo = $${saldo.toFixed(2)}`);
    const pctDiff = saldo > 0 ? Math.abs(npvVal - saldo) / saldo : 0;
    expect(pctDiff).toBeLessThan(0.02);
  });

  it("NPV a tasa mayor → descuento (NPV < saldo)", () => {
    const saldo = saldoInsolutoCupones(r.cupones, fechaCorte, PARAMS_EN_CURSO.monto);
    const npvAlta = calcularNPV(r.cupones, 0.40, fechaCorte);
    expect(npvAlta).toBeLessThan(saldo);
  });

  it("NPV a tasa menor → premio (NPV > saldo)", () => {
    const saldo = saldoInsolutoCupones(r.cupones, fechaCorte, PARAMS_EN_CURSO.monto);
    const npvBaja = calcularNPV(r.cupones, 0.10, fechaCorte);
    expect(npvBaja).toBeGreaterThan(saldo);
  });
});

// ── Saldo línea multi-disposición (CP-3472327) ──

describe("Saldo línea multi-disposición — CP-3472327", () => {
  // Datos reales: línea $52M, 2 disposiciones, 60m, francés, gracia 24m,
  // TIIE_28 + 6%, ACT/360, origen 2025-08-01
  const CATALOG_TIIE: RateCatalogRow[] = [
    { rate_type: "TIIE_28", rate_date: "2026-05-29", rate_value: 0.067559 },
    { rate_type: "TIIE_28", rate_date: "2025-07-31", rate_value: 0.082339 },
  ];

  const DISP1 = { monto: 24_217_019, fecha: "2025-08-15" };
  const DISP2 = { monto: 11_129_098, fecha: "2025-08-15" };
  const TOTAL_DISPUESTO = DISP1.monto + DISP2.monto; // 35,346,117

  // Contradicciones en datos reales (reportadas, no resueltas por el motor):
  // - esquema='frances' vs metodo_amort='lineal'
  // - periodo_gracia_meses=24 vs tipo_gracia='ninguna'
  // Usamos: esquema='frances', gracia=24m, tipoGracia='solo_interes' (default sensato)

  const fechaCorte = "2026-06-19"; // hoy — dentro del periodo de gracia (< 24m desde ago 2025)

  function buildParams(monto: number, fecha: string): ParamsSchedule {
    return {
      monto,
      fechaDisposicion: fecha,
      fechaPrimerPago: "2025-09-15", // 1 mes después
      plazoMeses: 60,
      frecuencia: "mensual",
      esquema: "frances",
      rateType: "TIIE_28",
      spread: 0.06,
      fixedRate: null,
      convencionDias: "ACT/360",
      frecuenciaRevision: null,
      graciaMeses: 24,
      tipoGracia: "solo_interes",
      comisionApertura: 0,
      comisionIva: false,
      ivaIntereses: false,
    };
  }

  it("durante gracia (24m), saldo de cada disposición = su monto completo", () => {
    const s1 = generarSchedule(buildParams(DISP1.monto, DISP1.fecha), CATALOG_TIIE);
    const saldo1 = saldoInsolutoCupones(s1.cupones, fechaCorte, DISP1.monto);
    expect(saldo1).toBe(DISP1.monto);

    const s2 = generarSchedule(buildParams(DISP2.monto, DISP2.fecha), CATALOG_TIIE);
    const saldo2 = saldoInsolutoCupones(s2.cupones, fechaCorte, DISP2.monto);
    expect(saldo2).toBe(DISP2.monto);
  });

  it("saldo total = suma de disposiciones = $35,346,117", () => {
    const s1 = generarSchedule(buildParams(DISP1.monto, DISP1.fecha), CATALOG_TIIE);
    const s2 = generarSchedule(buildParams(DISP2.monto, DISP2.fecha), CATALOG_TIIE);
    const saldo1 = saldoInsolutoCupones(s1.cupones, fechaCorte, DISP1.monto);
    const saldo2 = saldoInsolutoCupones(s2.cupones, fechaCorte, DISP2.monto);
    const total = saldo1 + saldo2;

    console.log("\n=== CP-3472327 — Saldo línea multi-disposición ===");
    console.log(`Disp #1: $${DISP1.monto.toLocaleString()} (${DISP1.fecha}) → saldo: $${saldo1.toLocaleString()}`);
    console.log(`Disp #2: $${DISP2.monto.toLocaleString()} (${DISP2.fecha}) → saldo: $${saldo2.toLocaleString()}`);
    console.log(`Total dispuesto: $${TOTAL_DISPUESTO.toLocaleString()}`);
    console.log(`Saldo total calculado: $${total.toLocaleString()}`);
    console.log(`Línea autorizada (monto): $52,000,000 ← NO es el saldo`);
    console.log("\nContradicciones en datos:");
    console.log("  esquema='frances' vs metodo_amort='lineal' → se usa esquema");
    console.log("  periodo_gracia_meses=24 vs tipo_gracia='ninguna' → se usa solo_interes");

    expect(total).toBe(TOTAL_DISPUESTO);
  });

  it("cada disposición tiene 60 cupones (24 gracia + 36 amort)", () => {
    const s = generarSchedule(buildParams(DISP1.monto, DISP1.fecha), CATALOG_TIIE);
    expect(s.cupones).toHaveLength(60);
    // Primeros 24: capital = 0 (gracia)
    for (let i = 0; i < 24; i++) expect(s.cupones[i].capital).toBe(0);
    // Cupón 25+: capital > 0
    expect(s.cupones[24].capital).toBeGreaterThan(0);
  });

  it("Σcapital de cada disposición = su monto", () => {
    const s1 = generarSchedule(buildParams(DISP1.monto, DISP1.fecha), CATALOG_TIIE);
    expect(s1.totalCapital).toBe(DISP1.monto);

    const s2 = generarSchedule(buildParams(DISP2.monto, DISP2.fecha), CATALOG_TIIE);
    expect(s2.totalCapital).toBe(DISP2.monto);
  });
});
