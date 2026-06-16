import { describe, it, expect } from "vitest";
import { fmtPct, rateLabel } from "../rate-label";

describe("fmtPct", () => {
  it("6% sin decimales sobrantes", () => expect(fmtPct(0.06)).toBe("6%"));
  it("3.5% un decimal", () => expect(fmtPct(0.035)).toBe("3.5%"));
  it("0.5% menor a 1", () => expect(fmtPct(0.005)).toBe("0.5%"));
  it("15% entero grande", () => expect(fmtPct(0.15)).toBe("15%"));
  it("24% entero", () => expect(fmtPct(0.24)).toBe("24%"));
  it("10.25% dos decimales", () => expect(fmtPct(0.1025)).toBe("10.25%"));
  it("0% cero", () => expect(fmtPct(0)).toBe("0%"));
  it("6.7559% cuatro decimales", () => expect(fmtPct(0.067559)).toBe("6.7559%"));
});

describe("rateLabel", () => {
  it('TIIE 28 + 6%', () =>
    expect(rateLabel({ rate_type: "TIIE_28", spread: 0.06 })).toBe("TIIE 28 + 6%"));

  it('TIIE 28 + 3.5%', () =>
    expect(rateLabel({ rate_type: "TIIE_28", spread: 0.035 })).toBe("TIIE 28 + 3.5%"));

  it('TIIE 28 + 0.5%', () =>
    expect(rateLabel({ rate_type: "TIIE_28", spread: 0.005 })).toBe("TIIE 28 + 0.5%"));

  it('TIIE Fondeo + 5.5%', () =>
    expect(rateLabel({ rate_type: "TIIE_FONDEO", spread: 0.055 })).toBe("TIIE Fondeo + 5.5%"));

  it('Fija 15%', () =>
    expect(rateLabel({ rate_type: null, fixed_rate: 0.15 })).toBe("Fija 15%"));

  it('Fija 24%', () =>
    expect(rateLabel({ rate_type: null, fixed_rate: 0.24 })).toBe("Fija 24%"));

  it('Fija 18.5%', () =>
    expect(rateLabel({ rate_type: undefined, fixed_rate: 0.185 })).toBe("Fija 18.5%"));

  it('rate_type desconocido usa el nombre raw', () =>
    expect(rateLabel({ rate_type: "SOFR_1M", spread: 0.02 })).toBe("SOFR 1M + 2%"));

  it('spread null → 0%', () =>
    expect(rateLabel({ rate_type: "TIIE_28", spread: null })).toBe("TIIE 28 + 0%"));
});
