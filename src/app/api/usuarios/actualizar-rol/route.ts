import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin"]);
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { user_id, rol } = await request.json();
  if (!["super_admin", "admin", "demo"].includes(rol)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Block degrading the last super_admin
  if (rol !== "super_admin") {
    const { data: current } = await admin
      .from("perfiles")
      .select("rol")
      .eq("id", user_id)
      .single();

    if (current?.rol === "super_admin") {
      const { count } = await admin
        .from("perfiles")
        .select("id", { count: "exact", head: true })
        .eq("rol", "super_admin")
        .eq("activo", true);

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "No puedes degradar al único super admin activo" },
          { status: 409 }
        );
      }
    }
  }

  const { error } = await admin.from("perfiles").update({ rol }).eq("id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
