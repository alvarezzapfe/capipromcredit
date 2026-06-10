// =====================================================================
// CapiProm — Construcción de operaciones (credito + cupones)
// Función pura compartida por ModalAlta e Importador masivo
// =====================================================================

import {
  generarTablaAmortizacion,
  calcularGraciaPeridos,
  type Cupon,
  type Frecuencia,
  type MetodoAmort,
  type TipoGracia,
} from "./amortizacion";
import { calcularFactoraje } from "./factoraje";

export type TipoProducto =
  | "credito_simple"
  | "arrendamiento_financiero"
  | "arrendamiento_puro"
  | "factoraje"
  | "linea_revolvente";

/** Campos de entrada — todos los que puede traer un form o una fila de Excel */
export interface InputOperacion {
  tipo_producto: TipoProducto;
  folio?: string; // si no viene, se autogenera
  acreditado: string;
  cliente_id?: string;
  rfc?: string;
  fecha_origen: string;

  // Crédito simple / arrendamiento
  monto?: number;
  tipo_tasa?: "fija" | "variable";
  tasa_anual_pct?: number; // 24 = 24%
  tasa_referencia?: string;
  valor_referencia_pct?: number; // 10.5 = 10.5%
  spread_pp?: number; // 4.5 = 4.5pp
  plazo_meses?: number;
  frecuencia?: Frecuencia;
  metodo_amort?: MetodoAmort;
  crecimiento_pct?: number; // 5 = 5%
  tipo_garantia?: string;
  periodo_gracia_meses?: number;
  tipo_gracia?: TipoGracia;
  tipo_disposicion?: "unica" | "multiple";

  // Arrendamiento
  valor_bien?: number;
  enganche?: number;
  valor_residual?: number;

  // Factoraje
  deudor?: string;
  monto_factura?: number;
  aforo_pct?: number; // 80 = 80%
  tasa_descuento_pct?: number; // 24 = 24%
  comision_pct?: number; // 2 = 2%
  fecha_vencimiento?: string;

  // Línea revolvente
  limite_linea?: number;
  disposicion_inicial?: number; // monto de disposición inicial (opcional)
}

/** Lo que se insertará en Supabase */
export interface ResultadoOperacion {
  creditoRow: Record<string, any>;
  cupones: Omit<Cupon, "">[];
  disposicionMonto: number;
  movimientoInicial?: { fecha: string; tipo: "disposicion"; monto: number };
}

