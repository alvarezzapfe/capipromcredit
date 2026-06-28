export { fmtPct, rateLabel, type RateLabelConfig } from "./rate-label";
export {
  lookupRate,
  tasaAnual,
  seccionar,
  ultimoDiaMesAnterior,
  type RateCatalogRow,
  type CreditRateConfig,
  type SeccionDevengo,
} from "./accrual";
export {
  generarSchedule,
  contarDias,
  baseDias,
  diffDiasACT,
  diffDias30E360,
  MESES_POR_PERIODO,
  type ParamsSchedule,
  type CuponSchedule,
  type ResultadoSchedule,
  type ConvencionDias,
  type FrecuenciaWizard,
  type TipoGraciaWizard,
  type EsquemaPreset,
  type BaseCalendario,
  type InteresBase,
  type SupuestoForward,
} from "./schedule";
export {
  calcularCAT,
  calcularTIR,
  calcularDuracion,
  calcularNPV,
  saldoInsolutoCupones,
  type DuracionResult,
} from "./metrics";
export {
  calcularSaldoMultiDisposicion,
  type CreditoMultiDisp,
  type DisposicionMin,
} from "./saldo-multi";
