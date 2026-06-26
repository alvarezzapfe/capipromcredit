export const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n || 0);

export const pct = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "percent",
    minimumFractionDigits: 2,
  }).format(n || 0);

export const fecha = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const ESTATUS_CREDITO = [
  "borrador",
  "vigente",
  "en_mora",
  "vencido",
  "liquidado",
  "cancelado",
  "reestructurado",
] as const;

export const ESTATUS_SOLICITUD = [
  "nueva",
  "en_revision",
  "aprobada",
  "rechazada",
  "convertida",
] as const;

export const labelEstatus: Record<string, string> = {
  borrador: "Por revisar",
  vigente: "Vigente",
  en_mora: "En mora",
  vencido: "Vencido",
  liquidado: "Liquidado",
  cancelado: "Cancelado",
  reestructurado: "Reestructurado",
  nueva: "Nueva",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};

export const TIPO_PRODUCTO_LABEL: Record<string, string> = {
  credito_simple: "Crédito",
  arrendamiento_financiero: "Arr. Fin.",
  arrendamiento_puro: "Arr. Puro",
  factoraje: "Factoraje",
  linea_revolvente: "Revolvente",
};

export const TIPO_PRODUCTO_FULL: Record<string, string> = {
  credito_simple: "Crédito Simple",
  arrendamiento_financiero: "Arrendamiento Financiero",
  arrendamiento_puro: "Arrendamiento Puro",
  factoraje: "Factoraje",
  linea_revolvente: "Línea Revolvente",
};

export const FRECUENCIA_WIZARD_LABEL: Record<string, string> = {
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  cuatrimestral: "Cuatrimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export const ESQUEMA_LABEL: Record<string, string> = {
  frances: "Francesa (cuota fija)",
  lineal: "Lineal (capital fijo, cuota decreciente)",
  bullet: "Bullet (capital al final)",
  creciente: "Creciente (cuota creciente)",
  int_capdif: "Int. periódico + capital diferido",
};

export const CONVENCION_LABEL: Record<string, string> = {
  "ACT/360": "ACT/360",
  "ACT/365": "ACT/365",
  "30E/360": "30E/360",
};

export const GRACIA_WIZARD_LABEL: Record<string, string> = {
  sin_pago: "Sin pago",
  solo_interes: "Solo interés",
  capitaliza_interes: "Capitaliza interés",
};

/**
 * Traduce tipo_gracia de BD ('ninguna'|'capital'|'total') al tipo del motor schedule
 * ('sin_pago'|'solo_interes'|'capitaliza_interes').
 * Mapeo: 'capital' → 'solo_interes', 'total' → 'capitaliza_interes', 'ninguna' → 'solo_interes' (fallback).
 */
export function tipoGraciaBdToMotor(bd: string | null | undefined): "sin_pago" | "solo_interes" | "capitaliza_interes" {
  if (bd === "total") return "capitaliza_interes";
  if (bd === "capital") return "solo_interes";
  return "solo_interes"; // 'ninguna' or null: fallback (gracia check is separate via graciaMeses)
}

/**
 * Traduce tipo_gracia del motor schedule al valor de BD.
 * Mapeo: 'solo_interes' → 'capital', 'capitaliza_interes' → 'total', 'sin_pago' → 'ninguna'.
 */
export function tipoGraciaMotorToBd(motor: string): "ninguna" | "capital" | "total" {
  if (motor === "solo_interes") return "capital";
  if (motor === "capitaliza_interes") return "total";
  return "ninguna";
}

export const GARANTIA_LABEL: Record<string, string> = {
  quirografaria: "Quirografaria",
  fideicomiso_flujo: "Fideicomiso",
  derecho_cobro: "Der. cobro",
  bien_arrendado: "Bien arrendado",
};
