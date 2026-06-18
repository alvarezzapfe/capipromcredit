export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { decrypt, verifyToken } from "@/lib/totp";

export async function POST(request: Request) {
  // 1. Server-side role validation
  const auth = await requireRol(["super_admin", "admin"]);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { scope, segundo_factor } = body as {
    scope: string;
    segundo_factor: { tipo: "totp" | "password"; valor: string };
  };

  if (!segundo_factor?.valor) {
    return NextResponse.json({ error: "Segundo factor requerido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. Verify second factor
  if (segundo_factor.tipo === "totp") {
    const { data: totpRecord } = await admin
      .from("user_totp")
      .select("secret_encrypted, pending")
      .eq("user_id", auth.userId)
      .single();

    if (!totpRecord || totpRecord.pending) {
      return NextResponse.json({ error: "TOTP no configurado para este usuario" }, { status: 400 });
    }

    const secret = decrypt(totpRecord.secret_encrypted);
    if (!verifyToken(segundo_factor.valor, secret)) {
      return NextResponse.json({ error: "Código TOTP incorrecto" }, { status: 401 });
    }
  } else {
    // Re-verify password via Supabase Auth
    const supabase = await createClient();
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: auth.email,
      password: segundo_factor.valor,
    });
    if (authErr) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }
  }

  // 3. Call RPC vaciar_datos
  const rpcScope = scope === "con_tasas" ? "con_tasas" : "operativo";
  const supabaseAuth = await createClient();
  const { data: conteos, error: rpcErr } = await supabaseAuth.rpc("vaciar_datos", { p_scope: rpcScope });

  if (rpcErr) {
    return NextResponse.json({ error: "Error al vaciar: " + rpcErr.message }, { status: 500 });
  }

  // 4. Clean Storage bucket 'expedientes' (service role only on server)
  try {
    const { data: files } = await admin.storage.from("expedientes").list("", {
      limit: 10000,
    });
    if (files && files.length > 0) {
      // List recursively by fetching folder contents
      const allPaths: string[] = [];
      async function listRecursive(prefix: string) {
        const { data: items } = await admin.storage.from("expedientes").list(prefix, { limit: 10000 });
        for (const item of items ?? []) {
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id) {
            allPaths.push(path);
          } else {
            await listRecursive(path);
          }
        }
      }
      await listRecursive("");
      if (allPaths.length > 0) {
        await admin.storage.from("expedientes").remove(allPaths);
      }
    }
  } catch {
    // Storage cleanup is best-effort; data wipe already succeeded
  }

  return NextResponse.json({ ok: true, conteos });
}