/** Valida y construye los payloads; lanza Error con mensaje legible si algo falla */
export function construirOperacion(input: InputOperacion): ResultadoOperacion {
  const tp = input.tipo_producto;
  const esArr =
    tp === "arrendamiento_financiero" || tp === "arrendamiento_puro";
  const esFact = tp === "factoraje";

  const folio = input.folio || "CP-" + Date.now().toString().slice(-7);

  // ── Tasa efectiva (en %) ──────────────────────────────────
  const tasaEfectivaPct =
    input.tipo_tasa === "variable"
      ? (input.valor_referencia_pct ?? 0) + (input.spread_pp ?? 0)
      : input.tasa_anual_pct ?? 0;

  // ── FACTORAJE ─────────────────────────────────────────────
  if (esFact) {
    const montoFactura = input.monto_factura ?? 0;
    const aforo = input.aforo_pct ?? 80;
    const tasaDesc = input.tasa_descuento_pct ?? 0;
    const comPct = input.comision_pct ?? 0;
    const fechaOrigen = input.fecha_origen;
    const fechaVenc = input.fecha_vencimiento ?? "";

    if (montoFactura <= 0) throw new Error("monto_factura debe ser > 0");
    if (tasaDesc <= 0) throw new Error("tasa_descuento debe ser > 0");
    if (!fechaVenc) throw new Error("fecha_vencimiento requerida");
    if (!input.deudor) throw new Error("deudor requerido");
    if (aforo < 1 || aforo > 100) throw new Error("aforo debe ser 1-100");

    const desg = calcularFactoraje({
      montoFactura,
      aforo,
      tasaDescuento: tasaDesc,
      comisionPct: comPct,
      fechaOrigen,
      fechaVencimiento: fechaVenc,
    });

    const plazoM = Math.max(1, Math.round(desg.dias / 30));

    const creditoRow: Record<string, any> = {
      folio,
      acreditado: input.acreditado,
      ...(input.cliente_id ? { cliente_id: input.cliente_id } : {}),
      rfc: input.rfc || null,
      tipo_producto: "factoraje",
      monto: desg.anticipo,
      tasa_anual: tasaDesc / 100,
      plazo_meses: plazoM,
      frecuencia: "mensual",
      metodo_amort: "bullet",
      fecha_origen: fechaOrigen,
      estatus: "vigente",
      tipo_tasa: "fija",
      tasa_referencia: null,
      valor_referencia: null,
      spread_pp: null,
      tipo_garantia: input.tipo_garantia || "quirografaria",
      periodo_gracia_meses: 0,
      tipo_gracia: "ninguna",
      tipo_disposicion: "unica",
      deudor: input.deudor,
      monto_factura: montoFactura,
      aforo,
      tasa_descuento: tasaDesc,
      comision_pct: comPct,
      fecha_vencimiento: fechaVenc,
    };

    const cupones: Cupon[] = [
      {
        numero_cupon: 1,
        fecha_pago: fechaVenc,
        saldo_inicial: desg.anticipo,
        capital: desg.anticipo,
        interes: desg.descuento,
        pago_total: montoFactura,
        saldo_final: 0,
      },
    ];

    return { creditoRow, cupones, disposicionMonto: desg.anticipo };
  }

  // ── LÍNEA REVOLVENTE ───────────────────────────────────────
  if (tp === "linea_revolvente") {
    const limite = input.limite_linea ?? 0;
    if (limite <= 0) throw new Error("limite_linea debe ser > 0");
    if (tasaEfectivaPct <= 0) throw new Error("tasa debe ser > 0");
    const plazo = input.plazo_meses ?? 0;
    if (plazo <= 0) throw new Error("plazo_meses (vigencia) debe ser > 0");

    const tasaFinal = tasaEfectivaPct / 100;
    const creditoRow: Record<string, any> = {
      folio,
      acreditado: input.acreditado,
      ...(input.cliente_id ? { cliente_id: input.cliente_id } : {}),
      rfc: input.rfc || null,
      tipo_producto: "linea_revolvente",
      monto: 0,
      limite_linea: limite,
      tasa_anual: tasaFinal,
      plazo_meses: plazo,
      frecuencia: input.frecuencia ?? "mensual",
      metodo_amort: "bullet",
      fecha_origen: input.fecha_origen,
      estatus: "vigente",
      tipo_tasa: input.tipo_tasa ?? "fija",
      tasa_referencia:
        input.tipo_tasa === "variable" ? (input.tasa_referencia ?? null) : null,
      valor_referencia:
        input.tipo_tasa === "variable"
          ? (input.valor_referencia_pct ?? 0) / 100
          : null,
      spread_pp:
        input.tipo_tasa === "variable" ? (input.spread_pp ?? 0) / 100 : null,
      tipo_garantia: input.tipo_garantia || "quirografaria",
      periodo_gracia_meses: 0,
      tipo_gracia: "ninguna",
      tipo_disposicion: "unica",
    };

    const dispInicial = input.disposicion_inicial ?? 0;
    const movInicial = dispInicial > 0
      ? { fecha: input.fecha_origen, tipo: "disposicion" as const, monto: dispInicial }
      : undefined;

    return { creditoRow, cupones: [], disposicionMonto: 0, movimientoInicial: movInicial };
  }

  // ── CRÉDITO SIMPLE / ARRENDAMIENTO ────────────────────────
  const graciaNum = input.periodo_gracia_meses ?? 0;
  const freq: Frecuencia = input.frecuencia ?? "mensual";
  const metodo: MetodoAmort = input.metodo_amort ?? "frances";
  const plazo = input.plazo_meses ?? 0;
  const vrNum = esArr ? (input.valor_residual ?? 0) : 0;

  let capitalBase: number;
  let montoGuardar: number;

  if (esArr) {
    const valorBien = input.valor_bien ?? 0;
    const enganche = input.enganche ?? 0;
    capitalBase = valorBien - enganche;
    montoGuardar = capitalBase;
    if (valorBien <= 0) throw new Error("valor_bien debe ser > 0");
    if (capitalBase <= 0) throw new Error("monto financiado debe ser > 0");
    if (vrNum >= capitalBase)
      throw new Error("valor_residual debe ser < monto financiado");
  } else {
    capitalBase = input.monto ?? 0;
    montoGuardar = capitalBase;
    if (capitalBase <= 0) throw new Error("monto debe ser > 0");
  }

  if (tasaEfectivaPct <= 0) throw new Error("tasa debe ser > 0");
  if (plazo <= 0) throw new Error("plazo_meses debe ser > 0");
  if (graciaNum >= plazo) throw new Error("gracia debe ser < plazo");

  const tasaFinal = tasaEfectivaPct / 100;

  const tabla = generarTablaAmortizacion({
    monto: capitalBase,
    tasaAnual: tasaFinal,
    plazoMeses: plazo,
    frecuencia: freq,
    metodo,
    fechaOrigen: input.fecha_origen,
    crecimientoPeriodo:
      metodo === "creciente" ? (input.crecimiento_pct ?? 5) / 100 : undefined,
    graciaPeridos:
      graciaNum > 0 ? calcularGraciaPeridos(graciaNum, freq) : 0,
    tipoGracia: graciaNum > 0 ? (input.tipo_gracia ?? "ninguna") : "ninguna",
    valorResidual: vrNum,
  });

  const creditoRow: Record<string, any> = {
    folio,
    acreditado: input.acreditado,
    rfc: input.rfc || null,
    tipo_producto: tp,
    monto: montoGuardar,
    tasa_anual: tasaFinal,
    plazo_meses: plazo,
    frecuencia: freq,
    metodo_amort: metodo,
    fecha_origen: input.fecha_origen,
    estatus: "vigente",
    tipo_tasa: input.tipo_tasa ?? "fija",
    tasa_referencia:
      input.tipo_tasa === "variable" ? (input.tasa_referencia ?? null) : null,
    valor_referencia:
      input.tipo_tasa === "variable"
        ? (input.valor_referencia_pct ?? 0) / 100
        : null,
    spread_pp:
      input.tipo_tasa === "variable" ? (input.spread_pp ?? 0) / 100 : null,
    tipo_garantia:
      input.tipo_garantia ||
      (esArr ? "bien_arrendado" : "quirografaria"),
    periodo_gracia_meses: graciaNum,
    tipo_gracia: graciaNum > 0 ? (input.tipo_gracia ?? "ninguna") : "ninguna",
    tipo_disposicion: input.tipo_disposicion ?? "unica",
  };

  if (esArr) {
    creditoRow.valor_bien = input.valor_bien ?? 0;
    creditoRow.enganche = input.enganche ?? 0;
    creditoRow.valor_residual = vrNum;
  }

  // For variable-rate credits, stamp each coupon with the origin rate
  if (input.tipo_tasa === "variable") {
    const valRef = (input.valor_referencia_pct ?? 0) / 100; // decimal
    const tasaAplicada = tasaFinal; // already decimal
    for (const c of tabla) {
      c.valor_referencia = valRef;
      c.tasa_aplicada = tasaAplicada;
    }
  }

  return { creditoRow, cupones: tabla, disposicionMonto: capitalBase };
}
