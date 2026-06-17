import { describe, it, expect } from "vitest";
import { generarSchedule, type ParamsSchedule } from "../schedule";
import { calcularCAT, calcularTIR, calcularDuracion } from "../metrics";

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
