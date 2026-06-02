"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/lib/useIsMobile";

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

export default function EnrolarTOTP() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [cargandoQr, setCargandoQr] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/totp/enroll", { method: "POST" });
        if (res.status === 409) {
          // Already enrolled — go to dashboard
          router.push("/dashboard");
          return;
        }
        if (!res.ok) {
          setError("No se pudo iniciar el enrolamiento.");
          setCargandoQr(false);
          return;
        }
        const data = await res.json();
        setQr(data.qrDataUrl);
        setSecret(data.secret);
      } catch {
        setError("Error de conexión.");
      }
      setCargandoQr(false);
    })();
  }, [router]);

  async function confirmar(code: string) {
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/auth/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      if (!res.ok) {
        setCargando(false);
        setError("Código incorrecto. Verifica tu app autenticadora.");
        setShakeKey((k) => k + 1);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setCargando(false);
      setError("Error de conexión.");
      setShakeKey((k) => k + 1);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        position: "relative",
        background:
          "radial-gradient(ellipse at 85% 12%, rgba(201,169,97,0.07) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, #16294D 0%, transparent 55%), linear-gradient(170deg, #0F1F3A 0%, #0A1628 100%)",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: NOISE_SVG,
          backgroundRepeat: "repeat",
          opacity: 0.45,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 440,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div className="login-fade-1" style={{ textAlign: "center", marginBottom: 40 }}>
          <Image
            src="/CapiProm_Logo_Negativo.png"
            alt="CapiProm Credit"
            width={220}
            height={64}
            style={{ objectFit: "contain" }}
            priority
          />
        </div>

        <div
          className="login-fade-2"
          style={{
            padding: isMobile ? "28px 22px 24px" : "44px 40px 36px",
            background: "rgba(15,31,58,0.55)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(201,169,97,0.12)",
            borderRadius: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <div className="login-fade-3">
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                color: "var(--crema)",
                marginBottom: 8,
              }}
            >
              Configura tu segundo factor
            </h1>
            <p
              style={{
                fontSize: 13.5,
                color: "var(--texto-tenue)",
                marginBottom: 28,
                lineHeight: 1.5,
              }}
            >
              Escanea el código QR con Google Authenticator, 1Password o Authy.
              Luego ingresa el código que aparezca para confirmar.
            </p>

            {cargandoQr ? (
              <div
                style={{
                  height: 220,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--texto-tenue)",
                  fontSize: 13,
                }}
              >
                Generando código…
              </div>
            ) : (
              <>
                {qr && (
                  <div
                    style={{
                      background: "#ffffff",
                      padding: 16,
                      borderRadius: 12,
                      width: "fit-content",
                      margin: "0 auto 20px",
                    }}
                  >
                    <img
                      src={qr}
                      alt="Código QR para autenticador"
                      width={188}
                      height={188}
                    />
                  </div>
                )}

                {secret && (
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--texto-tenue)",
                        marginBottom: 6,
                      }}
                    >
                      O captura manual
                    </div>
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--champagne-400)",
                        wordBreak: "break-all",
                        userSelect: "all",
                      }}
                    >
                      {secret}
                    </code>
                  </div>
                )}

                <p
                  style={{
                    fontSize: 12,
                    color: "var(--texto-tenue)",
                    textAlign: "center",
                    marginBottom: 20,
                  }}
                >
                  Ingresa el código de 6 dígitos para confirmar
                </p>

                <TOTPBoxes
                  onComplete={confirmar}
                  shakeKey={shakeKey}
                  disabled={cargando}
                  compact={isMobile}
                />

                {error && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    style={{
                      marginTop: 16,
                      background: "rgba(181,72,72,0.12)",
                      color: "#E8A0A0",
                      padding: "10px 14px",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    {error}
                  </div>
                )}

                {cargando && (
                  <p
                    style={{
                      textAlign: "center",
                      color: "var(--texto-tenue)",
                      fontSize: 13,
                      marginTop: 14,
                    }}
                  >
                    Activando…
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div
          className="login-fade-4"
          style={{
            textAlign: "center",
            marginTop: 28,
            fontSize: 10.5,
            fontWeight: 500,
            color: "var(--texto-tenue)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Configura 2FA para proteger tu cuenta
        </div>
      </div>
    </main>
  );
}

/* ================================================================
   TOTP 6-box input (duplicated from page.tsx — same component)
   ================================================================ */
function TOTPBoxes({
  onComplete,
  shakeKey,
  disabled,
  compact,
}: {
  onComplete: (code: string) => void;
  shakeKey: number;
  disabled: boolean;
  compact?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (shakeKey > 0) {
      setDigits(Array(6).fill(""));
      setTimeout(() => refs.current[0]?.focus(), 50);
    }
  }, [shakeKey]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (disabled) return;
      const d = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = d;
      setDigits(next);
      if (d && index < 5) refs.current[index + 1]?.focus();
      if (d && index === 5) {
        const code = next.join("");
        if (code.length === 6) onComplete(code);
      }
    },
    [digits, disabled, onComplete]
  );

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    text.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setDigits(next);
    if (text.length === 6) onComplete(text);
    else refs.current[text.length]?.focus();
  }

  return (
    <div
      key={shakeKey}
      className={shakeKey > 0 ? "login-shake" : undefined}
      style={{ display: "flex", gap: compact ? 6 : 10, justifyContent: "center" }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          disabled={disabled}
          aria-label={`Dígito ${i + 1}`}
          style={{
            width: compact ? 42 : 52,
            height: compact ? 52 : 62,
            textAlign: "center",
            fontSize: 26,
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            color: "var(--crema)",
            background: "rgba(10,22,40,0.6)",
            border: d
              ? "1px solid var(--champagne-500)"
              : "1px solid rgba(201,169,97,0.18)",
            borderRadius: 8,
            outline: "none",
            caretColor: "var(--champagne-500)",
            transition: "border-color 0.2s, box-shadow 0.2s",
            boxShadow: d ? "0 0 0 2px rgba(201,169,97,0.1)" : "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--champagne-500)";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,169,97,0.15)";
          }}
          onBlur={(e) => {
            if (!d) {
              e.currentTarget.style.borderColor = "rgba(201,169,97,0.18)";
              e.currentTarget.style.boxShadow = "none";
            }
          }}
        />
      ))}
    </div>
  );
}
