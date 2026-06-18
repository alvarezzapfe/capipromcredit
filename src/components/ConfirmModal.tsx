"use client";

type Variante = "neutral" | "aprobacion" | "peligro";

interface Props {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  variante?: Variante;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACCENT: Record<Variante, { bg: string; color: string; btnBg: string; btnColor: string }> = {
  neutral:    { bg: "#f0f2f5",          color: "#0a1628",     btnBg: "var(--amber)",  btnColor: "#fff" },
  aprobacion: { bg: "var(--green-soft)", color: "var(--green)", btnBg: "var(--green)",  btnColor: "#fff" },
  peligro:    { bg: "var(--red-soft)",   color: "var(--red)",   btnBg: "var(--red)",    btnColor: "#fff" },
};

export function ConfirmModal({
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  variante = "neutral",
  onConfirm,
  onCancel,
}: Props) {
  const a = ACCENT[variante];

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(10,22,40,0.45)", backdropFilter: "blur(6px)",
        display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420,
          background: "#fff", borderRadius: 12,
          boxShadow: "0 8px 30px rgba(10,22,40,0.12), 0 0 0 1px rgba(10,22,40,0.04) inset",
          overflow: "hidden",
        }}
      >
        {/* Header accent bar */}
        <div style={{ height: 4, background: a.btnBg }} />

        <div style={{ padding: "24px 28px" }}>
          <h3 style={{
            fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600,
            color: a.color, marginBottom: 10,
          }}>
            {titulo}
          </h3>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6,
            color: "var(--text-dim)", marginBottom: 24,
          }}>
            {mensaje}
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onCancel}
              style={{
                padding: "9px 18px", fontSize: 13.5, fontWeight: 500, fontFamily: "inherit",
                background: "transparent", border: "1px solid var(--line)", borderRadius: 8,
                color: "var(--text-dim)", cursor: "pointer",
              }}
            >
              {textoCancelar}
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: "9px 22px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit",
                background: a.btnBg, color: a.btnColor, border: "none", borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {textoConfirmar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
