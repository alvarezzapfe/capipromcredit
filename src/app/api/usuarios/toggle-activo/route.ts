import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin"]);
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { user_id, activo } = await request.json();

  if (user_id === caller.userId) {
    return NextResponse.json({ error: "No puedes desactivarte a ti mismo" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("perfiles").update({ activo }).eq("id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
