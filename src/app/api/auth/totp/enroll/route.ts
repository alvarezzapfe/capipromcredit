export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateSecret, generateQRCode, encrypt } from "@/lib/totp";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Check if already enrolled (non-pending)
  const { data: existing } = await supabase
    .from("user_totp")
    .select("pending")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing && !existing.pending) {
    return NextResponse.json(
      { error: "TOTP ya configurado" },
      { status: 409 }
    );
  }

  const secret = generateSecret();
  const qrDataUrl = await generateQRCode(user.email ?? "usuario", secret);
  const encrypted = encrypt(secret);

  const admin = createAdminClient();

  // Upsert: replace pending enrollment or create new
  const { error } = await admin.from("user_totp").upsert(
    {
      user_id: user.id,
      secret_encrypted: encrypted,
      pending: true,
      enrolled_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json(
      { error: "Error al guardar" },
      { status: 500 }
    );
  }

  return NextResponse.json({ qrDataUrl, secret });
}
