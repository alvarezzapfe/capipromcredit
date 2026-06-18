export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

const TABLAS_OPERATIVAS = [
  "clientes",
  "solicitudes",
  "creditos",
  "amortizacion",
  "disposiciones",
  "movimientos_linea",
  "documentos_cliente",
] as const;

const TABLAS_TASAS = ["rate_catalog"] as const;

function buildFilename(): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `capiprom_backup_${ts}.json`;
}

async function buildBackup(scope: string, email: string) {
  const admin = createAdminClient();
  const backup: Record<string, any> = {
    _meta: {
      fecha: new Date().toISOString(),
      scope,
      generado_por: email,
      version: "1.0",
    },
  };

  for (const tabla of TABLAS_OPERATIVAS) {
    const { data } = await admin.from(tabla).select("*");
    backup[tabla] = data ?? [];
  }

  if (scope === "con_tasas") {
    for (const tabla of TABLAS_TASAS) {
      const { data } = await admin.from(tabla).select("*");
      backup[tabla] = data ?? [];
    }
  }

  return backup;
}

/** GET: descarga directa del respaldo como JSON */
export async function GET(request: Request) {
  const auth = await requireRol(["super_admin", "admin"]);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "operativo";

  const backup = await buildBackup(scope, auth.email);
  const filename = buildFilename();

  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** POST: genera backup, sube a bucket 'respaldos', devuelve signed URL */
export async function POST(request: Request) {
  const auth = await requireRol(["super_admin", "admin"]);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const scope = (body as any).scope ?? "operativo";

  const backup = await buildBackup(scope, auth.email);
  const filename = buildFilename();
  const jsonStr = JSON.stringify(backup, null, 2);

  // Upload to Storage bucket 'respaldos' using service role
  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from("respaldos")
    .upload(filename, jsonStr, {
      contentType: "application/json",
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: "Error subiendo respaldo: " + uploadErr.message },
      { status: 500 },
    );
  }

  // Generate signed URL (1 hour)
  const { data: signedData, error: signErr } = await admin.storage
    .from("respaldos")
    .createSignedUrl(filename, 3600);

  if (signErr || !signedData) {
    return NextResponse.json(
      { error: "Respaldo subido pero error generando URL: " + (signErr?.message ?? "") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    filename,
    signedUrl: signedData.signedUrl,
  });
}
