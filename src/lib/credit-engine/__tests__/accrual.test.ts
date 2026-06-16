import { describe, it, expect, vi } from "vitest";
import {
  ultimoDiaMesAnterior,
  lookupRate,
  tasaAnual,
  seccionar,
  type RateCatalogRow,
  type CreditRateConfig,
} from "../accrual";

// -- Catálogo de prueba (TIIE 28, orden DESC por date) --
const CATALOG_TIIE28: RateCatalogRow[] = [
  { rate_type: "TIIE_28", rate_date: "2026-05-29", rate_value: 0.067559 },
  { rate_type: "TIIE_28", rate_date: "2026-04-30", rate_value: 0.069000 },
  { rate_type: "TIIE_28", rate_date: "2026-03-31", rate_value: 0.070272 },
  { rate_type: "TIIE_28", rate_date: "2026-02-27", rate_value: 0.071000 },
  { rate_type: "TIIE_28", rate_date: "2026-01-30", rate_value: 0.072000 },
  { rate_type: "TIIE_28", rate_date: "2025-12-31", rate_value: 0.073489 },
];

describe("ultimoDiaMesAnterior", () => {
  it("junio 15 → 31 mayo", () =>
    expect(ultimoDiaMesAnterior("2026-06-15")).toBe("2026-05-31"));
  it("marzo 1 → 28 feb (no bisiesto)", () =>
    expect(ultimoDiaMesAnterior("2027-03-01")).toBe("2027-02-28"));
  it("enero 10 → 31 dic año anterior", () =>
    expect(ultimoDiaMesAnterior("2026-01-10")).toBe("2025-12-31"));
  it("marzo 1 2024 → 29 feb (bisiesto)", () =>
    expect(ultimoDiaMesAnterior("2024-03-01")).toBe("2024-02-29"));
});

describe("lookupRate", () => {
  it("15 jun 2026: tope = 31 may → pega con 29 may (0.067559)", () => {
    expect(lookupRate(CATALOG_TIIE28, "TIIE_28", "2026-06-15")).toBe(0.067559);
  });

  it("10 may 2026: tope = 30 abr → pega con 30 abr (0.069000)", () => {
    expect(lookupRate(CATALOG_TIIE28, "TIIE_28", "2026-05-10")).toBe(0.069000);
  });

  it("catálogo vacío → lanza error", () => {
    expect(() => lookupRate([], "TIIE_28", "2026-06-15")).toThrow("rate_catalog vacío");
  });

  it("sin dato para el tope → fallback con warning", () => {
    const miniCatalog: RateCatalogRow[] = [
      { rate_type: "TIIE_28", rate_date: "2026-03-31", rate_value: 0.070272 },
    ];
    const warn = vi.fn();
    // fechaCorte = 2026-04-05, tope = 2026-03-31, catalog tiene 2026-03-31 → match!
    expect(lookupRate(miniCatalog, "TIIE_28", "2026-04-05", warn)).toBe(0.070272);
    expect(warn).not.toHaveBeenCalled();
  });

  it("fallback: sin dato para tope pero sí anterior a fechaCorte", () => {
    const miniCatalog: RateCatalogRow[] = [
      { rate_type: "TIIE_28", rate_date: "2026-06-05", rate_value: 0.066000 },
    ];
    const warn = vi.fn();
    // fechaCorte = 2026-07-20, tope = 2026-06-30. catalog[0].date = 2026-06-05 <= 2026-06-30 → match primary
    expect(lookupRate(miniCatalog, "TIIE_28", "2026-07-20", warn)).toBe(0.066000);
  });

  it("último recurso: solo registros futuros → usa el más reciente con warning", () => {
    const futuro: RateCatalogRow[] = [
      { rate_type: "TIIE_28", rate_date: "2030-01-31", rate_value: 0.050000 },
    ];
    const warn = vi.fn();
    expect(lookupRate(futuro, "TIIE_28", "2026-06-15", warn)).toBe(0.050000);
    expect(warn).toHaveBeenCalled();
  });
});

describe("tasaAnual", () => {
  it("variable: referencia + spread", () => {
    const cfg: CreditRateConfig = { rate_type: "TIIE_28", spread: 0.06, fixed_rate: null };
    // 15 jun 2026 → ref 0.067559 + 0.06 = 0.127559
    expect(tasaAnual(cfg, CATALOG_TIIE28, "2026-06-15")).toBeCloseTo(0.127559, 6);
  });

  it("fija: fixed_rate directamente", () => {
    const cfg: CreditRateConfig = { rate_type: null, spread: null, fixed_rate: 0.15 };
    expect(tasaAnual(cfg, [], "2026-06-15")).toBe(0.15);
  });

  it("fija con catálogo vacío no truena", () => {
    const cfg: CreditRateConfig = { rate_type: null, spread: null, fixed_rate: 0.24 };
    expect(tasaAnual(cfg, [], "2026-06-15")).toBe(0.24);
  });
});

describe("seccionar", () => {
  it("tasa fija → un solo tramo", () => {
    const cfg: CreditRateConfig = { rate_type: null, spread: null, fixed_rate: 0.18, day_count_base: 360 };
    const result = seccionar(cfg, [], "2026-03-15", "2026-06-15");
    expect(result).toHaveLength(1);
    expect(result[0].dias).toBe(92);
    expect(result[0].tasaAnual).toBe(0.18);
    expect(result[0].base).toBe(360);
  });

  it("tasa variable → secciona por mes", () => {
    const cfg: CreditRateConfig = { rate_type: "TIIE_28", spread: 0.06, fixed_rate: null, day_count_base: 360 };
    const result = seccionar(cfg, CATALOG_TIIE28, "2026-03-15", "2026-06-15");

    // Tramos esperados: 15mar→1abr, 1abr→1may, 1may→1jun, 1jun→15jun
    expect(result).toHaveLength(4);

    // Tramo 1: 15 mar → 1 abr (17 días), tasa ref del mes anterior a mar-15 = feb
    expect(result[0].desde).toBe("2026-03-15");
    expect(result[0].hasta).toBe("2026-04-01");
    expect(result[0].dias).toBe(17);
    // Tope = 28 feb, catálogo tiene 27 feb (0.071000) + spread 0.06 = 0.131
    expect(result[0].tasaAnual).toBeCloseTo(0.131, 4);

    // Tramo 3: 1 may → 1 jun, tasa ref tope = 30 abr (0.069) + 0.06 = 0.129
    expect(result[2].desde).toBe("2026-05-01");
    expect(result[2].tasaAnual).toBeCloseTo(0.129, 4);

    // Tramo 4: 1 jun → 15 jun, tasa ref tope = 31 may → 29 may (0.067559) + 0.06 = 0.127559
    expect(result[3].desde).toBe("2026-06-01");
    expect(result[3].hasta).toBe("2026-06-15");
    expect(result[3].dias).toBe(14);
    expect(result[3].tasaAnual).toBeCloseTo(0.127559, 4);
  });

  it("periodo de 0 días → array vacío", () => {
    const cfg: CreditRateConfig = { rate_type: null, spread: null, fixed_rate: 0.18 };
    expect(seccionar(cfg, [], "2026-06-15", "2026-06-15")).toHaveLength(0);
  });

  it("day_count_base 365", () => {
    const cfg: CreditRateConfig = { rate_type: null, spread: null, fixed_rate: 0.12, day_count_base: 365 };
    const result = seccionar(cfg, [], "2026-01-01", "2026-02-01");
    expect(result[0].base).toBe(365);
  });
});
