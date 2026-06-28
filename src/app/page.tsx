"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { useIsMobile } from "@/lib/useIsMobile";

type Paso = "credenciales" | "verificar";

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
    const { error: errLogin } = await supabase.auth.signInWithPassword({ email, password });
    if (errLogin) { setCargando(false); setError("Credenciales inválidas."); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCargando(false); setError("Error de sesión."); return; }

    const { data: totp } = await supabase.from("user_totp").select("pending").eq("user_id", user.id).maybeSingle();
    if (!totp || totp.pending) { router.push("/seguridad/enrolar"); return; }

    setPaso("verificar");
    setCargando(false);
  }

  async function verificarTotp(code: string) {
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/auth/totp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: code }) });
      if (!res.ok) { setCargando(false); setError("Código incorrecto. Intenta de nuevo."); setShakeKey((k) => k + 1); return; }
      router.push("/dashboard");
      router.refresh();
    } catch { setCargando(false); setError("Error de conexión."); setShakeKey((k) => k + 1); }
  }

  return (
    <main style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: "#f8f9fb",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div className="login-fade-1" style={{ textAlign: "center", marginBottom: 36 }}>
          <Image src="/CapiProm_Logo_Positivo.png" alt="CapiProm Credit" width={180} height={52} style={{ objectFit: "contain" }} priority />
        </div>

        {/* Card */}
        <div className="login-fade-2" style={{
          padding: isMobile ? "32px 24px 28px" : "40px 36px 32px",
          background: "#ffffff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06)",
          border: "1px solid #eef0f3",
        }}>
          {paso === "credenciales" && (
            <CredencialesForm email={email} setEmail={setEmail} password={password} setPassword={setPassword} error={error} cargando={cargando} onSubmit={entrar} />
          )}
          {paso === "verificar" && (
            <TOTPForm error={error} cargando={cargando} shakeKey={shakeKey} isMobile={isMobile} onSubmit={verificarTotp} onBack={() => { setPaso("credenciales"); setError(null); }} />
          )}
        </div>

        {/* Footer */}
        <div className="login-fade-4" style={{
          textAlign: "center", marginTop: 24, fontSize: 11,
          fontWeight: 500, color: "#b0b8c4", letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          &copy; 2026 CapiProm Credit
        </div>
      </div>
    </main>
  );
}

/* ================================================================
   Credenciales Form
   ================================================================ */
function CredencialesForm({ email, setEmail, password, setPassword, error, cargando, onSubmit }: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  error: string | null; cargando: boolean; onSubmit: () => void;
}) {
  return (
    <div className="login-fade-3">
      <h1 style={{
        fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600,
        letterSpacing: "-0.02em", color: "#0a1628", marginBottom: 6,
      }}>
        Acceso seguro
      </h1>
      <p style={{ fontSize: 14, color: "#8292a4", marginBottom: 28, lineHeight: 1.5 }}>
        Ingresa con tus credenciales.
      </p>

      <div style={{ display: "grid", gap: 18 }}>
        <LoginField label="Correo" htmlFor="login-email">
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="operador@capiprom.mx" autoComplete="email" className="login-input" />
        </LoginField>

        <LoginField label="Contraseña" htmlFor="login-password">
          <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="••••••••" autoComplete="current-password" className="login-input" />
        </LoginField>

        {error && <LoginError msg={error} />}

        <button className="login-btn" onClick={onSubmit} disabled={cargando} style={{ marginTop: 2 }}>
          {cargando ? "Verificando…" : "Continuar"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   TOTP Form
   ================================================================ */
function TOTPForm({ error, cargando, shakeKey, isMobile, onSubmit, onBack }: {
  error: string | null; cargando: boolean; isMobile?: boolean; shakeKey: number;
  onSubmit: (code: string) => void; onBack: () => void;
}) {
  return (
    <div className="login-fade-3">
      <h1 style={{
        fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600,
        letterSpacing: "-0.02em", color: "#0a1628", marginBottom: 6,
      }}>
        Segundo factor
      </h1>
      <p style={{ fontSize: 14, color: "#8292a4", marginBottom: 28, lineHeight: 1.5 }}>
        Ingresa el código de 6 dígitos de tu app autenticadora.
      </p>

      <TOTPBoxes onComplete={onSubmit} shakeKey={shakeKey} disabled={cargando} compact={isMobile} />

      {error && <div style={{ marginTop: 16 }} role="alert" aria-live="assertive"><LoginError msg={error} /></div>}
      {cargando && <p style={{ textAlign: "center", color: "#8292a4", fontSize: 13, marginTop: 16 }}>Verificando…</p>}

      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "#8292a4", cursor: "pointer",
          fontFamily: "inherit", fontSize: "inherit", padding: 0, transition: "color 0.15s",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#0a1628")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#8292a4")}
        >
          &larr; Cambiar de cuenta
        </button>
        <span style={{ color: "#cbd5e1" }}>Usar código de respaldo</span>
      </div>
    </div>
  );
}

/* ================================================================
   TOTP 6-box input
   ================================================================ */
function TOTPBoxes({ onComplete, shakeKey, disabled, compact }: {
  onComplete: (code: string) => void; shakeKey: number; disabled: boolean; compact?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => { if (shakeKey > 0) { setDigits(Array(6).fill("")); setTimeout(() => refs.current[0]?.focus(), 50); } }, [shakeKey]);

  const handleChange = useCallback((index: number, value: string) => {
    if (disabled) return;
    const d = value.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[index] = d; setDigits(next);
    if (d && index < 5) refs.current[index + 1]?.focus();
    if (d && index === 5) { const code = next.join(""); if (code.length === 6) onComplete(code); }
  }, [digits, disabled, onComplete]);

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) { refs.current[index - 1]?.focus(); const next = [...digits]; next[index - 1] = ""; setDigits(next); }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return; e.preventDefault();
    const next = Array(6).fill(""); text.split("").forEach((ch, i) => { next[i] = ch; }); setDigits(next);
    if (text.length === 6) onComplete(text); else refs.current[text.length]?.focus();
  }

  return (
    <div key={shakeKey} className={shakeKey > 0 ? "login-shake" : undefined}
      style={{ display: "flex", gap: compact ? 8 : 10, justifyContent: "center" }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          disabled={disabled} aria-label={`Dígito ${i + 1}`}
          className="login-totp-box"
          style={{ width: compact ? 44 : 50, height: compact ? 52 : 58 }}
        />
      ))}
    </div>
  );
}

/* ================================================================
   Shared sub-components
   ================================================================ */
function LoginField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{
        display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.07em", color: "#8292a4", marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function LoginError({ msg }: { msg: string }) {
  return (
    <div role="alert" style={{
      background: "#fef2f2", color: "#b54848", border: "1px solid #fecaca",
      padding: "10px 14px", borderRadius: 8, fontSize: 13,
    }}>
      {msg}
    </div>
  );
}
