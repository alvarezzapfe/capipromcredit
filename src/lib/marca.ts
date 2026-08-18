import { cache } from "react";
import { createClient } from "@/lib/supabase-server";

// ── Tipo ──────────────────────────────────────────────────────────────
export type Marca = {
  nombre_empresa: string;
  nombre_corto: string;
  nombre_producto: string;
  logo_positivo_url: string | null;
  logo_negativo_url: string | null;
  isotipo_url: string | null;
  favicon_url: string | null;
  color_primario: string;
  color_acento: string;
  email_from: string;
};

// ── Fallback hardcodeado (valores actuales) ───────────────────────────
export const MARCA_FALLBACK: Marca = {
  nombre_empresa: "CapiProm",
  nombre_corto: "CapiProm",
  nombre_producto: "CapiProm Credit",
  logo_positivo_url: null,
  logo_negativo_url: null,
  isotipo_url: null,
  favicon_url: null,
  color_primario: "#0a1628",
  color_acento: "#c8a45c",
  email_from: "CapiProm Credit <accesos@plinius.mx>",
};

// ── Lectura de BD (server-only, cacheada por request) ─────────────────
export const getMarca = cache(async (): Promise<Marca> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("configuracion_marca")
      .select(
        "nombre_empresa, nombre_corto, nombre_producto, logo_positivo_url, logo_negativo_url, isotipo_url, favicon_url, color_primario, color_acento, email_from"
      )
      .eq("id", 1)
      .single();

    if (error || !data) return MARCA_FALLBACK;

    return {
      nombre_empresa: data.nombre_empresa ?? MARCA_FALLBACK.nombre_empresa,
      nombre_corto: data.nombre_corto ?? MARCA_FALLBACK.nombre_corto,
      nombre_producto: data.nombre_producto ?? MARCA_FALLBACK.nombre_producto,
      logo_positivo_url: data.logo_positivo_url,
      logo_negativo_url: data.logo_negativo_url,
      isotipo_url: data.isotipo_url,
      favicon_url: data.favicon_url,
      color_primario: data.color_primario ?? MARCA_FALLBACK.color_primario,
      color_acento: data.color_acento ?? MARCA_FALLBACK.color_acento,
      email_from: data.email_from ?? MARCA_FALLBACK.email_from,
    };
  } catch {
    return MARCA_FALLBACK;
  }
});
