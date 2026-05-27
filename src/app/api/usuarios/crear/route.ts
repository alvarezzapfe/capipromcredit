import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin"]);
  if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const { email, password, rol, activo } = body;

  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: "Email y contraseña (min 8 chars) son requeridos" }, { status: 400 });
  }
  if (!["super_admin", "admin", "demo"].includes(rol)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create auth user
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    const msg = authErr.message.includes("already been registered")
      ? "El correo ya está registrado"
      : authErr.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Insert profile
  const { error: profErr } = await admin.from("perfiles").upsert({
    id: authUser.user.id,
    email,
    rol,
    activo: activo !== false,
  }, { onConflict: "id" });

  if (profErr) {
    return NextResponse.json({ error: "Error al crear perfil: " + profErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: authUser.user.id });
}
