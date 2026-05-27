import { createClient } from "@/lib/supabase-server";

export type Rol = "super_admin" | "admin" | "demo";

export interface Perfil {
  id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
}

export async function getPerfil(): Promise<Perfil | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("perfiles")
    .select("id, email, nombre, rol, activo")
    .eq("id", user.id)
    .single();

  return (data as Perfil) ?? null;
}

export async function tieneAAL2(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}
