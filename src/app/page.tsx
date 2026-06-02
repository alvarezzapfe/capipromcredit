"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { useIsMobile } from "@/lib/useIsMobile";

type Paso = "credenciales" | "verificar";

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

export default function Acceso() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [paso, setPaso] = useState<Paso>("credenciales");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  async function entrar() {
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error: errLogin } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (errLogin) {
      setCargando(false);
      setError("Credenciales inválidas.");
      return;
    }

    // Check TOTP enrollment status
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCargando(false);
      setError("Error de sesión.");
      return;
    }

    const { data: totp } = await supabase
      .from("user_totp")
      .select("pending")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!totp || totp.pending) {
      // No TOTP enrolled → go to enrollment
      router.push("/seguridad/enrolar");
      return;
    }

    // Has TOTP → show verification step
    setPaso("verificar");
    setCargando(false);
  }

  async function verificarTotp(code: string) {
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      if (!res.ok) {
        setCargando(false);
        setError("Código incorrecto. Intenta de nuevo.");
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
      {/* Grain overlay */}
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
          maxWidth: 420,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
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

        {/* Card */}
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
          {paso === "credenciales" && (
            <CredencialesForm
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              error={error}
              cargando={cargando}
              onSubmit={entrar}
            />
          )}

          {paso === "verificar" && (
            <TOTPForm
              error={error}
              cargando={cargando}
              shakeKey={shakeKey}
              isMobile={isMobile}
              onSubmit={verificarTotp}
              onBack={() => {
                setPaso("credenciales");
                setError(null);
              }}
            />
          )}
        </div>

        {/* Footer */}
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
          &copy; 2026 CapiProm Credit &middot; Todos los derechos reservados
        </div>
      </div>
    </main>
  );
}

/* ================================================================
   Credenciales Form
   ================================================================ */
function CredencialesForm({
  email,
  setEmail,
  password,
  setPassword,
  error,
  cargando,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  cargando: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="login-fade-3">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--crema)",
          marginBottom: 8,
        }}
      >
        Acceso seguro
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--texto-tenue)",
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        Ingresa con tus credenciales. Se te pedirá tu segundo factor.
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--texto-tenue)",
          marginBottom: 32,
          lineHeight: 1.6,
          opacity: 0.75,
        }}
      >
        CapiProm Credit es la plataforma de administración de cartera,
        originación y cobranza de crédito.
      </p>

      <div style={{ display: "grid", gap: 22 }}>
        <LoginField label="Correo" htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operador@capiprom.mx"
            autoComplete="email"
            style={inputStyle}
          />
        </LoginField>

        <LoginField label="Contraseña" htmlFor="login-password">
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="••••••••"
            autoComplete="current-password"
            style={inputStyle}
          />
        </LoginField>

        {error && <LoginError msg={error} />}

        <button
          className="btn-dorado"
          onClick={onSubmit}
          disabled={cargando}
          style={{ marginTop: 4 }}
        >
          {cargando ? "Verificando…" : "Continuar"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   TOTP Form
   ================================================================ */
function TOTPForm({
  error,
  cargando,
  shakeKey,
  isMobile,
  onSubmit,
  onBack,
}: {
  error: string | null;
  cargando: boolean;
  isMobile?: boolean;
  shakeKey: number;
  onSubmit: (code: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="login-fade-3">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--crema)",
          marginBottom: 8,
        }}
      >
        Segundo factor
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--texto-tenue)",
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        Ingresa el código de 6 dígitos de tu app autenticadora.
      </p>

      <TOTPBoxes
        onComplete={onSubmit}
        shakeKey={shakeKey}
        disabled={cargando}
        compact={isMobile}
      />

      {error && (
        <div style={{ marginTop: 16 }} role="alert" aria-live="assertive">
          <LoginError msg={error} />
        </div>
      )}

      {cargando && (
        <p
          style={{
            textAlign: "center",
            color: "var(--texto-tenue)",
            fontSize: 13,
            marginTop: 16,
          }}
        >
          Verificando…
        </p>
      )}

      <div
        style={{
          marginTop: 28,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--texto-tenue)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            padding: 0,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--texto-claro)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--texto-tenue)")
          }
        >
          &larr; Cambiar de cuenta
        </button>
        <span style={{ color: "rgba(168,158,136,0.5)" }}>
          Usar código de respaldo
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   TOTP 6-box input
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

  // Focus first box on mount
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  // Clear on shake (error)
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

      if (d && index < 5) {
        refs.current[index + 1]?.focus();
      }
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
    if (text.length === 6) {
      onComplete(text);
    } else {
      refs.current[text.length]?.focus();
    }
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
            boxShadow: d
              ? "0 0 0 2px rgba(201,169,97,0.1)"
              : "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--champagne-500)";
            e.currentTarget.style.boxShadow =
              "0 0 0 2px rgba(201,169,97,0.15)";
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

/* ================================================================
   Shared sub-components
   ================================================================ */
function LoginField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--texto-tenue)",
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      <div className="login-input-wrap">{children}</div>
    </div>
  );
}

function LoginError({ msg }: { msg: string }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(181,72,72,0.12)",
        color: "#E8A0A0",
        padding: "10px 14px",
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      {msg}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 0",
  fontSize: 15,
  fontFamily: "var(--font-body)",
  color: "var(--texto-claro)",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(232,226,212,0.15)",
  outline: "none",
  transition: "border-color 0.2s",
};
