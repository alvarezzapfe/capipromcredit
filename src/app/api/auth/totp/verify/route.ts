export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { decrypt, verifyToken } from "@/lib/totp";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const token = String(body.token ?? "").trim();
  if (token.length !== 6 || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: record } = await admin
    .from("user_totp")
    .select("secret_encrypted, pending")
    .eq("user_id", user.id)
    .single();

  if (!record || record.pending) {
    return NextResponse.json(
      { error: "TOTP no configurado" },
      { status: 400 }
    );
  }

  const secret = decrypt(record.secret_encrypted);
  const valid = verifyToken(token, secret);

  if (!valid) {
    return NextResponse.json(
      { error: "Código incorrecto" },
      { status: 401 }
    );
  }

  // Update last_used_at
  await admin
    .from("user_totp")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", user.id);

  // Set session cookie
  const response = NextResponse.json({ ok: true });
  response.cookies.set("totp_verified", "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  return response;
}
