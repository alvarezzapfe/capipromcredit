export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createClient } from "@/lib/supabase-server";

/** POST: inserta nuevo valor en rate_catalog (solo super_admin) */
export async function POST(request: Request) {
  const auth = await requireRol(["super_admin"]);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado: solo super_admin puede cargar tasas" }, { status: 403 });
  }

  const body = await request.json();
  const { rate_type, rate_date, rate_value } = body as {
    rate_type: string;
    rate_date: string;
    rate_value: number;
  };

  if (!rate_type || !rate_date || rate_value == null || rate_value <= 0) {
    return NextResponse.json({ error: "rate_type, rate_date y rate_value (> 0) requeridos" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_catalog")
    .insert({ rate_type, rate_date, rate_value })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit trail
  await supabase.from("bitacora").insert({
    entidad: "rate_catalog",
    entidad_id: data.id,
    accion: "tasa_cargada",
    detalle: { rate_type, rate_date, rate_value },
    usuario: auth.email,
  });

  return NextResponse.json({ ok: true, row: data });
}
