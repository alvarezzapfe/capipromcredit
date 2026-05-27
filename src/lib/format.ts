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
  "vigente",
  "en_mora",
  "vencido",
  "liquidado",
  "cancelado",
] as const;

export const ESTATUS_SOLICITUD = [
  "nueva",
  "en_revision",
  "aprobada",
  "rechazada",
  "convertida",
] as const;

export const labelEstatus: Record<string, string> = {
  vigente: "Vigente",
  en_mora: "En mora",
  vencido: "Vencido",
  liquidado: "Liquidado",
  cancelado: "Cancelado",
  nueva: "Nueva",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};
