// Reset password for a user (super_admin only).
// Generates a secure temporary password, updates it in Supabase Auth,
// optionally sends it via Resend email, and logs to bitacora.
// The user's TOTP enrollment is NOT touched.

import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";
import { Resend } from "resend";
import crypto from "crypto";

function generarPasswordSegura(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;

  const bytes = crypto.randomBytes(14);
  // Ensure at least one of each category
  const required = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  const rest = Array.from(bytes.slice(4)).map((b) => all[b % all.length]);
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function buildEmailHTML(targetEmail: string, password: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Figtree',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:#0B1933;padding:28px 36px;">
          <span style="font-family:'Bricolage Grotesque',Helvetica,sans-serif;font-size:22px;font-weight:600;color:#E5C77A;letter-spacing:-0.02em;">CapiProm Credit</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 16px;font-size:15px;color:#1a2230;line-height:1.6;">
            Hola,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a2230;line-height:1.6;">
            El administrador del sistema ha generado una nueva contraseña temporal para tu cuenta <strong>${targetEmail}</strong>.
          </p>
          <!-- Password block -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background:#0F1F3A;border-radius:8px;padding:20px 24px;text-align:center;">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;color:#E5C77A;letter-spacing:0.05em;">${password}</span>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:14px;color:#5b6b80;line-height:1.6;">
            Usa esta contraseña para acceder al sistema. Te recomendamos cambiarla en cuanto ingreses.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#5b6b80;line-height:1.6;">
            Si ya tienes configurado tu segundo factor (2FA), deberás ingresarlo como siempre después de la contraseña.
          </p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#C9A961;border-radius:8px;">
              <a href="https://capipromcredit.vercel.app" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#0B1933;text-decoration:none;font-family:'Figtree',Helvetica,sans-serif;">
                Acceder a CapiProm Credit
              </a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid #e4e8ee;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5;">
            &copy; 2026 CapiProm Credit &middot; Email automático, no responder a este correo
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin"]);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const userId = String(body.user_id ?? "").trim();
  const method: "email" | "pantalla" = body.method === "email" ? "email" : "pantalla";

  if (!userId) {
    return NextResponse.json({ error: "user_id es requerido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get target user info
  const { data: perfil } = await admin
    .from("perfiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!perfil) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const nuevaPassword = generarPasswordSegura();

  // Update password in Supabase Auth
  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    password: nuevaPassword,
  });

  if (updateErr) {
    return NextResponse.json(
      { error: "Error al actualizar contraseña: " + updateErr.message },
      { status: 500 }
    );
  }

  // Audit trail
  await admin.from("bitacora").insert({
    entidad: "usuario",
    entidad_id: userId,
    accion: "password_reset",
    detalle: {
      target_email: perfil.email,
      target_user_id: userId,
      method,
      reset_by_email: caller.email,
      reset_by_user_id: caller.userId,
    },
    usuario: caller.email,
  });

  // If method is email, send via Resend
  if (method === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        password: nuevaPassword,
        emailSent: false,
        warning: "Contraseña actualizada pero RESEND_API_KEY no configurada. Comparte la contraseña manualmente.",
      });
    }

    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: "CapiProm Credit <accesos@plinius.mx>",
        to: [perfil.email],
        subject: "Tu nueva contraseña temporal — CapiProm Credit",
        html: buildEmailHTML(perfil.email, nuevaPassword),
      });
      return NextResponse.json({ ok: true, emailSent: true });
    } catch (emailErr: any) {
      // Password already changed but email failed — return password so admin can share manually
      return NextResponse.json({
        ok: true,
        password: nuevaPassword,
        emailSent: false,
        warning: `Contraseña actualizada pero el email no se pudo enviar: ${emailErr.message}. Compártela manualmente.`,
      });
    }
  }

  // Method is "pantalla" — return password to display
  return NextResponse.json({ ok: true, password: nuevaPassword, emailSent: false });
}
