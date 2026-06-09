// =====================================================================
// CapiProm — Motor de amortización
// Métodos: Francés (cuota fija), Lineal, Bullet, Creciente
// Soporta: periodo de gracia (capital o total) y disposiciones
// =====================================================================

export type Frecuencia = "mensual" | "quincenal" | "semanal";
export type MetodoAmort = "frances" | "lineal" | "bullet" | "creciente";
export type TipoGracia = "ninguna" | "capital" | "total";

export interface Cupon {
  numero_cupon: number;
  fecha_pago: string;
  saldo_inicial: number;
  capital: number;
  interes: number;
  pago_total: number;
  saldo_final: number;
  valor_referencia?: number;  // TIIE del periodo (solo variable)
  tasa_aplicada?: number;     // tasa anual efectiva del periodo (solo variable)
}

export interface ParamsCredito {
  monto: number;
  tasaAnual: number;           // 0.24 = 24%
  plazoMeses: number;
  frecuencia: Frecuencia;
  metodo: MetodoAmort;
  fechaOrigen: string;
  crecimientoPeriodo?: number; // solo creciente, default 0.05
  graciaPeridos?: number;      // periodos de gracia (convertidos de meses)
  tipoGracia?: TipoGracia;
  valorResidual?: number;      // arrendamientos: saldo que queda al final (opción de compra)
  tasasAnualesPorPeriodo?: number[]; // tasa variable: tasa anual efectiva por cada cupón
}

const PERIODOS_POR_ANIO: Record<Frecuencia, number> = {
  mensual: 12,
  quincenal: 24,
  semanal: 52,
};

