import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin"]);
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { user_id } = await request.json();

  if (user_id === caller.userId) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 409 });
  }

  const admin = createAdminClient();

  // Block deleting the last super_admin
  const { data: target } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", user_id)
    .single();

  if (target?.rol === "super_admin") {
    const { count } = await admin
      .from("perfiles")
      .select("id", { count: "exact", head: true })
      .eq("rol", "super_admin")
      .eq("activo", true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "No puedes eliminar al único super admin activo" },
        { status: 409 }
      );
    }
  }

  // ON DELETE CASCADE clears perfiles + user_totp
  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
