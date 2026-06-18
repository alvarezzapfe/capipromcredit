export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

/** GET: lista respaldos del bucket + signed URLs */
export async function GET() {
  const auth = await requireRol(["super_admin", "admin"]);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: files, error } = await admin.storage
    .from("respaldos")
    .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate signed URLs for each file
  const items = [];
  for (const f of files ?? []) {
    if (!f.name || f.name.startsWith(".")) continue;
    const { data: signed } = await admin.storage
      .from("respaldos")
      .createSignedUrl(f.name, 3600);
    items.push({
      name: f.name,
      size: f.metadata?.size ?? 0,
      created_at: f.created_at,
      signedUrl: signed?.signedUrl ?? null,
    });
  }

  return NextResponse.json({ items });
}
