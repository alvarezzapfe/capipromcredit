// =====================================================================
// CapiProm — Motor de línea de crédito revolvente
// Calcula estado de cuenta (saldo, interés devengado) desde movimientos
// =====================================================================

export interface Movimiento {
  id?: string;
  credito_id: string;
  fecha: string;       // YYYY-MM-DD
  tipo: "disposicion" | "pago";
  monto: number;
  nota?: string;
}

export interface EstadoLinea {
  saldoDispuesto: number;
  interesDevengado: number;
  timeline: { fecha: string; saldo: number }[];
}

function diffDias(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function rd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularEstadoLinea(
  movimientos: Movimiento[],
  tasaAnual: number,       // decimal, e.g. 0.24
  fechaCorte: string       // YYYY-MM-DD
): EstadoLinea {
  if (movimientos.length === 0) {
    return { saldoDispuesto: 0, interesDevengado: 0, timeline: [] };
  }

  // Sort by date, then disposicion before pago on same date
  const sorted = [...movimientos].sort((a, b) => {
    const dc = a.fecha.localeCompare(b.fecha);
    if (dc !== 0) return dc;
    return a.tipo === "disposicion" ? -1 : 1;
  });

  const timeline: { fecha: string; saldo: number }[] = [];
  let saldo = 0;
  let interes = 0;
  let ultimaFecha = sorted[0].fecha;

  for (const mov of sorted) {
    // Accrue interest for the segment [ultimaFecha, mov.fecha)
    const dias = diffDias(ultimaFecha, mov.fecha);
    if (dias > 0 && saldo > 0) {
      interes += saldo * tasaAnual * (dias / 360);
    }
    ultimaFecha = mov.fecha;

    // Apply movement
    if (mov.tipo === "disposicion") {
      saldo += mov.monto;
    } else {
      saldo -= mov.monto;
    }
    saldo = rd(Math.max(0, saldo));
    timeline.push({ fecha: mov.fecha, saldo });
  }

  // Accrue interest from last movement to fechaCorte
  const diasFinal = diffDias(ultimaFecha, fechaCorte);
  if (diasFinal > 0 && saldo > 0) {
    interes += saldo * tasaAnual * (diasFinal / 360);
  }

  return {
    saldoDispuesto: saldo,
    interesDevengado: rd(interes),
    timeline,
  };
}