function rd(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaCupon(origen: string, frecuencia: Frecuencia, periodo: number): string {
  // Parse components without timezone issues
  const [yO, mO, dO] = origen.split("-").map(Number);

  if (frecuencia === "mensual") {
    // Anchor to original day, clamped to last day of target month
    const totalMonths = (yO * 12 + (mO - 1)) + periodo;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1; // 1-based
    const maxDay = new Date(y, m, 0).getDate(); // last day of month
    const d = Math.min(dO, maxDay);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Quincenal / semanal: add days
  const days = frecuencia === "quincenal" ? 15 * periodo : 7 * periodo;
  const base = new Date(yO, mO - 1, dO + days);
  const yy = base.getFullYear();
  const mm = base.getMonth() + 1;
  const dd = base.getDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function numeroCupones(plazoMeses: number, frecuencia: Frecuencia): number {
  if (frecuencia === "mensual") return plazoMeses;
  if (frecuencia === "quincenal") return plazoMeses * 2;
  return Math.round((plazoMeses * 52) / 12);
}

function periodosGracia(graciaMeses: number, frecuencia: Frecuencia): number {
  if (frecuencia === "mensual") return graciaMeses;
  if (frecuencia === "quincenal") return graciaMeses * 2;
  return Math.round((graciaMeses * 52) / 12);
}

export function generarTablaAmortizacion(p: ParamsCredito): Cupon[] {
  const ppa = PERIODOS_POR_ANIO[p.frecuencia];
  const nTotal = numeroCupones(p.plazoMeses, p.frecuencia);
  const tasaPeriodo = p.tasaAnual / ppa;
  const nGracia = p.graciaPeridos ?? 0;
  const tipoGracia = p.tipoGracia ?? "ninguna";
  const tasasVar = p.tasasAnualesPorPeriodo; // undefined = tasa fija

  if (nGracia >= nTotal) {
    throw new Error("El periodo de gracia debe ser menor al plazo total.");
  }

  // Helper: per-period rate (0-indexed cupón number → period rate)
  const iPer = (idx: number) => tasasVar ? (tasasVar[idx] ?? p.tasaAnual) / ppa : tasaPeriodo;

  // Build grace period coupons first
  const cupones: Cupon[] = [];
  let saldo = p.monto;

  for (let i = 1; i <= nGracia; i++) {
    const tp = iPer(i - 1);
    const interes = rd(saldo * tp);
    if (tipoGracia === "capital") {
      cupones.push({
        numero_cupon: i,
        fecha_pago: fechaCupon(p.fechaOrigen, p.frecuencia, i),
        saldo_inicial: rd(saldo),
        capital: 0,
        interes,
        pago_total: interes,
        saldo_final: rd(saldo),
      });
    } else {
      const nuevoSaldo = rd(saldo + interes);
      cupones.push({
        numero_cupon: i,
        fecha_pago: fechaCupon(p.fechaOrigen, p.frecuencia, i),
        saldo_inicial: rd(saldo),
        capital: 0,
        interes,
        pago_total: 0,
        saldo_final: nuevoSaldo,
      });
      saldo = nuevoSaldo;
    }
  }

  // Remaining amortization periods
  const nAmort = nTotal - nGracia;
  if (nAmort <= 0) return cupones;

  const vr = p.valorResidual ?? 0;

  // Build per-period rates for the amortization portion (after grace)
  const amortRates = tasasVar
    ? Array.from({ length: nAmort }, (_, i) => (tasasVar[nGracia + i] ?? p.tasaAnual) / ppa)
    : null;

  let amortCupones: Cupon[];
  if (amortRates) {
    // Variable-rate path
    if (p.metodo === "frances") amortCupones = generarFrancesVariable(saldo, nAmort, amortRates, vr);
    else if (p.metodo === "lineal") amortCupones = generarLinealVariable(saldo, nAmort, amortRates, vr);
    else if (p.metodo === "bullet") amortCupones = generarBulletVariable(saldo, nAmort, amortRates);
    else amortCupones = generarCreciente(saldo, nAmort, tasaPeriodo, p.crecimientoPeriodo ?? 0.05);
  } else {
    // Fixed-rate path (unchanged)
    if (p.metodo === "frances") amortCupones = generarFrances(saldo, nAmort, tasaPeriodo, vr);
    else if (p.metodo === "lineal") amortCupones = generarLineal(saldo, nAmort, tasaPeriodo, vr);
    else if (p.metodo === "bullet") amortCupones = generarBullet(saldo, nAmort, tasaPeriodo);
    else amortCupones = generarCreciente(saldo, nAmort, tasaPeriodo, p.crecimientoPeriodo ?? 0.05);
  }

  // Shift cupon numbers and dates
  for (const c of amortCupones) {
    c.numero_cupon += nGracia;
    c.fecha_pago = fechaCupon(p.fechaOrigen, p.frecuencia, c.numero_cupon);
  }

  // Línea extra de opción de compra (valor residual)
  if (vr > 0) {
    const lastCupon = amortCupones[amortCupones.length - 1];
    const nOC = (lastCupon?.numero_cupon ?? nGracia) + 1;
    amortCupones.push({
      numero_cupon: nOC,
      fecha_pago: fechaCupon(p.fechaOrigen, p.frecuencia, nOC),
      saldo_inicial: rd(vr),
      capital: rd(vr),
      interes: 0,
      pago_total: rd(vr),
      saldo_final: 0,
    });
  }

  return [...cupones, ...amortCupones];
}

// Helper: convert grace months to periods for the public API
export function calcularGraciaPeridos(graciaMeses: number, frecuencia: Frecuencia): number {
  return periodosGracia(graciaMeses, frecuencia);
}

// -----------------------------------------------------------------
// FRANCÉS: cuota fija (sistema francés)
// -----------------------------------------------------------------
function generarFrances(monto: number, n: number, tasaPeriodo: number, valorResidual = 0): Cupon[] {
  const cupones: Cupon[] = [];
  // Con valor residual: R = (capital - VR·(1+i)^(-n)) / a(n,i)
  // donde a(n,i) = (1-(1+i)^(-n))/i
  const vrPV = valorResidual * Math.pow(1 + tasaPeriodo, -n);
  const montoAmort = monto - vrPV;
  const cuota = tasaPeriodo === 0
    ? montoAmort / n
    : (montoAmort * tasaPeriodo) / (1 - Math.pow(1 + tasaPeriodo, -n));
  let saldo = monto;

  for (let i = 1; i <= n; i++) {
    const interes = rd(saldo * tasaPeriodo);
    let capital: number;
    if (i === n) {
      capital = rd(saldo - valorResidual);
    } else {
      capital = rd(cuota - interes);
    }
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({
      numero_cupon: i,
      fecha_pago: "",
      saldo_inicial: rd(saldo),
      capital,
      interes,
      pago_total: rd(capital + interes),
      saldo_final: saldoFinal,
    });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// LINEAL: capital constante
// -----------------------------------------------------------------
function generarLineal(monto: number, n: number, tasaPeriodo: number, valorResidual = 0): Cupon[] {
  const cupones: Cupon[] = [];
  const capitalFijo = (monto - valorResidual) / n;
  let saldo = monto;

  for (let i = 1; i <= n; i++) {
    const interes = rd(saldo * tasaPeriodo);
    const capital = i === n ? rd(saldo - valorResidual) : rd(capitalFijo);
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({
      numero_cupon: i,
      fecha_pago: "",
      saldo_inicial: rd(saldo),
      capital,
      interes,
      pago_total: rd(capital + interes),
      saldo_final: saldoFinal,
    });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// BULLET: solo interés, capital al final
// -----------------------------------------------------------------
function generarBullet(monto: number, n: number, tasaPeriodo: number): Cupon[] {
  const cupones: Cupon[] = [];
  let saldo = monto;

  for (let i = 1; i <= n; i++) {
    const interes = rd(saldo * tasaPeriodo);
    const capital = i === n ? rd(saldo) : 0;
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({
      numero_cupon: i,
      fecha_pago: "",
      saldo_inicial: rd(saldo),
      capital,
      interes,
      pago_total: rd(capital + interes),
      saldo_final: saldoFinal,
    });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// CRECIENTE: gradiente aritmético
// -----------------------------------------------------------------
function generarCreciente(monto: number, n: number, tasaPeriodo: number, g: number): Cupon[] {
  let sumFactor = 0;
  for (let k = 0; k < n; k++) {
    sumFactor += Math.pow(1 + g, k) / Math.pow(1 + tasaPeriodo, k + 1);
  }
  const pago1 = monto / sumFactor;
  const cupones: Cupon[] = [];
  let saldo = monto;

  for (let k = 1; k <= n; k++) {
    const pagoTotal = pago1 * Math.pow(1 + g, k - 1);
    const interes = saldo * tasaPeriodo;
    let capital = pagoTotal - interes;

    if (capital < 0 && k < n) {
      throw new Error(
        `Creciente: en el periodo ${k} el capital es negativo ($${rd(capital)}). Aumenta el crecimiento o reduce la tasa.`
      );
    }
    if (k === n) capital = saldo;

    const saldoFinal = Math.max(0, saldo - capital);
    cupones.push({
      numero_cupon: k,
      fecha_pago: "",
      saldo_inicial: rd(saldo),
      capital: rd(capital),
      interes: rd(interes),
      pago_total: k === n ? rd(capital + interes) : rd(pagoTotal),
      saldo_final: rd(saldoFinal),
    });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// FRANCÉS REVISABLE: re-amortiza el saldo al plazo restante cada periodo
// -----------------------------------------------------------------
function generarFrancesVariable(monto: number, n: number, rates: number[], valorResidual = 0): Cupon[] {
  const cupones: Cupon[] = [];
  let saldo = monto;
  for (let i = 1; i <= n; i++) {
    const ip = rates[i - 1];
    const restantes = n - i + 1;
    const interes = rd(saldo * ip);
    let capital: number;
    if (i === n) {
      capital = rd(saldo - valorResidual);
    } else {
      // Re-amortize: compute payment that amortizes (saldo - VR_PV) over remaining periods at current rate
      const vrPV = valorResidual * Math.pow(1 + ip, -restantes);
      const montoAmort = saldo - vrPV;
      const pago = ip === 0 ? montoAmort / restantes : (montoAmort * ip) / (1 - Math.pow(1 + ip, -restantes));
      capital = rd(pago - interes);
    }
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({ numero_cupon: i, fecha_pago: "", saldo_inicial: rd(saldo), capital, interes, pago_total: rd(capital + interes), saldo_final: saldoFinal });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// LINEAL REVISABLE: capital constante, interés por tasa del periodo
// -----------------------------------------------------------------
function generarLinealVariable(monto: number, n: number, rates: number[], valorResidual = 0): Cupon[] {
  const cupones: Cupon[] = [];
  const capitalFijo = (monto - valorResidual) / n;
  let saldo = monto;
  for (let i = 1; i <= n; i++) {
    const ip = rates[i - 1];
    const interes = rd(saldo * ip);
    const capital = i === n ? rd(saldo - valorResidual) : rd(capitalFijo);
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({ numero_cupon: i, fecha_pago: "", saldo_inicial: rd(saldo), capital, interes, pago_total: rd(capital + interes), saldo_final: saldoFinal });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// BULLET REVISABLE: interés por tasa del periodo, capital al final
// -----------------------------------------------------------------
function generarBulletVariable(monto: number, n: number, rates: number[]): Cupon[] {
  const cupones: Cupon[] = [];
  let saldo = monto;
  for (let i = 1; i <= n; i++) {
    const ip = rates[i - 1];
    const interes = rd(saldo * ip);
    const capital = i === n ? rd(saldo) : 0;
    const saldoFinal = Math.max(0, rd(saldo - capital));
    cupones.push({ numero_cupon: i, fecha_pago: "", saldo_inicial: rd(saldo), capital, interes, pago_total: rd(capital + interes), saldo_final: saldoFinal });
    saldo = saldoFinal;
  }
  return cupones;
}

// -----------------------------------------------------------------
// Helpers de resumen
// -----------------------------------------------------------------
export interface ResumenCredito {
  saldoInsoluto: number;
  proximoCupon: Cupon | null;
  diasAlProximoCupon: number | null;
  cuponesVencidos: number;
  interesTotal: number;
}

export function resumirCredito(cupones: Cupon[]): ResumenCredito {
  const hoy = new Date().toISOString().slice(0, 10);
  const proximo = cupones.find((c) => c.fecha_pago >= hoy) ?? null;
  const vencidos = cupones.filter((c) => c.fecha_pago < hoy).length;
  const interesTotal = rd(cupones.reduce((s, c) => s + c.interes, 0));
  const saldoInsoluto = cupones.length ? cupones[0].saldo_inicial : 0;

  let dias: number | null = null;
  if (proximo) {
    const ms = new Date(proximo.fecha_pago + "T00:00:00").getTime() - new Date(hoy + "T00:00:00").getTime();
    dias = Math.round(ms / (1000 * 60 * 60 * 24));
  }
  return { saldoInsoluto, proximoCupon: proximo, diasAlProximoCupon: dias, cuponesVencidos: vencidos, interesTotal };
}
