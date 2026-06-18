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

export async function GET(request: Request) {
  // Server-side role validation
  const auth = await requireRol(["super_admin", "admin"]);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "operativo";

  const admin = createAdminClient();
  const backup: Record<string, any> = {
    _meta: {
      fecha: new Date().toISOString(),
      scope,
      generado_por: auth.email,
      version: "1.0",
    },
  };

  // Export operational tables
  for (const tabla of TABLAS_OPERATIVAS) {
    const { data } = await admin.from(tabla).select("*");
    backup[tabla] = data ?? [];
  }

  // Conditionally include rate catalog
  if (scope === "con_tasas") {
    for (const tabla of TABLAS_TASAS) {
      const { data } = await admin.from(tabla).select("*");
      backup[tabla] = data ?? [];
    }
  }

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `capiprom_backup_${ts}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
