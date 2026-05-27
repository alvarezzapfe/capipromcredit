import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin"]);
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { user_id } = await request.json();

  const admin = createAdminClient();
  await admin.from("user_totp").delete().eq("user_id", user_id);

  return NextResponse.json({ ok: true });
}
