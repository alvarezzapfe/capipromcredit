import { NextResponse } from "next/server";
import { requireRol } from "@/lib/require-rol";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const caller = await requireRol(["super_admin", "admin"]);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const creditoId = String(body.credito_id ?? "").trim();
  const motivo = String(body.motivo ?? "").trim();

  if (!creditoId) {
    return NextResponse.json({ error: "credito_id es requerido" }, { status: 400 });
  }
  if (motivo.length < 10) {
    return NextResponse.json(
      { error: "El motivo debe tener al menos 10 caracteres" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch the credit
  const { data: credito, error: fetchErr } = await admin
    .from("creditos")
    .select("id, folio, acreditado, monto, estatus")
    .eq("id", creditoId)
    .single();

  if (fetchErr || !credito) {
    return NextResponse.json({ error: "Crédito no encontrado" }, { status: 404 });
  }

  // Business rule: cannot delete liquidated credits (unless super_admin)
  if (credito.estatus === "liquidado" && caller.rol !== "super_admin") {
    return NextResponse.json(
      { error: "No se pueden eliminar créditos liquidados (auditoría regulatoria)" },
      { status: 400 }
    );
  }

  // Business rule: cannot delete credits with registered payments (unless super_admin)
  const { count: pagoCount } = await admin
    .from("amortizacion")
    .select("id", { count: "exact", head: true })
    .eq("credito_id", creditoId)
    .eq("pagado", true);

  if ((pagoCount ?? 0) > 0 && caller.rol !== "super_admin") {
    return NextResponse.json(
      {
        error:
          "No se pueden eliminar créditos con pagos registrados. Cambia el estatus a \"cancelado\" en su lugar.",
      },
      { status: 400 }
    );
  }

  // Write audit trail BEFORE deleting (bitacora has no FK to creditos, so it persists)
  await admin.from("bitacora").insert({
    entidad: "credito",
    entidad_id: credito.id,
    accion: "credito_eliminado",
    detalle: {
      folio: credito.folio,
      acreditado: credito.acreditado,
      monto: credito.monto,
      estatus_al_eliminar: credito.estatus,
      motivo,
      eliminado_por: caller.email,
      eliminado_por_rol: caller.rol,
      forzado: caller.rol === "super_admin" && ((pagoCount ?? 0) > 0 || credito.estatus === "liquidado"),
    },
    usuario: caller.email,
  });

  // Delete child rows explicitly (in case FK CASCADE is not set up)
  await admin.from("amortizacion").delete().eq("credito_id", creditoId);
  await admin.from("disposiciones").delete().eq("credito_id", creditoId);
  await admin.from("movimientos_linea").delete().eq("credito_id", creditoId);

  // Delete credit
  const { error: delErr } = await admin
    .from("creditos")
    .delete()
    .eq("id", creditoId);

  if (delErr) {
    return NextResponse.json(
      { error: "Error al eliminar: " + delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, folio: credito.folio });
}
