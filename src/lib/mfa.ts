import { createClient } from "@/lib/supabase-client";

// =====================================================================
// Helpers de MFA (TOTP) sobre Supabase Auth
// =====================================================================

// ¿El usuario ya tiene un factor TOTP verificado?
export async function tieneTOTP(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return false;
  return (data?.totp ?? []).some((f) => f.status === "verified");
}

// Nivel de aseguramiento actual:
// aal1 = solo password; aal2 = password + TOTP verificado en esta sesión
export async function nivelAuth(): Promise<{
  actual: string | null;
  siguiente: string | null;
}> {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    actual: data?.currentLevel ?? null,
    siguiente: data?.nextLevel ?? null,
  };
}

// Inicia el enrolamiento: devuelve el QR (svg) y el secret para el authenticator
export async function enrolarTOTP() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "CapiProm-" + Date.now(),
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qr: data.totp.qr_code, // SVG data URL
    secret: data.totp.secret, // por si prefieren capturarlo manual
    uri: data.totp.uri,
  };
}

// Verifica el código de 6 dígitos para completar el enrolamiento
export async function verificarEnrolamiento(factorId: string, codigo: string) {
  const supabase = createClient();
  const { data: challenge, error: errCh } =
    await supabase.auth.mfa.challenge({ factorId });
  if (errCh) throw errCh;
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: codigo,
  });
  if (error) throw error;
  return true;
}

// Verifica el código en el login (sesión ya iniciada con password, falta aal2)
export async function verificarLogin(codigo: string) {
  const supabase = createClient();
  const { data: factors, error: errF } = await supabase.auth.mfa.listFactors();
  if (errF) throw errF;
  const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!totp) throw new Error("No hay factor TOTP configurado.");

  const { data: challenge, error: errCh } =
    await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (errCh) throw errCh;

  const { error } = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code: codigo,
  });
  if (error) throw error;
  return true;
}
