// =====================================================================
// CapiProm — Motor de factoraje
// Calcula el desglose de una operación de descuento de factura
// =====================================================================

export interface ParamsFactoraje {
  montoFactura: number;
  aforo: number;             // % (1-100)
  tasaDescuento: number;     // anual % (e.g. 24)
  comisionPct: number;       // % (e.g. 2)
  fechaOrigen: string;       // ISO YYYY-MM-DD
  fechaVencimiento: string;  // ISO YYYY-MM-DD
}

export interface DesgloseFactoraje {
  dias: number;
  anticipo: number;
  descuento: number;
  comision: number;
  reserva: number;
  desembolso: number;       // lo que recibe el cedente al inicio
  ingresoFactor: number;    // lo que gana CapiProm
}

function rd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularFactoraje(p: ParamsFactoraje): DesgloseFactoraje {
  const msOrigen = new Date(p.fechaOrigen + "T00:00:00").getTime();
  const msVenc = new Date(p.fechaVencimiento + "T00:00:00").getTime();
  const dias = Math.round((msVenc - msOrigen) / (1000 * 60 * 60 * 24));

  if (dias <= 0) throw new Error("La fecha de vencimiento debe ser posterior a la fecha de origen.");
  if (p.aforo < 1 || p.aforo > 100) throw new Error("El aforo debe estar entre 1% y 100%.");

  const anticipo = rd(p.montoFactura * (p.aforo / 100));
  const descuento = rd(anticipo * (p.tasaDescuento / 100) * (dias / 360));
  const comision = rd(p.montoFactura * (p.comisionPct / 100));
  const reserva = rd(p.montoFactura - anticipo);
  const desembolso = rd(anticipo - descuento - comision);
  const ingresoFactor = rd(descuento + comision);

  return { dias, anticipo, descuento, comision, reserva, desembolso, ingresoFactor };
}
